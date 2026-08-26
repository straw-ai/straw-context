import { describe, expect, it } from 'vitest'

import {
  createContextManifest,
  createContextRequest,
  TokenizerNotFoundError,
  TokenizerRegistry,
  type ContextAnalyzer,
} from '../src/index.js'

describe('context analysis architecture', () => {
  it('creates an immutable annotated view without freezing the raw request', () => {
    const raw = { input: 'hello' }
    const request = createContextRequest({
      id: 'request-1',
      raw,
      segments: [
        {
          id: 'input-0',
          kind: 'message',
          encoding: 'text',
          rawPath: '/input',
          value: raw.input,
        },
      ],
    })

    expect(Object.isFrozen(request)).toBe(true)
    expect(Object.isFrozen(request.segments)).toBe(true)
    expect(Object.isFrozen(request.segments[0])).toBe(true)
    expect(Object.isFrozen(raw)).toBe(false)
    expect(request.raw).toBe(raw)
  })

  it('rejects duplicate segment identifiers', () => {
    expect(() =>
      createContextRequest({
        id: 'request-1',
        raw: {},
        segments: [
          { id: 'duplicate', kind: 'message', encoding: 'text', rawPath: '/a', value: 'a' },
          { id: 'duplicate', kind: 'message', encoding: 'text', rawPath: '/b', value: 'b' },
        ],
      }),
    ).toThrow('Duplicate context segment id')
  })

  it('selects user-provided tokenizers by support and priority', async () => {
    const registry = new TokenizerRegistry()
      .register({
        id: 'generic-estimate',
        priority: 0,
        supports: () => true,
        count: (text) => Math.ceil(text.length / 4),
      })
      .register({
        id: 'custom-exact',
        priority: 10,
        accuracy: 'exact',
        supports: ({ provider, model }) => provider === 'acme' && model === 'model-1',
        count: async (text) => text.split(/\s+/u).length,
      })

    await expect(
      registry.count('one two three', { provider: 'acme', model: 'model-1' }),
    ).resolves.toEqual({
      tokens: 3,
      tokenizer: 'custom-exact',
      accuracy: 'exact',
    })
  })

  it('fails explicitly when no tokenizer supports the model', async () => {
    const registry = new TokenizerRegistry()

    await expect(
      registry.count('hello', { provider: 'acme', model: 'missing' }),
    ).rejects.toBeInstanceOf(TokenizerNotFoundError)
  })

  it('combines analyzer output into a stable manifest', async () => {
    const request = createContextRequest({
      id: 'request-1',
      raw: { tools: [{ name: 'search' }] },
      target: { provider: 'acme', model: 'model-1' },
      segments: [
        {
          id: 'tool-search',
          kind: 'tool-definition',
          encoding: 'json',
          rawPath: '/tools/0',
          source: 'src/tools/search.ts',
          value: { name: 'search' },
        },
      ],
    })
    const analyzer: ContextAnalyzer = {
      id: 'tools.summary',
      analyze: (input) => ({
        metrics: { count: input.segments.length },
        findings: [
          {
            rule: 'tools.present',
            severity: 'info',
            evidence: 'deterministic',
            title: 'Tool definitions found',
            message: 'The request contains one tool definition.',
          },
        ],
      }),
    }

    const manifest = await createContextManifest(request, [analyzer], {
      tokenizers: new TokenizerRegistry(),
    })

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      requestId: 'request-1',
      target: { provider: 'acme', model: 'model-1' },
      analyzers: { 'tools.summary': { count: 1 } },
      components: [
        {
          id: 'tool-search',
          kind: 'tool-definition',
          rawPath: '/tools/0',
          source: 'src/tools/search.ts',
          analyzers: {},
        },
      ],
    })
    expect(manifest.findings).toHaveLength(1)
    expect(Object.isFrozen(manifest)).toBe(true)
  })
})
