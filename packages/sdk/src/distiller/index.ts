import { minifyNode, formatOutput } from './engines.js'
import { type DistillOptions, type DistillResult, DistillError } from './types.js'

export * from './types.js'
export { uuidAliaser, shaAliaser } from './engines.js'

/**
 * Primary entry point for context minification (Lossless Translation).
 * Straw strictly accepts structured data (Objects or Arrays) and transforms
 * them into high-density notations without data loss.
 *
 * @param input The raw JSON object or Array to transform.
 * @param options Configuration for the normalization and formatting process.
 * @returns Detailed result including the transformed string and reduction statistics.
 */
export function distill(input: object, options: DistillOptions = {}): DistillResult {
  // 0. Strict Validation: Structured Data Only
  if (input === null || typeof input !== 'object') {
    throw new DistillError(
      'Straw SDK strictly accepts structured data (Object or Array). ' +
        'Please parse your JSON strings before calling distill().',
    )
  }

  const activeOptions = { ...options }
  const start = Date.now()
  const reverseMap = new Map<string, string>()
  const debugLogs: string[] | undefined = activeOptions.debug ? [] : undefined

  let processed: unknown = input
  const counter = activeOptions.tokenCounter ?? (() => 0)

  // 1. Statistics Baselines
  const format = activeOptions.outputFormat ?? 'dmd'
  const isDMD = format === 'dmd'

  let baselineTokens = 0
  let minifiedTokens = 0
  let prettyJson = ''

  try {
    prettyJson = JSON.stringify(processed, null, 2)
    baselineTokens = counter(prettyJson)
    minifiedTokens = counter(JSON.stringify(processed))
  } catch {
    // Skip if circular or contains BigInt
  }

  const warnings: string[] = []

  // 2. Normalization Pass (Aliasing, Substitution)
  processed = minifyNode(processed, activeOptions, reverseMap, warnings, debugLogs)

  if (baselineTokens === 0) {
    prettyJson = JSON.stringify(processed, null, 2)
    baselineTokens = counter(prettyJson)
    minifiedTokens = counter(JSON.stringify(processed))
  }

  // 3. Formatting Pass (Pure Notation Transformation)
  const contextString = formatOutput(processed, format, {
    tableifyArrays: isDMD ? activeOptions.tableifyArrays !== false : !!activeOptions.tableifyArrays,
    tableifyThreshold: activeOptions.tableifyThreshold ?? 3,
  })

  const distilledTokens = counter(contextString)

  return {
    contextString,
    reverseMap,
    originalSizeBytes: new TextEncoder().encode(prettyJson).length,
    distilledSizeBytes: new TextEncoder().encode(contextString).length,
    stats: {
      baselineTokens,
      minifiedTokens,
      distilledTokens,
      tokensSaved: baselineTokens - distilledTokens,
      reductionPercent:
        baselineTokens > 0 ? Number(((1 - distilledTokens / baselineTokens) * 100).toFixed(1)) : 0,
      efficiencyGain:
        minifiedTokens > 0 ? Number(((1 - distilledTokens / minifiedTokens) * 100).toFixed(1)) : 0,
      durationMs: Date.now() - start,
    },
    ...(debugLogs && debugLogs.length > 0 ? { debugLogs } : {}),
    ...(warnings && warnings.length > 0 ? { warnings } : {}),
  }
}
