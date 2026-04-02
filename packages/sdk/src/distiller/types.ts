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
   * If true, uses the built-in "System Default Policy" to drop noisy keys.
   * (e.g. __typename, _links, etc.)
   * 'blocklist': Drop elements explicitly listed in dropKeys/DEFAULT_NOISE.
   * 'allowlist': Drop EVERYTHING unless it matches a preserveKey.
   * Default: 'blocklist'
   */
  mode?: 'blocklist' | 'allowlist'
  /**
   * If true, uses the built-in "System Default Policy" to drop noisy keys.
   * Only applicable in 'blocklist' mode.
   * Default: true
   */
  useDefaultBlacklist?: boolean
  /** Default: false ([] has semantic meaning) */
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
  /** Whether redaction is enabled. Default: false */
  enabled?: boolean
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
  /** Hard cap on string values. Uses Middle-Out truncation. Default: 1000 */
  maxStringLength?: number
  /** Convert arrays of similar objects to Markdown tables. Default: true */
  tableifyArrays?: boolean
  /** Minimum array length to trigger table conversion. Default: 3 */
  tableifyThreshold?: number
  /** Enable UUID/SHA to short-pointer replacement. Default: true */
  enableAliasing?: boolean
  /** Convert ISO date strings to relative time (e.g. "2 days ago"). Default: true */
  relativeDates?: boolean
  /** Enable whole-pipeline pre-processing (JSON auto-parse + log dedupe). Default: true */
  enableInputGuard?: boolean
  /** Configuration for Semantic Line Deduplication */
  dedupe?: DedupeOptions
  /** Anchor date for relative time calculations (useful for testing). Default: new Date() */
  dateAnchor?: Date
  /** Custom middleware to run on every node before default engines. */
  filterNode?: FilterNodeCallback
  /** Options for PII and PHI redaction. Default: false */
  redactPII?: boolean | RedactOptions
  /** Custom token counter function (e.g. using tiktoken). */
  tokenCounter?: (text: string) => number
  /** Budgeting configuration to fit strict context windows. */
  budget?: BudgetOptions
  /** Target LLM provider to apply optimal formatting defaults. */
  targetProvider?: LLMProvider
  /** Override the default formatting strategy. Defaults to 'dmd'. */
  outputFormat?: OutputFormat
}

export interface DistillResult {
  /** The final DMD payload for the LLM */
  contextString: string
  /** Mapping of $ID_X back to original UUIDs */
  reverseMap: Map<string, string>
  /** Conservative heuristic estimate of token reduction */
  stats: {
    originalTokens: number
    distilledTokens: number
    reductionPercent: number
    durationMs: number
  }
}

export class DistillError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DistillError'
  }
}
