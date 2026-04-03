export interface ScrubberOptions {
  /**
   * Keys or dot-notation paths to completely remove from the payload.
   * Supports wildcards (e.g. '*_id', 'metadata.internal_*').
   */
  dropKeys?: string[]
  /**
   * Keys or dot-notation paths to protect from truncation or dropping.
   * Punches a hole through DEFAULT_NOISE_KEYS.
   */
  preserveKeys?: string[]
  /**
   * Operating mode for the scrubber.
   * 'blocklist': Drop elements explicitly listed in dropKeys/DEFAULT_NOISE.
   * 'allowlist': Drop EVERYTHING unless it matches a preserveKey.
   * @default 'blocklist'
   */
  mode?: 'blocklist' | 'allowlist'
  /**
   * @deprecated Use `useSystemBlocklist` instead.
   */
  useDefaultBlacklist?: boolean
  /**
   * If true, uses the built-in "System Default Policy" to drop noisy keys.
   * Only applicable when `mode` is 'blocklist'.
   * @default true
   */
  useSystemBlocklist?: boolean
  /**
   * If true, drops null, undefined, or empty string values.
   * @default true
   */
  pruneEmptyValues?: boolean
  /**
   * If true, drops arrays that contain no elements after scrubbing.
   * @default false
   */
  pruneEmptyArrays?: boolean
}

export interface DedupeOptions {
  /** Toggle Semantic Line Deduplication. Default: true */
  enabled?: boolean
  /** Minimum consecutive lines to trigger deduplication. Default: 5 */
  threshold?: number
  /** Number of characters to compare at start of lines. Default: 15 */
  prefixLength?: number
  /** Number of lines to keep at start and end of a group. Default: 2 */
  contextBuffer?: number
}

export type PIIType = 'email' | 'phone' | 'credit-card' | 'api-key'

export interface CustomRedactionRule {
  /** The regex pattern to match. We recommend ensuring the 'g' flag is used. */
  pattern: RegExp
  /** The semantic token to replace it with (e.g., 'COMPANY_SECRET') */
  replacement: string
}

export interface RedactOptions {
  /** Which built-in types of PII to scrub. Default: all available */
  types?: PIIType[]
  /** Custom regex rules defined by the user */
  customRules?: CustomRedactionRule[]
  /** Lifecycle callback fired whenever PII/PHI is found and redacted */
  onRedact?: (type: string, match: string, path: string) => void
}

export interface BudgetOptions {
  /** The strict token limit for the distilled output. */
  maxContextTokens: number
  /**
   * Strategy for pruning when over budget.
   * 'depth': Prune deeply nested nodes first.
   * 'priority': Use priorityKeys to determine what to drop first.
   * Default: 'depth'
   */
  strategy?: 'depth' | 'priority'
  /** Keys or paths that should be considered low priority (dropped first). */
  lowPriorityKeys?: string[]
  /** Keys or paths that MUST never be dropped during budgeting. */
  essentialKeys?: string[]
}

export type LLMProvider = 'openai' | 'anthropic' | 'gemini' | 'meta' | 'generic'
export type OutputFormat = 'dmd' | 'xml' | 'json'

/**
 * Custom middleware escape hatch.
 * Return true to KEEP, false to DROP, or undefined to use default engine logic.
 */
export type FilterNodeCallback = (key: string, value: any, path: string) => boolean | undefined

export interface DistillOptions extends ScrubberOptions {
  /**
   * Name of one or more pre-defined configuration templates (e.g. 'github', 'stripe', 'graphql').
   * If provided as an array, presets are merged in order.
   */
  preset?: string | string[]
  /** Hard cap on string values. Disabled by default. */
  maxStringLength?: number
  /** Strategy for string truncation when maxStringLength is exceeded. @default 'middle' */
  stringTruncationStrategy?: 'middle' | 'end' | 'start'
  /** Convert arrays of similar objects to Markdown tables. @default false */
  tableifyArrays?: boolean
  /** Minimum array length to trigger table conversion. @default 3 */
  tableifyThreshold?: number
  /** Enable UUID/SHA to short-pointer replacement. @default false */
  enableAliasing?: boolean
  /** Convert ISO date strings to relative time (e.g. "2 days ago"). @default false */
  relativeDates?: boolean
  /** Enable whole-pipeline pre-processing (JSON auto-parse + log dedupe). @default true */
  enableInputGuard?: boolean
  /** Configuration for Semantic Line Deduplication */
  dedupe?: DedupeOptions
  /** Anchor date for relative time calculations (useful for testing). @default new Date() */
  dateAnchor?: Date
  /** Custom middleware to run on every node before default engines. */
  filterNode?: FilterNodeCallback
  /** Options for PII and PHI redaction. Omit to disable. */
  redactPII?: RedactOptions
  /**
   * Custom token counter function (e.g. using tiktoken).
   * **MANDATORY** if `budget` is specified.
   */
  tokenCounter?: (text: string) => number
  /** Budgeting configuration to fit strict context windows. */
  budget?: BudgetOptions
  /** Target LLM provider to apply optimal formatting defaults. */
  targetProvider?: LLMProvider
  /** Override the default formatting strategy. @default 'dmd' */
  outputFormat?: OutputFormat
  /** Enable debug tracing of the distillation process. */
  debug?: boolean
}

export interface DistillResult {
  /** The final DMD payload for the LLM */
  contextString: string
  /** Mapping of $ID_X back to original UUIDs */
  reverseMap: Map<string, string>
  /** Conservative heuristic estimate of token reduction */
  stats: {
    /** Estimated token count of the original input */
    originalTokens: number
    /** Estimated token count of the distilled output */
    distilledTokens: number
    /** Ratio of reduction (0.0 to 1.0). */
    reductionRatio: number
    /** Total processing time in milliseconds */
    durationMs: number
  }
  /** Diagnostic warnings or telemetry about the distillation process */
  warnings?: string[]
}

export class DistillError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DistillError'
  }
}
