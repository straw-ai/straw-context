import { type OpenAIResponsesClient } from './support-agent.js'

export function createFakeOpenAI(): OpenAIResponsesClient {
  return {
    responses: {
      create: async () => ({ id: 'fake-response' }),
    },
  }
}
