import { ContextDistiller } from './index.js'
import type { DistillOptions, DistillResult } from './types.js'

/**
 * ContextSession provides a stateful way to accumulate context fragments
 * for a single LLM prompt. It handles the merging of fragments and
 * final distillation with a unified budget.
 */
export class ContextSession {
  private fragments: any[] = []
  private options: DistillOptions

  constructor(options: DistillOptions = {}) {
    this.options = options
  }

  /**
   * Appends a new data fragment to the session.
   * Fragments are stored individually and merged during finalization.
   */
  append(data: any): void {
    if (data === null || data === undefined) return
    this.fragments.push(data)
  }

  /**
   * Clears all accumulated fragments.
   */
  clear(): void {
    this.fragments = []
  }

  /**
   * Distills all accumulated fragments into a single minified string.
   * If multiple fragments are present, they are treated as an array of items.
   */
  distill(overrideOptions?: Partial<DistillOptions>): DistillResult {
    const opts = { ...this.options, ...overrideOptions }

    // If we only have one fragment, distill it directly
    if (this.fragments.length === 1) {
      return ContextDistiller.distill(this.fragments[0], opts)
    }

    // Otherwise, wrap all fragments in an array for unified budgeting and formatting
    return ContextDistiller.distill(this.fragments, opts)
  }
}
