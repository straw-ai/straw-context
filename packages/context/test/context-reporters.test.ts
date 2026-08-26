import { describe, expect, it } from 'vitest'

import {
  adaptOpenAIRequest,
  createContextBaseline,
  createContextManifest,
  diffContextManifest,
  evaluateContextContract,
  ExactDuplicationAnalyzer,
  renderContextDiff,
  renderContextContractResult,
  renderContextManifest,
  TokenCompositionAnalyzer,
  TokenizerRegistry,
  ToolSchemaAnalyzer,
} from '../src/index.js'

const tokenizers = new TokenizerRegistry().register({
  id: 'characters',
  accuracy: 'estimated',
  supports: () => true,
  count: (text) => text.length,
})

async function inspect(input: string) {
  const request = adaptOpenAIRequest({
    model: 'gpt-test',
    tools: [{ type: 'function', name: 'search', description: 'Search documents' }],
    input,
  })
  return createContextManifest(
    request,
    [new TokenCompositionAnalyzer(), new ExactDuplicationAnalyzer(), new ToolSchemaAnalyzer()],
    { tokenizers },
  )
}

describe('terminal context reporters', () => {
  it('renders a readable manifest summary', async () => {
    const output = renderContextManifest(await inspect('Find the invoice'))

    expect(output).toContain('Straw Context Report')
    expect(output).toContain('Target:  openai/gpt-test')
    expect(output).toContain('Estimated component tokens:')
    expect(output).toContain('tool-definition')
    expect(output).toContain('Tools: 1')
  })

  it('renders attributed baseline changes', async () => {
    const baseline = createContextBaseline(await inspect('short'))
    const current = await inspect('this input is considerably longer')
    const output = renderContextDiff(diffContextManifest(baseline, current))

    expect(output).toContain('Straw Context Diff')
    expect(output).toContain('Composition changes')
    expect(output).toContain('message')
    expect(output).toContain('CHANGED')
  })

  it('renders contract failures', async () => {
    const current = await inspect('Find the invoice')
    const result = evaluateContextContract(current, {
      name: 'support-agent',
      tokens: { maxComponentTokens: 1 },
    })
    const output = renderContextContractResult(result)

    expect(output).toContain('Contract: support-agent')
    expect(output).toContain('Result:   FAIL')
    expect(output).toContain('Context token budget exceeded')
  })
})
