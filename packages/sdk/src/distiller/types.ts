export interface ScrubberOptions {
  /** Keys to completely remove from the payload */
  dropKeys?: string[]
  /** Keys to protect from truncation or dropping, even if empty/null */
  preserveKeys?: string[]
  /** Default: false ([] has semantic meaning) */
  pruneEmptyArrays?: boolean
}

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
