export interface OpenAIResponsesClient {
  readonly responses: {
    create(request: Record<string, unknown>): Promise<{ id: string }>
  }
}

export function buildSupportRequest(question: string): Record<string, unknown> {
  return {
    model: 'gpt-4o',
    instructions: 'Answer support questions using read-only tools. Never modify customer data.',
    tools: [
      {
        type: 'function',
        name: 'get_ticket',
        description: 'Retrieve one support ticket by identifier.',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    ],
    input: question,
  }
}

export async function answerSupportQuestion(
  client: OpenAIResponsesClient,
  question: string,
): Promise<{ id: string }> {
  return client.responses.create(buildSupportRequest(question))
}
