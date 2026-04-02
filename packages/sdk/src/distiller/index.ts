import { distillPayload, truncate, formatToDMD } from './engines.js'
import { identifyInput, tryParseJSON, deduplicateLines } from './preprocessor.js'
import type { DistillOptions, DistillResult } from './types.js'

export * from './types.js'

export class ContextDistiller {
  static distill(input: any, options: DistillOptions = {}): DistillResult {
    const start = Date.now()
    const reverseMap = new Map<string, string>()

    // 1. Input Guard: Identify and Normalize
    let inputType = identifyInput(input)
    let processed = input

    // If string is JSON, switch to structured pipeline
    if (inputType === 'unstructured') {
      const parsed = tryParseJSON(input as string)
      if (parsed) {
        processed = parsed
        inputType = 'structured'
      }
    }

    if (inputType === 'unstructured') {
      // --- Unstructured Pipeline (Logs / Plain Text) ---
      let text = processed as string
      text = deduplicateLines(text)
      text = truncate(text, options.maxStringLength ?? 5000)

      return {
        contextString: text,
        reverseMap,
        stats: {
          originalTokens: ContextDistiller.estimateTokens(input as string),
          distilledTokens: ContextDistiller.estimateTokens(text),
          reductionPercent:
            1 -
            ContextDistiller.estimateTokens(text) /
              ContextDistiller.estimateTokens(input as string),
          durationMs: Date.now() - start,
        },
      }
    }

    // 2. Initial Statistics (Original Tokens)
    let originalTokens = 0
    try {
      const originalString = JSON.stringify(processed)
      originalTokens = this.estimateTokens(originalString)
    } catch {
      originalTokens = this.estimateTokens(String(processed))
    }

    // 3. Unified Distillation Pass (Scrub + Date + Alias)
    processed = distillPayload(
      processed,
      {
        ...options,
        aliasIds: options.enableAliasing !== false,
      },
      reverseMap,
    )

    // 4. Truncator (Engine B) - Applied recursively to strings
    const maxLen = options.maxStringLength ?? 1000
    processed = this.recursiveTruncate(processed, maxLen)

    // 5. Formatter (Engine D)
    const contextString = formatToDMD(processed, {
      tableifyArrays: options.tableifyArrays ?? true,
      tableifyThreshold: options.tableifyThreshold ?? 3,
    })

    // 8. Final Statistics
    const distilledTokens = this.estimateTokens(contextString)

    return {
      contextString,
      reverseMap,
      stats: {
        originalTokens,
        distilledTokens,
        reductionPercent: originalTokens > 0 ? 1 - distilledTokens / originalTokens : 0,
        durationMs: Date.now() - start,
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
