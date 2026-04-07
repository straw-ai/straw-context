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
   * 'blocklist': Drop elements explicitly listed in dropKeys/blocklist.
   * 'allowlist': Drop EVERYTHING unless it matches a preserveKey.
   * @default 'blocklist'
   */
  mode?: 'blocklist' | 'allowlist'
  /**
   * Composable arrays of noisy keys to drop.
   * Example: [genericBlocklist, githubBlocklist]
   */
  blocklist?: string[][]
  /**
   * Configuration for how the scrubber handles empty or null primitives.
   */
  pruning?: PruningOptions
  /**
   * If true or provided with options, enables PII/PHI redaction.
   * Default: false
   */
  redactPII?: boolean | RedactOptions
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

/**
 * Configuration for how the scrubber handles empty or null primitives.
 */
export interface PruningOptions {
  /** If true, drops null values. @default true */
  null?: boolean
  /** If true, drops undefined values. @default true */
  undefined?: boolean
  /** If true, drops empty strings (""). @default true */
  emptyString?: boolean
  /** If true, drops arrays that contain no elements after scrubbing. @default false */
  array?: boolean
  /** If true, drops objects that contain no properties after scrubbing. @default true */
  object?: boolean
  /** Alternative representation for nulls (e.g. "NULL", "∅"). If set, nulls are REPLACED, not dropped. */
  nullReplacement?: string
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
  /**
   * If true, allows the Budgeter to dynamically shrink string lengths
   * to fit the budget before dropping nodes.
   * @default false
   */
  allowDynamicTruncation?: boolean
}

export type LLMProvider = 'openai' | 'anthropic' | 'gemini' | 'meta' | 'generic'
export type OutputFormat = 'dmd' | 'xml' | 'json' | 'yaml'

/**
 * Custom middleware escape hatch.
 * Return true to KEEP, false to DROP, or undefined to use default engine logic.
 */
export type FilterNodeCallback = (key: string, value: any, path: string) => boolean | undefined

export interface FilterRule {
  /** Regex to match against the key name */
  key?: RegExp
  /** Regex to match against the full dot-notation path */
  path?: RegExp
  /** Whether to keep or drop the matching node */
  action: 'drop' | 'keep'
}

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

/**
 * Core Rule for the PII Redactor Engine.
 * Replaces sensitive data (Email, CC, etc.) with stable tokens wrapped in <>.
 */
export interface RedactorRule {
  /** Descriptive name of the redactor (e.g. 'email') */
  readonly name: string
  /** The pattern to find in strings */
  readonly pattern: RegExp
  /** The prefix for generated tokens (e.g. 'EMAIL' becomes <EMAIL_0>) */
  readonly prefix: string
}

export interface DistillOptions extends ScrubberOptions {
  /**
   * Name of one or more pre-defined configuration templates (e.g. 'github', 'stripe', 'graphql').
   * If provided as an array, presets are merged in order.
   */
  preset?: string | string[]
  /** Hard cap on string values. Disabled by default. */
  maxStringLength?: number
  /**
   * Strategy for string truncation when maxStringLength is exceeded.
   * @default 'end'
   */
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
  /**
   * Anchor date for relative time calculations (useful for testing).
   * @default new Date()
   */
  dateAnchor?: Date
  /**
   * Maximum depth for recursive object traversal.
   * Prevents stack overflows on extremely deep objects.
   * @default 50
   */
  maxDepth?: number
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
  /** Array of custom regex rules to filter nodes by key or path. */
  filters?: FilterRule[]
  /** Array of programmatic rules to alias IDs, SHAs, or custom patterns. */
  aliaser?: AliaserRule[]
  /** Array of programmatic rules to redact PII (e.g. email, phone). */
  redactors?: RedactorRule[]
  /** Target LLM provider to apply optimal formatting defaults. */
  targetProvider?: LLMProvider
  /** Override the default formatting strategy. @default 'dmd' */
  outputFormat?: OutputFormat
  /** Enable debug tracing of the distillation process. */
  debug?: boolean
}

export interface DistillResult {
  /** The final distilled payload for the LLM */
  contextString: string
  /** Mapping of $ID_X back to original UUIDs/SHAs */
  reverseMap: Map<string, string>
  /** Size of the original input string in bytes */
  originalSizeBytes: number
  /** Size of the final distilled string in bytes */
  distilledSizeBytes: number
  /** Comparative statistics regarding token reduction */
  stats: {
    /** Tokens of the 2-space indented JSON baseline (The User's Truth) */
    baselineTokens: number
    /** Tokens of the minified JSON baseline (The Technical Floor) */
    minifiedTokens: number
    /** Final tokens of the distilled Straw output (The New Reality) */
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
