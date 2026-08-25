import {
  type AnalyzerMetric,
  type AnalyzerResult,
  type AnalysisContext,
  type ContextAnalyzer,
  type ContextFinding,
} from '../../domain/context/analyzers.js'
import {
  type ContextRequest,
  type ContextSegment,
  type ContextSegmentKind,
} from '../../domain/context/models.js'
import { serializeContextSegment } from '../../domain/context/serialization.js'
import { type TokenEstimateAccuracy } from '../../domain/context/tokenizers.js'

export type SegmentSerializer = (segment: ContextSegment) => string

export interface TokenCompositionAnalyzerOptions {
  readonly serialize?: SegmentSerializer
}

export const TOKEN_COMPOSITION_ANALYZER_ID = 'tokens.composition'

const accuracyRank: Record<TokenEstimateAccuracy, number> = {
  exact: 0,
  high: 1,
  estimated: 2,
}

/** Estimates the token footprint of each annotated request component. */
export class TokenCompositionAnalyzer implements ContextAnalyzer {
  public readonly id = TOKEN_COMPOSITION_ANALYZER_ID
  private readonly serialize: SegmentSerializer

  constructor(options: TokenCompositionAnalyzerOptions = {}) {
    this.serialize = options.serialize ?? serializeContextSegment
  }

  public async analyze(request: ContextRequest, context: AnalysisContext): Promise<AnalyzerResult> {
    if (!request.target) {
      return {
        findings: [
          {
            rule: 'tokens.target-missing',
            severity: 'warning',
            evidence: 'deterministic',
            title: 'Model target is missing',
            message: 'Token composition requires a provider and model target.',
          },
        ],
      }
    }

    const findings: ContextFinding[] = []
    const componentMetrics: Record<string, Record<string, AnalyzerMetric>> = {}
    const totalsByKind = new Map<ContextSegmentKind, number>()
    let total = 0
    let aggregateAccuracy: TokenEstimateAccuracy = 'exact'

    for (const segment of request.segments) {
      try {
        const estimate = await context.tokenizers.count(this.serialize(segment), request.target)
        total += estimate.tokens
        totalsByKind.set(segment.kind, (totalsByKind.get(segment.kind) ?? 0) + estimate.tokens)
        if (accuracyRank[estimate.accuracy] > accuracyRank[aggregateAccuracy]) {
          aggregateAccuracy = estimate.accuracy
        }
        componentMetrics[segment.id] = {
          tokens: estimate.tokens,
          tokenizer: estimate.tokenizer,
          accuracy: estimate.accuracy,
        }
      } catch (error) {
        findings.push({
          rule: 'tokens.component-unavailable',
          severity: 'warning',
          evidence: 'deterministic',
          title: 'Component token count unavailable',
          message: error instanceof Error ? error.message : String(error),
          location: {
            segmentId: segment.id,
            rawPath: segment.rawPath,
            ...(segment.source ? { source: segment.source } : {}),
          },
        })
      }
    }

    const metrics: Record<string, AnalyzerMetric> = {
      componentCount: request.segments.length,
      countedComponentCount: Object.keys(componentMetrics).length,
      componentTokens: total,
      accuracy: aggregateAccuracy,
    }
    for (const [kind, tokens] of totalsByKind) {
      metrics[`tokens.${kind}`] = tokens
    }

    return { metrics, componentMetrics, findings }
  }
}
