import { describe, expect, it } from 'vitest'

import { OpenAITokenizer, TokenizerRegistry } from '../src/index.js'

describe('OpenAI tokenizer', () => {
  it('counts known OpenAI model text with js-tiktoken', async () => {
    const registry = new TokenizerRegistry().register(new OpenAITokenizer())

    await expect(
      registry.count('hello world', { provider: 'openai', model: 'gpt-4o' }),
    ).resolves.toEqual({
      tokens: 2,
      tokenizer: 'openai-js-tiktoken',
      accuracy: 'high',
    })
  })

  it('uses o200k_base for newer unrecognized OpenAI model names', async () => {
    const registry = new TokenizerRegistry().register(new OpenAITokenizer())
    const result = await registry.count('hello world', {
      provider: 'openai',
      model: 'gpt-future-model',
    })

    expect(result.tokens).toBe(2)
    expect(result.accuracy).toBe('high')
  })
})
