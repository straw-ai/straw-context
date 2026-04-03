import { Budgeter } from './budgeter.js'
import { scrub, truncate, formatOutput } from './engines.js'
import { identifyInput, tryParseJSON, deduplicateLines } from './preprocessor.js'
import type { DistillOptions, DistillResult, LLMProvider, OutputFormat } from './types.js'

export * from './types.js'
export { presets } from './presets.js'
export { ContextSession } from './session.js'

export class ContextDistiller {
  /**
   * Primary entry point for context minification.
   * Orchestrates the multi-stage pipeline: Scrubber, Truncator, Budgeter, and Formatter.
   *
   * @param input The raw JSON object, Array, or String to minify.
   * @param options Configuration for the distillation process.
   * @returns Detailed result including the minified string and reduction statistics.
   */
  public static distill(input: unknown, options: DistillOptions = {}): DistillResult {
    const start = Date.now()
    const reverseMap = new Map<string, string>()
    let originalTokens = 0

    let processed: unknown = input
    const guardEnabled = options.enableInputGuard !== false

    // 1. Input Guard (Pre-Processor)
    if (guardEnabled) {
      const type = identifyInput(input)

      // Ensure input is actually a string before attempting string deduplication
      if (type === 'unstructured' && typeof input === 'string') {
        processed = deduplicateLines(input, options.dedupe)
      }

      // If it's a string, try to parse as JSON to move to the structured pipeline
      if (typeof processed === 'string') {
        const parsed = tryParseJSON(processed)

        // BUG FIX: Prevent falsy JSON (like `0` or `false`) from failing the check
        if (parsed !== null && parsed !== undefined) {
          processed = parsed
        } else {
          // Unstructured plain text (e.g., logs). Result is already deduplicated.
          // We return early as structured pipeline (scrubbing/truncating nodes) doesn't apply.
          const textInput = String(input)
          originalTokens = ContextDistiller.estimateTokens(textInput)
          const distilledTokens = ContextDistiller.estimateTokens(processed)

          return {
            contextString: processed,
            reverseMap: new Map(),
            stats: {
              originalTokens,
              distilledTokens,
              reductionRatio: originalTokens > 0 ? 1 - distilledTokens / originalTokens : 0,
              durationMs: Date.now() - start,
            },
          }
        }
      }
    }

    // 2. Initial Statistics (Original Tokens)
    const counter = options.tokenCounter ?? ContextDistiller.estimateTokens
    const defaults = ContextDistiller.getOutputDefaults(options.targetProvider)
    const format = options.outputFormat ?? defaults.outputFormat

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
        aliasIds: options.enableAliasing === true,
      },
      reverseMap,
      options.redactPII,
    )

    // 4. Truncator (Engine B) - Applied recursively to strings
    const { maxStringLength: maxLen, stringTruncationStrategy: strategy = 'middle' } = options
    if (maxLen !== undefined && maxLen > 0) {
      processed = ContextDistiller.recursiveTruncate(processed, maxLen, strategy)
    }

    let warnings: string[] | undefined

    // 5. Budgeting Pass
    if (options.budget) {
      const budgetResult = Budgeter.prune(processed, options, counter, format)
      processed = budgetResult.node
      warnings = budgetResult.warnings
    }

    // 6. Formatter (Engine D - Optimized for LLM)
    const contextString = formatOutput(processed, format, {
      tableifyArrays: options.tableifyArrays ?? false,
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
        reductionRatio: originalTokens > 0 ? 1 - distilledTokens / originalTokens : 0,
        durationMs: Date.now() - start,
      },
      ...(warnings && warnings.length > 0 ? { warnings } : {}),
    }
  }

  private static recursiveTruncate(
    node: unknown,
    maxLen: number,
    strategy: 'middle' | 'end' | 'start',
  ): unknown {
    if (typeof node === 'string') {
      return truncate(node, maxLen, strategy)
    }

    if (Array.isArray(node)) {
      return node.map((item) => ContextDistiller.recursiveTruncate(item, maxLen, strategy))
    }

    if (typeof node === 'object' && node !== null) {
      // Replaced `for...of` with `Object.entries().reduce()` to comply with Airbnb standards
      return Object.entries(node).reduce<Record<string, unknown>>((acc, [key, value]) => {
        acc[key] = ContextDistiller.recursiveTruncate(value, maxLen, strategy)
        return acc
      }, {})
    }

    return node
  }

  private static estimateTokens(text: string): number {
    if (!text) {
      return 0
    }

    const chunks = text.match(/[\w]+|[^\w\s]+/g)
    if (!chunks) {
      return Math.ceil(text.length / 3.5)
    }

    // Replaced `for...of` with `.reduce()` to comply with Airbnb standards
    return chunks.reduce((estimatedCount, chunk) => {
      // Long alphanumeric words usually get split into 3-4 char BPE sub-tokens
      if (chunk.length > 4 && /\w/.test(chunk)) {
        return estimatedCount + Math.ceil(chunk.length / 4)
      }
      // Short words or punctuation blocks count as roughly 1 token
      return estimatedCount + 1
    }, 0)
  }

  private static getOutputDefaults(provider?: LLMProvider): { outputFormat: OutputFormat } {
    switch (provider) {
      case 'anthropic':
        return { outputFormat: 'xml' }
      case 'openai':
      case 'gemini':
      case 'meta':
      default:
        return { outputFormat: 'dmd' }
    }
  }
}

/**
 * Main entry point for the ContextDistiller utility.
 */
export function distill(input: unknown, options: DistillOptions = {}): DistillResult {
  return ContextDistiller.distill(input, options)
}
