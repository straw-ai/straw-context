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
   * Default: true.
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
