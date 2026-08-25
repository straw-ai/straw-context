import {
  type AnalyzerMetric,
  type AnalyzerResult,
  type AnalysisContext,
  type ContextAnalyzer,
  type ContextFinding,
} from '../../domain/context/analyzers.js'
import { type ContextRequest, type ContextSegment } from '../../domain/context/models.js'
import { serializeContextSegment } from '../../domain/context/serialization.js'

export interface ExactDuplicationAnalyzerOptions {
  /** Ignore serialized components shorter than this many characters. @default 32 */
  readonly minCharacters?: number
  readonly serialize?: (segment: ContextSegment) => string
}

export const EXACT_DUPLICATION_ANALYZER_ID = 'duplication.exact'

/** Finds components whose serialized content is byte-for-byte identical. */
export class ExactDuplicationAnalyzer implements ContextAnalyzer {
  public readonly id = EXACT_DUPLICATION_ANALYZER_ID
  private readonly minCharacters: number
  private readonly serialize: (segment: ContextSegment) => string

  constructor(options: ExactDuplicationAnalyzerOptions = {}) {
    this.minCharacters = options.minCharacters ?? 32
    if (!Number.isSafeInteger(this.minCharacters) || this.minCharacters < 0) {
      throw new TypeError('minCharacters must be a non-negative safe integer.')
    }
    this.serialize = options.serialize ?? serializeContextSegment
  }

  public async analyze(request: ContextRequest, context: AnalysisContext): Promise<AnalyzerResult> {
    const groups = new Map<string, ContextSegment[]>()
    for (const segment of request.segments) {
      const serialized = this.serialize(segment)
      if (serialized.length < this.minCharacters) continue
      const group = groups.get(serialized)
      if (group) group.push(segment)
      else groups.set(serialized, [segment])
    }

    const findings: ContextFinding[] = []
    let duplicateGroups = 0
    let duplicateComponents = 0
    let duplicateCharacters = 0
    let duplicateTokens = 0
    let countedTokenGroups = 0

    for (const [serialized, segments] of groups) {
      if (segments.length < 2) continue
      duplicateGroups += 1
      duplicateComponents += segments.length - 1
      duplicateCharacters += serialized.length * (segments.length - 1)

      if (request.target) {
        try {
          const estimate = await context.tokenizers.count(serialized, request.target)
          duplicateTokens += estimate.tokens * (segments.length - 1)
          countedTokenGroups += 1
        } catch {
          // Character metrics and deterministic findings remain useful without a tokenizer.
        }
      }

      const original = segments[0]
      if (!original) continue
      for (const duplicate of segments.slice(1)) {
        findings.push({
          rule: 'duplication.exact-component',
          severity: 'warning',
          evidence: 'deterministic',
          title: 'Exact duplicate context component',
          message: `Component "${duplicate.id}" duplicates "${original.id}".`,
          location: {
            segmentId: duplicate.id,
            rawPath: duplicate.rawPath,
            ...(duplicate.source ? { source: duplicate.source } : {}),
          },
          metrics: { characters: serialized.length },
        })
      }
    }

    const metrics: Record<string, AnalyzerMetric> = {
      duplicateGroups,
      duplicateComponents,
      duplicateCharacters,
      ...(countedTokenGroups > 0 ? { duplicateTokens, countedTokenGroups } : {}),
    }

    return { metrics, findings }
  }
}
