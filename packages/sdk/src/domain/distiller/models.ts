import { type AliaserRule } from './entities.js'

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
 * Function type for counting tokens in a string.
 */
export type TokenCounter = (text: string) => number

/**
 * Options for the Straw process.
 */
export interface StrawOptions {
  /**
   * Keys or paths that should be treated as high priority for debugging.
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
   * @default 50
   */
  maxDepth?: number
  /**
   * Custom token counter function (e.g. using tiktoken).
   */
  tokenCounter?: TokenCounter
  /** Array of programmatic rules to alias IDs, SHAs, or custom patterns. */
  aliaser?: AliaserRule[]
  /** Override the default formatting strategy. @default 'dmd' */
  outputFormat?: OutputFormat
  /** Enable debug tracing of the distillation process. */
  debug?: boolean
}

/**
 * Lean result of the Straw transformation.
 */
export interface StrawResult {
  /** The final transformed payload for the LLM */
  contextString: string
  /** Mapping of $ID_X back to original UUIDs/SHAs */
  reverseMap: Map<string, string>
}

/**
 * Full analysis of the Straw transformation, including metrics and logs.
 */
export interface StrawAnalysis extends StrawResult {
  /** Size of the original input string in bytes */
  originalSizeBytes: number
  /** Size of the final transformed string in bytes */
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
  /** Diagnostic warnings or telemetry about the process */
  warnings?: string[]
}
