import { Budgeter } from './budgeter.js'
import { scrub, truncate, formatOutput } from './engines.js'
import { identifyInput, tryParseJSON, deduplicateLines } from './preprocessor.js'
import { presets } from './presets.js'
import type { DistillOptions, DistillResult, LLMProvider, OutputFormat } from './types.js'
import { DistillError } from './types.js'

export * from './types.js'
export { presets }
function recursiveTruncate(
  node: unknown,
  maxLen: number,
  strategy: 'middle' | 'end' | 'start',
): unknown {
  if (typeof node === 'string') {
    return truncate(node, maxLen, strategy)
  }

  if (Array.isArray(node)) {
    return node.map((item) => recursiveTruncate(item, maxLen, strategy))
  }

  if (typeof node === 'object' && node !== null) {
    // Replaced `for...of` with `Object.entries().reduce()` to comply with Airbnb standards
    return Object.entries(node).reduce<Record<string, unknown>>((acc, [key, value]) => {
      acc[key] = recursiveTruncate(value, maxLen, strategy)
      return acc
    }, {})
  }

  return node
}


function getOutputDefaults(provider?: LLMProvider): { outputFormat: OutputFormat } {
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

function mergeOptions(base: DistillOptions, ext: DistillOptions): DistillOptions {
  const result: any = { ...base, ...ext }

  // Array concatenation for scrubber keys
  const arrayKeys: (keyof DistillOptions)[] = ['dropKeys', 'preserveKeys']
  for (const key of arrayKeys) {
    if (base[key] || ext[key]) {
      result[key] = [
        ...(Array.isArray(base[key]) ? (base[key] as string[]) : []),
        ...(Array.isArray(ext[key]) ? (ext[key] as string[]) : []),
      ]
    }
  }

  // Object merging for nested configuration blocks
  if (base.dedupe || ext.dedupe) {
    result.dedupe = { ...base.dedupe, ...ext.dedupe }
  }
  if (base.redactPII || ext.redactPII) {
    result.redactPII = { ...base.redactPII, ...ext.redactPII }
  }
  if (base.budget || ext.budget) {
    result.budget = { ...base.budget, ...ext.budget }
  }

  return result
}

/**
 * Primary entry point for context minification.
 * Orchestrates the multi-stage pipeline: Scrubber, Truncator, Budgeter, and Formatter.
 *
 * @param input The raw JSON object, Array, or String to minify.
 * @param options Configuration for the distillation process.
 * @returns Detailed result including the minified string and reduction statistics.
 */
export function distill(input: unknown, options: DistillOptions = {}): DistillResult {
  let activeOptions = { ...options }

  // 0. Resolve Presets
  if (options.preset) {
    const presetNames = Array.isArray(options.preset) ? options.preset : [options.preset]
    let mergedPresets: DistillOptions = {}
    for (const name of presetNames) {
      const p = (presets as Record<string, DistillOptions>)[name]
      if (p) {
        mergedPresets = mergeOptions(mergedPresets, p)
      }
    }
    // Presets act as the base, user-provided options extend/override them via intelligent merge
    activeOptions = mergeOptions(mergedPresets, options)
  }

  const start = Date.now()
  const reverseMap = new Map<string, string>()
  let originalTokens = 0

  let processed: unknown = input

  const counter = activeOptions.tokenCounter ?? (() => 0)

  // 1.5 Validation: Budgeting requires an explicit token counter
  if (activeOptions.budget && !activeOptions.tokenCounter) {
    throw new DistillError(
      'A `tokenCounter` MUST be provided in `DistillOptions` when a `budget` is specified. ' +
        'Providing an accurate tokenizer (e.g. Tiktoken) is essential for production context window enforcement.',
    )
  }

  // 1. Deduplication (Unstructured Strings)
  if (typeof processed === 'string') {
    processed = deduplicateLines(processed, activeOptions.dedupe)
  }

  const guardEnabled = activeOptions.enableInputGuard !== false

  // 2. Input Guard (Pre-Processor)
  if (guardEnabled) {
    identifyInput(input)

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
        originalTokens = counter(textInput)
        const distilledTokens = counter(processed as string)

        return {
          contextString: processed as string,
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

  // 3. Initial Statistics (Original Tokens)
  const defaults = getOutputDefaults(activeOptions.targetProvider)
  const format = activeOptions.outputFormat ?? defaults.outputFormat

  try {
    const originalString = JSON.stringify(processed)
    originalTokens = counter(originalString)
  } catch {
    originalTokens = counter(String(processed))
  }

  // 4. Unified Distillation Pass (Scrub + Date + Alias + PII)
  processed = scrub(
    processed,
    {
      ...activeOptions,
      aliasIds: activeOptions.enableAliasing === true,
    },
    reverseMap,
    activeOptions.redactPII,
  )

  // 5. Truncator (Engine B) - Applied recursively to strings
  const { maxStringLength: maxLen, stringTruncationStrategy: strategy = 'middle' } = activeOptions
  if (maxLen !== undefined && maxLen > 0) {
    processed = recursiveTruncate(processed, maxLen, strategy)
  }

  let warnings: string[] | undefined

  // 6. Budgeting Pass
  if (activeOptions.budget) {
    const budgetResult = Budgeter.prune(processed, activeOptions, counter, format)
    processed = budgetResult.node
    warnings = budgetResult.warnings
  }

  // 7. Formatter (Engine D - Optimized for LLM)
  const contextString = formatOutput(processed, format, {
    tableifyArrays: activeOptions.tableifyArrays ?? false,
    tableifyThreshold: activeOptions.tableifyThreshold ?? 3,
  })

  // 8. Final Statistics
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
