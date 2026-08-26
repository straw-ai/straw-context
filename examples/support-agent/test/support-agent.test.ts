import {
  adaptOpenAIRequest,
  captureOpenAIClient,
  createContractCaptureHandler,
  type ContextRequest,
} from '@straw-ai/context'
import { describe, expect, it } from 'vitest'
import '@straw-ai/vitest'
import { createFakeOpenAI } from '../src/fake-openai.js'
import { supportContract } from '../src/policy.js'
import { answerSupportQuestion, buildSupportRequest } from '../src/support-agent.js'

describe('support agent context', () => {
  it('matches its context contract without calling a provider', async () => {
    const request = adaptOpenAIRequest(buildSupportRequest('Summarize ticket TKT-123.'))

    await expect(request).toMatchContextContract(supportContract)
  })

  it('checks the exact request assembled by the integration flow', async () => {
    let captured: ContextRequest | undefined
    const client = captureOpenAIClient(createFakeOpenAI(), {
      onCapture: createContractCaptureHandler({
        contract: supportContract,
        onResult: ({ capture }) => {
          captured = capture.request
        },
      }),
    })

    const response = await answerSupportQuestion(client, 'Summarize ticket TKT-123.')

    expect(response.id).toBe('fake-response')
    expect(captured).toBeDefined()
    await expect(captured as ContextRequest).toMatchContextContract(supportContract)
  })
})
