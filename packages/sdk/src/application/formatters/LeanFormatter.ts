import { type StrawOptions, type StrawResult } from '../../domain/distiller/models.js'
import { Minifier } from '../../domain/distiller/services/Minifier.js'
import { FormatterFactory } from '../../infrastructure/formatters/FormatterFactory.js'

/**
 * High-level formatter optimized for production speed.
 * Skips statistics calculation and token counting.
 */
export class LeanFormatter {
  private formatterFactory = new FormatterFactory()

  constructor(private readonly options: StrawOptions) {}

  public format(input: unknown): StrawResult {
    const reverseMap = new Map<string, string>()

    // 1. Minification Pass
    const minifier = new Minifier(this.options, reverseMap)
    const processed = minifier.minify(input)

    // 2. Formatting Pass
    const format = this.options.outputFormat ?? 'dmd'
    const formatter = this.formatterFactory.getFormatter(format)

    const contextString = formatter.format(processed, {
      tableifyArrays:
        format === 'dmd' ? this.options.tableifyArrays !== false : !!this.options.tableifyArrays,
      tableifyThreshold: this.options.tableifyThreshold ?? 3,
    })

    return {
      contextString,
      reverseMap,
    }
  }
}
