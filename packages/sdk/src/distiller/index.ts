import { scrub, truncate, aliasIdentifiers, formatToDMD, recursiveFormatDates } from './engines.js'
import type { DistillOptions, DistillResult } from './types.js'

export * from './types.js'

export class ContextDistiller {
  static distill(input: any, options: DistillOptions = {}): DistillResult {
    const startTime = Date.now()
    const reverseMap = new Map<string, string>()

    // 1. Initial Statistics (Original)
    let originalTokens = 0
    try {
      const originalString = JSON.stringify(input)
      originalTokens = this.estimateTokens(originalString)
    } catch {
      // If circular, we'll catch it in the scrubber later.
      // For now, estimate based on keys/recursion if we really needed to,
      // but let's just use 0 or a fallback.
      originalTokens = 0
    }

    // 2. Scrubber (Engine A)
    let processed = scrub(input, options)

    // 3. Truncator (Engine B) - Applied recursively to strings
    const maxLen = options.maxStringLength ?? 1000
    processed = this.recursiveTruncate(processed, maxLen)

    // 3.5. Relative Dates (Engine E)
    if (options.relativeDates !== false) {
      processed = recursiveFormatDates(processed)
    }

    // 4. Aliaser (Engine C)
    if (options.enableAliasing !== false) {
      processed = aliasIdentifiers(processed, reverseMap)
    }

    // 5. Formatter (Engine D)
    const contextString = formatToDMD(processed, {
      tableifyArrays: options.tableifyArrays ?? true,
      tableifyThreshold: options.tableifyThreshold ?? 3,
    })

    // 6. Final Statistics
    const distilledTokens = this.estimateTokens(contextString)
    const reductionPercent =
      originalTokens > 0 ? Number(((1 - distilledTokens / originalTokens) * 100).toFixed(1)) : 0

    return {
      contextString,
      reverseMap,
      stats: {
        originalTokens,
        distilledTokens,
        reductionPercent,
        durationMs: Date.now() - startTime,
      },
    }
  }

  private static recursiveTruncate(node: any, maxLen: number): any {
    if (typeof node === 'string') {
      return truncate(node, maxLen)
    }
    if (Array.isArray(node)) {
      return node.map((item) => this.recursiveTruncate(item, maxLen))
    }
    if (typeof node === 'object' && node !== null) {
      const newObj: Record<string, any> = {}
      for (const [k, v] of Object.entries(node)) {
        newObj[k] = this.recursiveTruncate(v, maxLen)
      }
      return newObj
    }
    return node
  }

  private static estimateTokens(text: string): number {
    // Conservative heuristic: words + special characters
    // Or simpler: chars / 3.5 (standard for mixed code/text)
    if (!text) return 0
    return Math.ceil(text.length / 3.5)
  }
}

/**
 * Main entry point for the ContextDistiller utility.
 */
export function distill(input: any, options: DistillOptions = {}): DistillResult {
  return ContextDistiller.distill(input, options)
}
