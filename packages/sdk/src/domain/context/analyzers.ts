import { type ContextRequest } from './models.js'
import { type TokenizerRegistry } from './tokenizers.js'

export type FindingSeverity = 'info' | 'warning' | 'error'
export type FindingEvidence = 'deterministic' | 'estimated' | 'predicted' | 'observed'

export interface FindingLocation {
  readonly segmentId?: string
  readonly rawPath?: string
  readonly source?: string
}

export interface ContextFinding {
  readonly rule: string
  readonly severity: FindingSeverity
  readonly evidence: FindingEvidence
  readonly title: string
  readonly message: string
  readonly location?: FindingLocation
  readonly metrics?: Readonly<Record<string, number>>
}

export type AnalyzerMetric = string | number | boolean | null

export interface AnalyzerResult {
  readonly metrics?: Readonly<Record<string, AnalyzerMetric>>
  readonly componentMetrics?: Readonly<Record<string, Readonly<Record<string, AnalyzerMetric>>>>
  readonly findings?: readonly ContextFinding[]
}

export interface AnalysisContext {
  readonly tokenizers: TokenizerRegistry
}

export interface ContextAnalyzer {
  readonly id: string
  analyze(
    request: ContextRequest,
    context: AnalysisContext,
  ): AnalyzerResult | Promise<AnalyzerResult>
}
