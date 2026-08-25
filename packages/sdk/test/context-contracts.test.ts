import { describe, expect, it } from 'vitest'

import {
  adaptOpenAIRequest,
  createContextBaseline,
  createContextManifest,
  diffContextManifest,
  evaluateContextContract,
  ExactDuplicationAnalyzer,
  parseContextBaseline,
  parseContextContract,
  TokenCompositionAnalyzer,
  TokenizerRegistry,
  ToolSchemaAnalyzer,
} from '../src/index.js'

function registry(): TokenizerRegistry {
  return new TokenizerRegistry().register({
    id: 'characters',
    accuracy: 'estimated',
    supports: () => true,
    count: (text) => text.length,
  })
}

async function manifest(
  input: string,
  toolDescription = 'Search',
): Promise<Awaited<ReturnType<typeof createContextManifest>>> {
  const request = adaptOpenAIRequest({
    model: 'gpt-test',
    tools: [{ type: 'function', name: 'search', description: toolDescription }],
    input,
  })
  return createContextManifest(request, [new TokenCompositionAnalyzer()], {
    tokenizers: registry(),
  })
}

describe('context contracts and baselines', () => {
  it('creates content-free baselines', async () => {
    const current = await manifest('private customer message')
    const baseline = createContextBaseline(current)

    expect(JSON.stringify(baseline)).not.toContain('private customer message')
    expect(baseline.metrics.componentTokens).toBeTypeOf('number')
    expect(baseline.components).toHaveLength(2)
  })

  it('attributes token changes to kinds and components', async () => {
    const before = createContextBaseline(await manifest('short'))
    const after = await manifest('a much longer message', 'Search public documents carefully')
    const diff = diffContextManifest(before, after)

    expect(diff.componentTokens?.absolute).toBeGreaterThan(0)
    expect(diff.tokensByKind.message?.absolute).toBeGreaterThan(0)
    expect(diff.tokensByKind['tool-definition']?.absolute).toBeGreaterThan(0)
    expect(diff.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'input', status: 'changed' }),
        expect.objectContaining({ id: 'tool:search:0', status: 'changed' }),
      ]),
    )
  })

  it('fails total and per-kind token budgets', async () => {
    const current = await manifest('long user request')
    const result = evaluateContextContract(current, {
      name: 'support-agent',
      tokens: {
        maxComponentTokens: 10,
        byKind: { message: 5 },
      },
    })

    expect(result.passed).toBe(false)
    expect(result.findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(['contract.tokens.total-budget', 'contract.tokens.message-budget']),
    )
  })

  it('enforces regression thresholds against a baseline', async () => {
    const baseline = createContextBaseline(await manifest('small'))
    const current = await manifest('this request grew substantially')
    const result = evaluateContextContract(
      current,
      {
        name: 'support-agent',
        regression: { maxIncrease: 5, maxIncreasePercent: 10 },
      },
      { baseline },
    )

    expect(result.passed).toBe(false)
    expect(result.findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(['contract.regression.absolute', 'contract.regression.percent']),
    )
  })

  it('fails closed when a required baseline is missing', async () => {
    const current = await manifest('hello')
    const result = evaluateContextContract(current, {
      name: 'support-agent',
      regression: { maxIncreasePercent: 10 },
    })

    expect(result.passed).toBe(false)
    expect(result.findings[0]?.rule).toBe('contract.baseline-missing')
  })

  it('detects content changes whose token count is unchanged', async () => {
    const baseline = createContextBaseline(await manifest('cat'))
    const current = await manifest('dog')
    const diff = diffContextManifest(baseline, current)

    expect(diff.componentTokens?.absolute).toBe(0)
    const changed = diff.components.find((component) => component.id === 'input')
    expect(changed).toMatchObject({ id: 'input', status: 'changed', contentChanged: true })
    expect(changed?.structureChanged).toBeUndefined()
  })

  it('validates serialized contracts and baselines', async () => {
    const contract = parseContextContract({
      name: 'support-agent',
      tokens: { maxComponentTokens: 100, byKind: { message: 20 } },
    })
    const baseline = createContextBaseline(await manifest('hello'))

    expect(contract.name).toBe('support-agent')
    expect(parseContextBaseline(JSON.parse(JSON.stringify(baseline)))).toEqual(baseline)
    expect(() =>
      parseContextContract({ name: 'bad', tokens: { byKind: { invalid: 10 } } }),
    ).toThrow('unknown context segment kind')
    expect(() => parseContextContract({ name: 'bad', tokenz: {} })).toThrow('unknown property')
  })

  it('rejects regression comparisons across model targets', async () => {
    const baseline = createContextBaseline(await manifest('before'))
    const request = adaptOpenAIRequest({ model: 'another-model', input: 'after' })
    const current = await createContextManifest(request, [new TokenCompositionAnalyzer()], {
      tokenizers: registry(),
    })
    const result = evaluateContextContract(
      current,
      { name: 'support-agent', regression: { maxIncreasePercent: 10 } },
      { baseline },
    )

    expect(result.findings).toContainEqual(
      expect.objectContaining({ rule: 'contract.baseline-target-mismatch' }),
    )
  })

  it('fails CI on error findings produced by analyzers', async () => {
    const current = await manifest('hello')
    const withError = {
      ...current,
      findings: [
        {
          rule: 'security.secret',
          severity: 'error' as const,
          evidence: 'deterministic' as const,
          title: 'Likely secret included',
          message: 'A secret was found; the value is not retained.',
        },
      ],
    }

    expect(evaluateContextContract(withError, { name: 'secure-agent' })).toMatchObject({
      passed: false,
      findings: [expect.objectContaining({ rule: 'security.secret' })],
    })
  })

  it('validates sensitive-data policy configuration', () => {
    expect(
      parseContextContract({
        name: 'secure-agent',
        sensitiveData: { forbiddenPaths: ['**.customerId'], detectSecrets: true },
      }).sensitiveData,
    ).toEqual({ forbiddenPaths: ['**.customerId'], detectSecrets: true })
    expect(() =>
      parseContextContract({ name: 'bad', sensitiveData: { detectSecrets: 'yes' } }),
    ).toThrow('expected a boolean')
  })

  it('enforces tool allowlists and count limits', async () => {
    const request = adaptOpenAIRequest({
      model: 'gpt-test',
      tools: [
        { type: 'function', name: 'search' },
        { type: 'function', name: 'delete_account' },
      ],
      input: 'hello',
    })
    const current = await createContextManifest(request, [new ToolSchemaAnalyzer()], {
      tokenizers: registry(),
    })
    const result = evaluateContextContract(current, {
      name: 'safe-tools',
      tools: { maxCount: 1, required: ['lookup'], forbidden: ['delete_account'] },
    })

    expect(result.findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining([
        'contract.tools.max-count',
        'contract.tools.required',
        'contract.tools.forbidden',
      ]),
    )
  })

  it('enforces duplicate component and token limits', async () => {
    const repeated = 'This repeated context is deliberately longer than thirty-two characters.'
    const request = adaptOpenAIRequest({ model: 'gpt-test', input: [repeated, repeated] })
    const current = await createContextManifest(request, [new ExactDuplicationAnalyzer()], {
      tokenizers: registry(),
    })
    const result = evaluateContextContract(current, {
      name: 'no-waste',
      duplication: { maxDuplicateComponents: 0, maxDuplicateTokens: 0 },
    })

    expect(result.findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(['contract.duplication.components', 'contract.duplication.tokens']),
    )
  })

  it('enforces structural changes against a baseline', async () => {
    const beforeRequest = adaptOpenAIRequest({ model: 'gpt-test', input: { content: 'hello' } })
    const afterRequest = adaptOpenAIRequest({
      model: 'gpt-test',
      input: { content: 'hello', metadata: { source: 'crm' } },
    })
    const before = await createContextManifest(beforeRequest, [new TokenCompositionAnalyzer()], {
      tokenizers: registry(),
    })
    const after = await createContextManifest(afterRequest, [new TokenCompositionAnalyzer()], {
      tokenizers: registry(),
    })
    const result = evaluateContextContract(
      after,
      { name: 'stable-shape', structure: { maxChanged: 0 } },
      { baseline: createContextBaseline(before) },
    )

    expect(result.findings).toContainEqual(
      expect.objectContaining({ rule: 'contract.structure.changed' }),
    )
  })

  it('parses advanced CI policies', () => {
    const contract = parseContextContract({
      name: 'agent-policy',
      tools: { maxCount: 8, required: ['search'], forbidden: ['shell'] },
      duplication: { maxDuplicateComponents: 1, maxDuplicateTokens: 50 },
      structure: { maxAdded: 1, maxRemoved: 0, maxChanged: 0 },
    })

    expect(contract.tools?.required).toEqual(['search'])
    expect(contract.duplication?.maxDuplicateTokens).toBe(50)
    expect(contract.structure?.maxRemoved).toBe(0)
  })
})
