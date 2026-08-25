import { describe, expect, it, vi } from 'vitest'

import { captureAnthropicClient, captureOpenAIClient, type CapturedRequest } from '../src/index.js'

describe('provider request capture', () => {
  it('captures OpenAI Responses before forwarding the original call', async () => {
    const events: string[] = []
    const create = vi.fn(async (_request: unknown) => {
      events.push('provider')
      return { id: 'response-1' }
    })
    const captures: CapturedRequest[] = []
    const client = captureOpenAIClient(
      { responses: { create }, untouched: 'value' },
      {
        onCapture: (capture) => {
          events.push('capture')
          captures.push(capture)
        },
      },
    )
    const raw = { model: 'gpt-test', input: 'Hello' }

    await client.responses.create(raw)

    expect(events).toEqual(['capture', 'provider'])
    expect(create).toHaveBeenCalledWith(raw)
    expect(client.untouched).toBe('value')
    expect(captures[0]).toMatchObject({
      provider: 'openai',
      operation: 'responses.create',
      request: { raw, target: { provider: 'openai', model: 'gpt-test' } },
    })
  })

  it('captures OpenAI Chat Completions', async () => {
    const captures: CapturedRequest[] = []
    const client = captureOpenAIClient(
      { chat: { completions: { create: vi.fn(async (_request: unknown) => ({ id: 'chat-1' })) } } },
      { onCapture: (capture) => captures.push(capture) },
    )

    await client.chat.completions.create({ model: 'gpt-test', messages: [] })

    expect(captures[0]?.operation).toBe('chat.completions.create')
  })

  it('captures Anthropic Messages and forwards the result', async () => {
    const captures: CapturedRequest[] = []
    const client = captureAnthropicClient(
      { messages: { create: vi.fn(async (_request: unknown) => ({ id: 'message-1' })) } },
      { onCapture: (capture) => captures.push(capture) },
    )

    const response = await client.messages.create({
      model: 'claude-test',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    expect(response).toEqual({ id: 'message-1' })
    expect(captures[0]).toMatchObject({
      provider: 'anthropic',
      operation: 'messages.create',
      request: { target: { provider: 'anthropic', model: 'claude-test' } },
    })
  })

  it('does not call the provider when capture policy rejects the request', async () => {
    const create = vi.fn(async (_request: unknown) => ({ id: 'response-1' }))
    const client = captureOpenAIClient(
      { responses: { create } },
      { onCapture: () => Promise.reject(new Error('context policy failed')) },
    )

    await expect(client.responses.create({ model: 'gpt-test', input: 'Hello' })).rejects.toThrow(
      'context policy failed',
    )
    expect(create).not.toHaveBeenCalled()
  })
})
