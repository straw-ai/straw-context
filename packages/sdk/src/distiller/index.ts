import { Budgeter } from './budgeter.js'
import { scrub, truncate, formatToDMD } from './engines.js'
import { identifyInput, tryParseJSON, deduplicateLines } from './preprocessor.js'
import type { DistillOptions, DistillResult } from './types.js'

export * from './types.js'
export { presets } from './presets.js'

export class ContextDistiller {
  static distill(input: any, options: DistillOptions = {}): DistillResult {
    const start = Date.now()
    const reverseMap = new Map<string, string>()

    // 1. Input Guard (Pre-Processor)
    let processed: any = input
    const guardEnabled = options.enableInputGuard !== false

    if (guardEnabled) {
      const type = identifyInput(input)
      if (type === 'unstructured') {
        // Log Deduplication for plain text
        processed = deduplicateLines(input as string, options.dedupe)
      } else {
        // Detect JSON strings inside structured data?
        // For now, only top-level string auto-parsing is handled if input was a string.
        processed = input
      }

      // If it's a string, try to parse as JSON to move to the structured pipeline
      if (typeof processed === 'string') {
        const parsed = tryParseJSON(processed)
        if (parsed) {
          processed = parsed
        } else {
          // It's just plain text (e.g. logs), return early with minimal processing
          const text = deduplicateLines(processed, options.dedupe)
          return {
            contextString: text,
            reverseMap: new Map(),
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
      }
    }

    // 2. Initial Statistics (Original Tokens)
    let originalTokens = 0
    const counter = options.tokenCounter ?? ContextDistiller.estimateTokens

    try {
      const originalString = JSON.stringify(processed)
      originalTokens = counter(originalString)
    } catch {
      originalTokens = counter(String(processed))
    }

    // 3. Unified Distillation Pass (Scrub + Date + Alias + PII)
    processed = scrub(
      processed,
      {
        ...options,
        aliasIds: options.enableAliasing !== false,
      },
      reverseMap,
      options.redactPII,
    )

    // 4. Truncator (Engine B) - Applied recursively to strings
    const maxLen = options.maxStringLength ?? 1000
    processed = this.recursiveTruncate(processed, maxLen)

    // 5. Budgeting Pass
    if (options.budget) {
      processed = Budgeter.prune(processed, options, counter)
    }

    // 6. Formatter (Engine D)
    const contextString = formatToDMD(processed, {
      tableifyArrays: options.tableifyArrays ?? true,
      tableifyThreshold: options.tableifyThreshold ?? 3,
    })

    // 7. Final Statistics
    const distilledTokens = counter(contextString)

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
    if (!text) return 0
    // Improved Heuristic: Approximates Byte-Pair Encoding (BPE) boundaries
    // by chunking alphanumeric words and punctuation clusters.
    // It remains 0-dependency to keep the SDK ultra-lightweight.
    // For 100% precision, provide a real tokenizer via `options.tokenCounter`.

    const chunks = text.match(/[\w]+|[^\w\s]+/g)
    if (!chunks) return Math.ceil(text.length / 3.5)

    let estimatedCount = 0
    for (const chunk of chunks) {
      // Long alphanumeric words usually get split into 3-4 char BPE sub-tokens
      if (chunk.length > 4 && /\w/.test(chunk)) {
        estimatedCount += Math.ceil(chunk.length / 4)
      } else {
        estimatedCount += 1 // Short words or punctuation blocks count as roughly 1 token
      }
    }

    return estimatedCount
  }
}

/**
 * Main entry point for the ContextDistiller utility.
 */
export function distill(input: any, options: DistillOptions = {}): DistillResult {
  return ContextDistiller.distill(input, options)
}
