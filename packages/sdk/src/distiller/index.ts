import { scrub, truncate, formatToDMD } from './engines.js'
import { identifyInput, tryParseJSON, deduplicateLines } from './preprocessor.js'
import type { DistillOptions, DistillResult } from './types.js'

export * from './types.js'
export { presets } from './presets.js'

export class ContextDistiller {
  static distill(input: any, options: DistillOptions = {}): DistillResult {
    const start = Date.now()
    const reverseMap = new Map<string, string>()

    // 1. Input Guard: Normalize Input
    let processed = input
    const guardEnabled = options.enableInputGuard !== false

    if (guardEnabled) {
      const type = identifyInput(input)
      if (type === 'unstructured') {
        processed = deduplicateLines(input as string, options.dedupe)
      }

      // Transition unstructured string to structured pipeline if it's valid JSON
      if (typeof processed === 'string') {
        const parsed = tryParseJSON(processed)
        if (parsed) {
          processed = parsed
        } else {
          // It's pure plain text, return early with minimal processing
          const distilledText = deduplicateLines(processed, options.dedupe)
          return this.createResult(input, distilledText, reverseMap, start)
        }
      }
    }

    // 2. Initial Statistics
    const originalTokens = this.estimateTokens(processed)

    // 3. Transformation Pipeline
    // Engine A/C/E: (Scrub + Alias + Date)
    processed = scrub(
      processed,
      { ...options, aliasIds: options.enableAliasing !== false },
      reverseMap,
    )

    // Engine B: Truncator (Applied recursively)
    processed = this.recursiveTruncate(processed, options.maxStringLength ?? 1000)

    // Engine D: Formatter
    const contextString = formatToDMD(processed, {
      tableifyArrays: options.tableifyArrays ?? true,
      tableifyThreshold: options.tableifyThreshold ?? 3,
    })

    return this.createResult(input, contextString, reverseMap, start, originalTokens)
  }

  private static createResult(
    originalInput: any,
    distilledString: string,
    reverseMap: Map<string, string>,
    startTime: number,
    cachedOriginalTokens?: number,
  ): DistillResult {
    const originalTokens = cachedOriginalTokens ?? this.estimateTokens(originalInput)
    const distilledTokens = this.estimateTokens(distilledString)

    return {
      contextString: distilledString,
      reverseMap,
      stats: {
        originalTokens,
        distilledTokens,
        reductionPercent: originalTokens > 0 ? 1 - distilledTokens / originalTokens : 0,
        durationMs: Date.now() - startTime,
      },
    }
  }

  private static recursiveTruncate(node: any, maxLen: number): any {
    if (typeof node === 'string') return truncate(node, maxLen)
    if (Array.isArray(node)) return node.map((item) => this.recursiveTruncate(item, maxLen))
    if (node !== null && typeof node === 'object') {
      const newObj: Record<string, any> = {}
      for (const [k, v] of Object.entries(node)) {
        newObj[k] = this.recursiveTruncate(v, maxLen)
      }
      return newObj
    }
    return node
  }

  private static estimateTokens(input: any): number {
    if (!input) return 0
    const text = typeof input === 'string' ? input : JSON.stringify(input)
    return Math.ceil(text.length / 3.5)
  }
}

/**
 * Main entry point for the ContextDistiller utility.
 */
export function distill(input: any, options: DistillOptions = {}): DistillResult {
  return ContextDistiller.distill(input, options)
}
