import {
  type StrawOptions,
  type StrawAnalysis,
  type TokenCounter,
} from '../../domain/distiller/models.js'
import { Minifier } from '../../domain/distiller/services/Minifier.js'
import { FormatterFactory } from '../../infrastructure/formatters/FormatterFactory.js'

/**
 * High-level formatter for development and analysis.
 * Includes full metrics, statistics, and debug logging.
 */
export class AnalyticalFormatter {
  private formatterFactory = new FormatterFactory()

  constructor(
    private readonly options: StrawOptions,
    private readonly tokenCounter: TokenCounter,
  ) {}

  public format(input: unknown): StrawAnalysis {
    const start = Date.now()
    const reverseMap = new Map<string, string>()
    const warnings: string[] = []
    const debugLogs: string[] | undefined = this.options.debug ? [] : undefined

    // 1. Statistics Baselines (on original input)
    let baselineTokens = 0
    let prettyJson = ''

    try {
      prettyJson = JSON.stringify(input, null, 2)
      baselineTokens = this.tokenCounter(prettyJson)
    } catch {
      // Handle input that can be converted to string if necessary
    }

    // 2. Minification Pass
    const minifier = new Minifier(this.options, reverseMap, warnings, debugLogs)
    const processed = minifier.minify(input)

    // Fallback baseline if first pass failed (rare)
    if (baselineTokens === 0) {
      prettyJson = JSON.stringify(processed, null, 2)
      baselineTokens = this.tokenCounter(prettyJson)
    }

    // 3. Formatting Pass
    const format = this.options.outputFormat ?? 'dmd'
    const formatter = this.formatterFactory.getFormatter(format)

    const contextString = formatter.format(processed, {
      tableifyArrays:
        format === 'dmd' ? this.options.tableifyArrays !== false : !!this.options.tableifyArrays,
      tableifyThreshold: this.options.tableifyThreshold ?? 3,
    })

    const distilledTokens = this.tokenCounter(contextString)

    return {
      contextString,
      reverseMap,
      originalSizeBytes: new TextEncoder().encode(prettyJson).length,
      distilledSizeBytes: new TextEncoder().encode(contextString).length,
      stats: {
        baselineTokens,
        distilledTokens,
        tokensSaved: baselineTokens - distilledTokens,
        reductionPercent:
          baselineTokens > 0
            ? Number(((1 - distilledTokens / baselineTokens) * 100).toFixed(1))
            : 0,
        durationMs: Date.now() - start,
      },
      ...(debugLogs && debugLogs.length > 0 ? { debugLogs } : {}),
      ...(warnings && warnings.length > 0 ? { warnings } : {}),
    }
  }
}
