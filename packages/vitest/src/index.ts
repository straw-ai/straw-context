import {
  createContextManifest,
  evaluateContextContract,
  ExactDuplicationAnalyzer,
  OpenAITokenizer,
  SensitiveDataAnalyzer,
  TokenCompositionAnalyzer,
  TokenizerRegistry,
  ToolSchemaAnalyzer,
  type ContextAnalyzer,
  type ContextBaseline,
  type ContextContract,
  type ContextRequest,
} from '@straw-ai/sdk'
import { expect } from 'vitest'

export interface ContextContractMatcherOptions {
  readonly baseline?: ContextBaseline
  readonly tokenizers?: TokenizerRegistry
  readonly analyzers?: readonly ContextAnalyzer[]
}

function defaultTokenizers(): TokenizerRegistry {
  return new TokenizerRegistry().register(new OpenAITokenizer()).register({
    id: 'approx-characters-v1',
    priority: -100,
    accuracy: 'estimated',
    supports: () => true,
    count: (text) => Math.ceil(text.length / 4),
  })
}

function findingsMessage(
  contract: ContextContract,
  findings: readonly { title: string; message: string }[],
): string {
  if (findings.length === 0) return `expected context not to satisfy contract "${contract.name}"`
  return [
    `expected context to satisfy contract "${contract.name}"`,
    ...findings.map((finding) => `  - ${finding.title}: ${finding.message}`),
  ].join('\n')
}

export const contextMatchers = {
  async toMatchContextContract(
    received: ContextRequest,
    contract: ContextContract,
    options: ContextContractMatcherOptions = {},
  ) {
    const analyzers = options.analyzers ?? [
      new TokenCompositionAnalyzer(),
      new ExactDuplicationAnalyzer(),
      new ToolSchemaAnalyzer(),
      new SensitiveDataAnalyzer(contract.sensitiveData),
    ]
    const manifest = await createContextManifest(received, analyzers, {
      tokenizers: options.tokenizers ?? defaultTokenizers(),
    })
    const result = evaluateContextContract(
      manifest,
      contract,
      options.baseline ? { baseline: options.baseline } : {},
    )
    return {
      pass: result.passed,
      message: () => findingsMessage(contract, result.findings),
    }
  },
}

expect.extend(contextMatchers)

declare module 'vitest' {
  interface Assertion<T = any> {
    toMatchContextContract(
      contract: ContextContract,
      options?: ContextContractMatcherOptions,
    ): Promise<void>
  }
  interface AsymmetricMatchersContaining {
    toMatchContextContract(
      contract: ContextContract,
      options?: ContextContractMatcherOptions,
    ): Promise<void>
  }
}
