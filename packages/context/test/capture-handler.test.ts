import { describe, expect, it, vi } from 'vitest'

import {
  captureOpenAIClient,
  ContextContractViolationError,
  createContractCaptureHandler,
  type CaptureContractEvaluation,
} from '../src/index.js'

describe('contract capture handler', () => {
  it('evaluates a captured request entirely in memory', async () => {
    const evaluations: CaptureContractEvaluation[] = []
    const create = vi.fn(async (_request: unknown) => ({ id: 'response-1' }))
    const client = captureOpenAIClient(
      { responses: { create } },
      {
        onCapture: createContractCaptureHandler({
          contract: { name: 'read-only', tools: { forbidden: ['delete_account'] } },
          onResult: (evaluation) => evaluations.push(evaluation),
        }),
      },
    )

    await client.responses.create({ model: 'gpt-test', input: 'Hello' })

    expect(create).toHaveBeenCalledOnce()
    expect(evaluations[0]?.result.passed).toBe(true)
    expect(evaluations[0]?.manifest.requestId).toBe('openai.responses.create')
  })

  it('blocks the provider when a captured request violates its contract', async () => {
    const create = vi.fn(async (_request: unknown) => ({ id: 'response-1' }))
    const client = captureOpenAIClient(
      { responses: { create } },
      {
        onCapture: createContractCaptureHandler({
          contract: { name: 'read-only', tools: { forbidden: ['delete_account'] } },
        }),
      },
    )

    await expect(
      client.responses.create({
        model: 'gpt-test',
        tools: [{ type: 'function', name: 'delete_account' }],
        input: 'Hello',
      }),
    ).rejects.toBeInstanceOf(ContextContractViolationError)
    expect(create).not.toHaveBeenCalled()
  })

  it('writes only the value returned by an explicit sanitizer', async () => {
    const write = vi.fn()
    const client = captureOpenAIClient(
      { responses: { create: vi.fn(async (_request: unknown) => ({ id: 'response-1' })) } },
      {
        onCapture: createContractCaptureHandler({
          contract: { name: 'capture' },
          fixture: {
            sanitize: ({ request }) => ({ model: request.target?.model, input: '[redacted]' }),
            write,
          },
        }),
      },
    )

    await client.responses.create({ model: 'gpt-test', input: 'private message' })

    expect(write).toHaveBeenCalledWith(expect.anything(), {
      model: 'gpt-test',
      input: '[redacted]',
    })
    expect(JSON.stringify(write.mock.calls[0]?.[1])).not.toContain('private message')
  })
})
