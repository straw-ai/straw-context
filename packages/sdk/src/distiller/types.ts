/**
 * Configuration for how the minifier represents null or empty primitives.
 * Straw strictly preserves all keys for Enterprise Readiness.
 */
export interface NormalizationOptions {
  /**
   * Alternative representation for nulls (e.g. "∅").
   * Straw never drops keys, it only substitutes their values to save tokens.
   * @default "∅"
   */
  nullPlaceholder?: string
  /**
   * Alternative representation for undefined values.
   * @default "∅"
   */
  undefinedPlaceholder?: string
  /**
   * If true, empty strings are replaced by the nullPlaceholder.
   * @default false
   */
  normalizeEmptyStrings?: boolean
}

export type OutputFormat = 'dmd' | 'toon' | 'xml' | 'json' | 'yaml'

/**
 * Core Rule for the Aliaser Engine.
 * Replaces high-entropy strings (IDs, Hashes) with short, stable tokens.
 */
export interface AliaserRule {
  /** Descriptive name of the aliaser (e.g. 'uuid') */
  readonly name: string
  /** The pattern to find in strings */
  readonly pattern: RegExp
  /** The prefix for generated tokens (e.g. 'UUID' becomes $UUID_0) */
  readonly prefix: string
}

export interface DistillOptions {
  /**
   * Keys or paths that should be treated as high priority for debugging.
   * Note: Straw now preserves ALL keys by default.
   */
  essentialKeys?: string[]
  /** Convert arrays of similar objects to Markdown tables (TOON). @default false */
  tableifyArrays?: boolean
  /** Minimum array length to trigger table conversion. @default 3 */
  tableifyThreshold?: number
  /** Enable UUID/SHA to short-pointer replacement. @default false */
  enableAliasing?: boolean
  /**
   * Configuration for value normalization and substitution.
   */
  normalization?: NormalizationOptions
  /**
   * Maximum depth for recursive object traversal.
   * Prevents stack overflows on extremely deep objects.
   * @default 50
   */
  maxDepth?: number
  /**
   * Custom token counter function (e.g. using tiktoken).
   * Used for generating statistics in the DistillResult.
   */
  tokenCounter?: (text: string) => number
  /** Array of programmatic rules to alias IDs, SHAs, or custom patterns. */
  aliaser?: AliaserRule[]
  /** Override the default formatting strategy. @default 'dmd' */
  outputFormat?: OutputFormat
  /** Enable debug tracing of the distillation process. */
  debug?: boolean
}

export interface DistillResult {
  /** The final distilled payload for the LLM (Lossless Transformation) */
  contextString: string
  /** Mapping of $ID_X back to original UUIDs/SHAs */
  reverseMap: Map<string, string>
  /** Size of the original input string in bytes */
  originalSizeBytes: number
  /** Size of the final distilled string in bytes */
  distilledSizeBytes: number
  /** Comparative statistics regarding token reduction */
  stats: {
    /** Tokens of the 2-space indented JSON baseline */
    baselineTokens: number
    /** Tokens of the minified JSON baseline */
    minifiedTokens: number
    /** Final tokens of the distilled Straw output */
    distilledTokens: number
    /** Absolute number of tokens saved compared to baselineTokens */
    tokensSaved: number
    /** Reduction against the pretty baseline (Headline %). e.g. 62.1 */
    reductionPercent: number
    /** Reduction against the minified baseline (Efficiency Gain %). e.g. 46.3 */
    efficiencyGain: number
    /** Total processing time in milliseconds */
    durationMs: number
  }
  /** Detailed tracing logs produced when `debug: true` */
  debugLogs?: string[]
  /** Diagnostic warnings or telemetry about the distillation process */
  warnings?: string[]
}

export class DistillError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DistillError'
  }
}
