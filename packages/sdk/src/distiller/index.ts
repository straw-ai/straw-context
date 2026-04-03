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
  visited = new WeakSet(),
  path = '',
  warnings?: string[],
): unknown {
  if (typeof node === 'string') {
    return truncate(node, maxLen, strategy)
  }

  if (Array.isArray(node)) {
    if (visited.has(node)) {
      if (warnings) {
        warnings.push(
          `Circular reference detected at path: "${path || '(root)'}". Node pruned in Truncator.`,
        )
      }
      return undefined
    }
    visited.add(node)
    return node
      .map((item, idx) =>
        recursiveTruncate(item, maxLen, strategy, visited, `${path}[${idx}]`, warnings),
      )
      .filter((v) => v !== undefined)
  }

  if (typeof node === 'object' && node !== null) {
    if (visited.has(node)) {
      if (warnings) {
        warnings.push(
          `Circular reference detected at path: "${path || '(root)'}". Node pruned in Truncator.`,
        )
      }
      return undefined
    }
    visited.add(node)

    // Replaced `for...of` with `Object.entries().reduce()` to comply with Airbnb standards
    return Object.entries(node).reduce<Record<string, unknown>>((acc, [key, value]) => {
      const subPath = path ? `${path}.${key}` : key
      const cleaned = recursiveTruncate(value, maxLen, strategy, visited, subPath, warnings)
      if (cleaned !== undefined) {
        acc[key] = cleaned
      }
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

type GenericObject = Record<string, unknown>

function isPlainObject(item: unknown): item is GenericObject {
  return (
    item !== null &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    !(item instanceof Date) &&
    !(item instanceof RegExp) &&
    !(item instanceof Map) &&
    !(item instanceof Set)
  )
}

function mergeOptions<T extends object>(base: T, ext: T): T {
  const result = { ...base } as Record<string, unknown>
  const baseObj = base as Record<string, unknown>
  const extObj = ext as Record<string, unknown>

  for (const key in extObj) {
    if (!Object.prototype.hasOwnProperty.call(extObj, key)) continue

    const extVal = extObj[key]
    const baseVal = baseObj[key]

    if (Array.isArray(extVal)) {
      // DEDUPLICATE arrays using Set
      const baseArray = Array.isArray(baseVal) ? (baseVal as unknown[]) : []
      result[key] = Array.from(new Set([...baseArray, ...extVal]))
    } else if (isPlainObject(extVal) && isPlainObject(baseVal)) {
      // Recursively merge nested config objects (e.g., budget.limits)
      result[key] = mergeOptions(baseVal as object, extVal as object)
    } else {
      // Primitives, Dates, RegExps, Functions: User explicitly overwrites
      result[key] = extVal
    }
  }

  return result as T
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

  const warnings: string[] = []

  // 4. Unified Distillation Pass (Scrub + Date + Alias + PII)
  processed = scrub(
    processed,
    {
      ...activeOptions,
      aliasIds: activeOptions.enableAliasing === true,
    },
    reverseMap,
    activeOptions.redactPII,
    warnings,
  )

  // 5. Truncator (Engine B) - Applied recursively to strings
  const { maxStringLength: maxLen, stringTruncationStrategy: strategy = 'end' } = activeOptions
  if (maxLen !== undefined && maxLen > 0) {
    processed = recursiveTruncate(processed, maxLen, strategy, new WeakSet(), '', warnings)
  }

  // 6. Budgeting Pass
  if (activeOptions.budget) {
    const budgetResult = Budgeter.prune(processed, activeOptions, counter, format)
    processed = budgetResult.node
    if (budgetResult.warnings) {
      warnings.push(...budgetResult.warnings)
    }
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
