import { type ContextContract } from '@straw-ai/context'

export const supportContract: ContextContract = {
  name: 'support-read-only',
  tokens: {
    maxComponentTokens: 500,
    byKind: { 'tool-definition': 250 },
  },
  tools: {
    maxCount: 3,
    required: ['get_ticket'],
    forbidden: ['delete_account', 'issue_refund'],
  },
  duplication: { maxDuplicateComponents: 0 },
  sensitiveData: {
    forbiddenPaths: ['**.ssn', '**.authorization'],
    detectSecrets: true,
  },
}
