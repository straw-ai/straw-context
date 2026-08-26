import { describe, expect, it } from 'vitest'

import {
  adaptOpenAIRequest,
  createContextManifest,
  TokenCompositionAnalyzer,
  TokenizerRegistry,
} from '../src/index.js'

describe('OpenAI context analysis', () => {
  it('annotates Responses API instructions, tools, messages, and tool results', () => {
    const raw = {
      model: 'gpt-test',
      instructions: 'Be concise.',
      tools: [{ type: 'function', name: 'search', parameters: { type: 'object' } }],
      input: [
        { role: 'user', content: 'Find the invoice.' },
        { type: 'function_call_output', call_id: 'call-1', output: '{"id":1}' },
      ],
    }

    const request = adaptOpenAIRequest(raw, { id: 'support-request' })

    expect(request.raw).toBe(raw)
    expect(request.target).toEqual({ provider: 'openai', model: 'gpt-test' })
    expect(request.segments.map(({ kind, rawPath }) => ({ kind, rawPath }))).toEqual([
      { kind: 'instruction', rawPath: '/instructions' },
      { kind: 'tool-definition', rawPath: '/tools/0' },
      { kind: 'message', rawPath: '/input/0' },
      { kind: 'tool-result', rawPath: '/input/1' },
    ])
  })

  it('supports Chat Completions message arrays', () => {
    const request = adaptOpenAIRequest({
      model: 'gpt-test',
      messages: [
        { role: 'system', content: 'Follow policy.' },
        { role: 'user', content: 'Hello' },
        { role: 'tool', content: '{"ok":true}', tool_call_id: 'call-1' },
      ],
    })

    expect(request.segments.map((segment) => segment.kind)).toEqual([
      'instruction',
      'message',
      'tool-result',
    ])
  })

  it('reports token composition by component and kind', async () => {
    const request = adaptOpenAIRequest({
      model: 'gpt-test',
      instructions: 'one two',
      tools: [{ type: 'function', name: 'search' }],
      input: 'three four five',
    })
    const tokenizers = new TokenizerRegistry().register({
      id: 'test-words',
      accuracy: 'high',
      supports: ({ provider, model }) => provider === 'openai' && model === 'gpt-test',
      count: (text) => text.split(/\s+/u).length,
    })

    const manifest = await createContextManifest(request, [new TokenCompositionAnalyzer()], {
      tokenizers,
    })

    expect(manifest.analyzers['tokens.composition']).toMatchObject({
      componentCount: 3,
      countedComponentCount: 3,
      accuracy: 'high',
      'tokens.instruction': 2,
      'tokens.message': 3,
    })
    expect(manifest.components[0]?.analyzers['tokens.composition']).toEqual({
      tokens: 2,
      tokenizer: 'test-words',
      accuracy: 'high',
    })
  })

  it('reports missing targets instead of guessing a tokenizer', async () => {
    const request = adaptOpenAIRequest({ input: 'hello' })
    const manifest = await createContextManifest(request, [new TokenCompositionAnalyzer()], {
      tokenizers: new TokenizerRegistry(),
    })

    expect(manifest.findings).toContainEqual(
      expect.objectContaining({ rule: 'tokens.target-missing', severity: 'warning' }),
    )
  })
})
