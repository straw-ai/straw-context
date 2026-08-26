import { type ContextAnalyzer } from '../../domain/context/analyzers.js'
import { createContextManifest, type ContextManifest } from '../../domain/context/manifests.js'
import { TokenizerRegistry } from '../../domain/context/tokenizers.js'
import {
  type CapturedRequest,
  type RequestCaptureHandler,
} from '../../infrastructure/capture/ProviderCapture.js'
import { OpenAITokenizer } from '../../infrastructure/tokenizers/OpenAITokenizer.js'
import { type ContextBaseline } from './baselines.js'
import {
  type ContextContract,
  type ContextContractResult,
  evaluateContextContract,
} from './contracts.js'
import { ExactDuplicationAnalyzer } from './ExactDuplicationAnalyzer.js'
import { SensitiveDataAnalyzer } from './SensitiveDataAnalyzer.js'
import { TokenCompositionAnalyzer } from './TokenCompositionAnalyzer.js'
import { ToolSchemaAnalyzer } from './ToolSchemaAnalyzer.js'

export interface CaptureContractEvaluation {
  readonly capture: CapturedRequest
  readonly manifest: ContextManifest
  readonly result: ContextContractResult
}

export interface CaptureFixtureWriter {
  readonly sanitize: (capture: CapturedRequest) => unknown | Promise<unknown>
  readonly write: (capture: CapturedRequest, sanitizedRequest: unknown) => void | Promise<void>
}

export interface ContractCaptureHandlerOptions {
  readonly contract:
    | ContextContract
    | ((capture: CapturedRequest) => ContextContract | Promise<ContextContract>)
  readonly baseline?:
    | ContextBaseline
    | ((
        capture: CapturedRequest,
      ) => ContextBaseline | undefined | Promise<ContextBaseline | undefined>)
  readonly tokenizers?: TokenizerRegistry
  readonly analyzers?: (capture: CapturedRequest) => readonly ContextAnalyzer[]
  readonly fixture?: CaptureFixtureWriter
  readonly onResult?: (evaluation: CaptureContractEvaluation) => void | Promise<void>
  readonly failOnViolation?: boolean
}

export class ContextContractViolationError extends Error {
  readonly evaluation: CaptureContractEvaluation

  constructor(evaluation: CaptureContractEvaluation) {
    super(
      `Context contract "${evaluation.result.contract}" failed with ${evaluation.result.findings.length} finding(s).`,
    )
    this.name = 'ContextContractViolationError'
    this.evaluation = evaluation
  }
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

function defaultAnalyzers(contract: ContextContract): readonly ContextAnalyzer[] {
  return [
    new TokenCompositionAnalyzer(),
    new ExactDuplicationAnalyzer(),
    new ToolSchemaAnalyzer(),
    new SensitiveDataAnalyzer(contract.sensitiveData),
  ]
}

/** Creates an `onCapture` callback that evaluates requests before provider calls are made. */
export function createContractCaptureHandler(
  options: ContractCaptureHandlerOptions,
): RequestCaptureHandler {
  const tokenizers = options.tokenizers ?? defaultTokenizers()
  return async (capture) => {
    const contract =
      typeof options.contract === 'function' ? await options.contract(capture) : options.contract
    const analyzers = options.analyzers?.(capture) ?? defaultAnalyzers(contract)
    const manifest = await createContextManifest(capture.request, analyzers, { tokenizers })
    const baseline =
      typeof options.baseline === 'function' ? await options.baseline(capture) : options.baseline
    const result = evaluateContextContract(manifest, contract, baseline ? { baseline } : {})
    const evaluation: CaptureContractEvaluation = Object.freeze({ capture, manifest, result })

    if (options.fixture) {
      const sanitized = await options.fixture.sanitize(capture)
      await options.fixture.write(capture, sanitized)
    }
    await options.onResult?.(evaluation)
    if (!result.passed && options.failOnViolation !== false) {
      throw new ContextContractViolationError(evaluation)
    }
  }
}
