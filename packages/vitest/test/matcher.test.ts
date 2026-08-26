import { adaptOpenAIRequest } from '@straw-ai/context'
import { describe, expect, it } from 'vitest'

import '../src/index.js'

describe('toMatchContextContract', () => {
  it('passes for a request that satisfies its contract', async () => {
    const request = adaptOpenAIRequest({
      model: 'gpt-test',
      tools: [{ type: 'function', name: 'search' }],
      input: 'Hello',
    })

    await expect(request).toMatchContextContract({
      name: 'read-only',
      tools: { required: ['search'], forbidden: ['delete_account'] },
    })
  })

  it('shows contract findings when a request fails', async () => {
    const request = adaptOpenAIRequest({
      model: 'gpt-test',
      tools: [{ type: 'function', name: 'delete_account' }],
      input: 'Hello',
    })

    await expect(
      expect(request).toMatchContextContract({
        name: 'read-only',
        tools: { forbidden: ['delete_account'] },
      }),
    ).rejects.toThrow('Forbidden tool is exposed')
  })
})
