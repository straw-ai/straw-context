import { describe, expect, it } from 'vitest'

import {
  adaptOpenAIRequest,
  createContextManifest,
  ExactDuplicationAnalyzer,
  SensitiveDataAnalyzer,
  ToolSchemaAnalyzer,
  TokenizerRegistry,
} from '../src/index.js'

function registry(): TokenizerRegistry {
  return new TokenizerRegistry().register({
    id: 'characters',
    accuracy: 'estimated',
    supports: () => true,
    count: (text) => text.length,
  })
}

describe('deterministic context analyzers', () => {
  it('finds exact duplicate request components and estimates their waste', async () => {
    const request = adaptOpenAIRequest({
      model: 'gpt-test',
      input: [
        { role: 'user', content: 'This exact message is repeated.' },
        { role: 'user', content: 'This exact message is repeated.' },
        { role: 'user', content: 'Different.' },
      ],
    })
    const manifest = await createContextManifest(
      request,
      [new ExactDuplicationAnalyzer({ minCharacters: 1 })],
      { tokenizers: registry() },
    )

    expect(manifest.analyzers['duplication.exact']).toMatchObject({
      duplicateGroups: 1,
      duplicateComponents: 1,
      countedTokenGroups: 1,
    })
    expect(manifest.findings).toContainEqual(
      expect.objectContaining({
        rule: 'duplication.exact-component',
        location: expect.objectContaining({ segmentId: 'input:1' }),
      }),
    )
  })

  it('profiles nested Chat Completions tool definitions', async () => {
    const request = adaptOpenAIRequest({
      model: 'gpt-test',
      tools: [
        {
          type: 'function',
          function: { name: 'search', description: 'Search documents', parameters: {} },
        },
      ],
      messages: [],
    })
    const manifest = await createContextManifest(request, [new ToolSchemaAnalyzer()], {
      tokenizers: registry(),
    })

    expect(request.segments[0]?.id).toBe('tool:search:0')
    expect(manifest.analyzers['tools.schemas']).toMatchObject({
      toolCount: 1,
      namedToolCount: 1,
      countedToolCount: 1,
      largestToolId: 'tool:search:0',
    })
    expect(manifest.components[0]?.analyzers['tools.schemas']).toMatchObject({ name: 'search' })
  })

  it('rejects duplicate tool names and oversized schemas', async () => {
    const request = adaptOpenAIRequest({
      model: 'gpt-test',
      tools: [
        { type: 'function', name: 'search', description: 'First search implementation' },
        { type: 'function', name: 'search', description: 'Second search implementation' },
      ],
      input: 'hello',
    })
    const manifest = await createContextManifest(
      request,
      [new ToolSchemaAnalyzer({ maxTokensPerTool: 10 })],
      { tokenizers: registry() },
    )

    expect(manifest.findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(['tools.duplicate-name', 'tools.schema-budget']),
    )
  })

  it('retains character profiling without a tokenizer target', async () => {
    const request = adaptOpenAIRequest({
      tools: [{ type: 'function', name: 'search', description: 'Search documents' }],
      input: 'hello',
    })
    const manifest = await createContextManifest(request, [new ToolSchemaAnalyzer()], {
      tokenizers: new TokenizerRegistry(),
    })

    expect(manifest.analyzers['tools.schemas']).toMatchObject({
      toolCount: 1,
      countedToolCount: 0,
    })
    expect(manifest.components[0]?.analyzers['tools.schemas']).toMatchObject({
      name: 'search',
      characters: expect.any(Number),
    })
  })

  it('detects configured paths and high-confidence secrets without retaining values', async () => {
    const secret = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456'
    const request = adaptOpenAIRequest({
      model: 'gpt-test',
      input: { role: 'user', metadata: { customerId: '42', token: secret } },
    })
    const manifest = await createContextManifest(
      request,
      [new SensitiveDataAnalyzer({ forbiddenPaths: ['**.customerId'] })],
      { tokenizers: registry() },
    )

    expect(manifest.analyzers['security.input']).toMatchObject({
      forbiddenPathMatches: 1,
      secretMatches: 1,
      matches: 2,
    })
    expect(manifest.findings.map((finding) => finding.rule)).toEqual([
      'security.forbidden-path',
      'security.secret',
    ])
    expect(JSON.stringify(manifest.findings)).not.toContain(secret)
  })
})
