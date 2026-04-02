import { truncate, formatOutput } from './engines.js'
import type { DistillOptions, BudgetOptions, OutputFormat } from './types.js'

export class Budgeter {
  /**
   * Prunes the distilled object to fit within the maxContextTokens budget.
   */
  static prune(
    node: any,
    options: DistillOptions,
    tokenCounter: (text: string) => number,
    format: OutputFormat = 'dmd',
  ): any {
    const budget = options.budget!
    let current = node

    // Pass 1: Iterative String Dilation
    const dilationFactors = [0.5, 0.25, 0.1, 0.05, 0.02]
    const baseMaxLen = options.maxStringLength ?? 1000

    for (const factor of dilationFactors) {
      if (this.isWithinBudget(current, budget, options, tokenCounter, format)) return current
      current = this.applyStringDilation(
        current,
        baseMaxLen,
        factor,
        options.stringTruncationStrategy ?? 'middle',
      )
    }

    if (this.isWithinBudget(current, budget, options, tokenCounter, format)) return current

    // Pass 2: Branch Pruning (Priority)
    if (budget.strategy === 'priority') {
      current = this.pruneByPriority(current, budget)
      if (this.isWithinBudget(current, budget, options, tokenCounter, format)) return current
    }

    // Pass 3: Array Truncation (More aggressive)
    for (let i = 0; i < 10; i++) {
      if (this.isWithinBudget(current, budget, options, tokenCounter, format)) return current
      const { next, changed } = this.truncateArraysAggressive(current)
      if (!changed) break
      current = next
    }

    // Pass 4: Iterative Depth-First Pruning (The "Nuke" option)
    for (let i = 0; i < 20; i++) {
      if (this.isWithinBudget(current, budget, options, tokenCounter, format)) return current
      const { next, changed } = this.pruneOneLevel(current, budget)
      if (!changed) break
      current = next
    }

    return current
  }

  private static isWithinBudget(
    node: any,
    budget: BudgetOptions,
    options: DistillOptions,
    tokenCounter: (text: string) => number,
    format: OutputFormat,
  ): boolean {
    const output = formatOutput(node, format, {
      tableifyArrays: options.tableifyArrays ?? true,
      tableifyThreshold: options.tableifyThreshold ?? 3,
    })
    return tokenCounter(output) <= budget.maxContextTokens
  }

  private static applyStringDilation(
    node: any,
    maxLen: number,
    ratio: number,
    strategy: 'middle' | 'end' | 'start',
  ): any {
    const newMax = Math.max(10, Math.floor(maxLen * ratio))
    const walk = (n: any): any => {
      if (typeof n === 'string') return truncate(n, newMax, strategy)
      if (Array.isArray(n)) return n.map(walk)
      if (typeof n === 'object' && n !== null) {
        const obj: any = {}
        for (const [k, v] of Object.entries(n)) obj[k] = walk(v)
        return obj
      }
      return n
    }
    return walk(node)
  }

  private static pruneByPriority(node: any, budget: BudgetOptions): any {
    const lowPriority = new Set(budget.lowPriorityKeys ?? [])
    const essential = new Set(budget.essentialKeys ?? [])
    const walk = (n: any, path: string = ''): any => {
      if (typeof n !== 'object' || n === null) return n
      if (Array.isArray(n)) {
        return n.map((item, idx) => walk(item, `${path}.${idx}`)).filter((v) => v !== undefined)
      }
      const obj: any = {}
      for (const [k, v] of Object.entries(n)) {
        const subPath = path ? `${path}.${k}` : k
        if (
          (lowPriority.has(k) || lowPriority.has(subPath)) &&
          !essential.has(k) &&
          !essential.has(subPath)
        )
          continue
        const val = walk(v, subPath)
        if (val !== undefined) obj[k] = val
      }
      return Object.keys(obj).length > 0 ? obj : undefined
    }
    return walk(node)
  }

  private static truncateArraysAggressive(node: any): { next: any; changed: boolean } {
    let changed = false
    const walk = (n: any): any => {
      if (Array.isArray(n)) {
        // Find real items (exclude summary strings)
        const realItems = n.filter(
          (item) => typeof item !== 'string' || !item.startsWith('... [pruned'),
        )
        const summaryItem = n.find(
          (item) => typeof item === 'string' && item.startsWith('... [pruned'),
        )

        if (realItems.length > 1) {
          const originalSize = realItems.length
          const halfSize = Math.floor(originalSize / 2)
          const keptItems = realItems.slice(0, halfSize)

          let prunedTotal = originalSize - halfSize
          if (summaryItem) {
            const match = summaryItem.match(/\[pruned (\d+) items\]/)
            if (match) prunedTotal += parseInt(match[1], 10)
          }

          changed = true
          const result = [...keptItems.map(walk), `... [pruned ${prunedTotal} items]`]
          return result
        }
        return n.map(walk)
      }
      if (typeof n === 'object' && n !== null) {
        const obj: any = {}
        for (const [k, v] of Object.entries(n)) obj[k] = walk(v)
        return obj
      }
      return n
    }
    return { next: walk(node), changed }
  }

  private static pruneOneLevel(node: any, budget: BudgetOptions): { next: any; changed: boolean } {
    const essential = new Set(budget.essentialKeys ?? [])
    let changed = false

    const getDepth = (n: any): number => {
      if (typeof n !== 'object' || n === null) return 0
      const vals: any[] = Array.isArray(n) ? n : Object.values(n)
      if (vals.length === 0) return 0
      return 1 + Math.max(0, ...vals.map(getDepth))
    }

    const currentMaxDepth = getDepth(node)
    const targetDepth = Math.max(0, currentMaxDepth - 1)

    const walk = (n: any, currentDepth: number, path: string = ''): any => {
      if (typeof n !== 'object' || n === null) return n

      if (Array.isArray(n)) {
        const res = []
        let pruneCount = 0
        for (let i = 0; i < n.length; i++) {
          const item = n[i]
          const subPath = `${path}.${i}`

          // Skip summary strings from being pruned themselves if we are exactly at target depth
          const isSummary =
            typeof item === 'string' &&
            (item.startsWith('... [pruned') || item.includes('hidden items'))

          if (!isSummary && currentDepth === targetDepth && !essential.has(subPath)) {
            pruneCount++
            changed = true
            continue
          }

          const val = walk(item, currentDepth + 1, subPath)
          if (val !== undefined) res.push(val)
        }

        if (pruneCount > 0) {
          // Merge with existing prune summary if present
          let totalPruned = pruneCount
          const existingSummaryIdx = res.findIndex(
            (it) => typeof it === 'string' && it.startsWith('... [pruned'),
          )
          if (existingSummaryIdx !== -1) {
            const match = (res[existingSummaryIdx] as string).match(/\[pruned (\d+) items\]/)
            if (match && match[1]) totalPruned += parseInt(match[1], 10)
            res.splice(existingSummaryIdx, 1)
          }
          res.push(`... [pruned ${totalPruned} items]`)
        }
        return res.length > 0 ? res : undefined
      }

      const obj: any = {}
      let hasKeys = false
      let pruneCount = 0
      for (const [k, v] of Object.entries(n)) {
        const subPath = path ? `${path}.${k}` : k

        if (currentDepth === targetDepth && !essential.has(k) && !essential.has(subPath)) {
          pruneCount++
          changed = true
          continue
        }

        const val = walk(v, currentDepth + 1, subPath)
        if (val !== undefined) {
          obj[k] = val
          hasKeys = true
        }
      }
      if (pruneCount > 0) {
        obj['__straw_pruned'] = `[${pruneCount} hidden items]`
        hasKeys = true
      }
      return hasKeys ? obj : undefined
    }

    const result = walk(node, 0)
    let next = result
    if (result === undefined) next = Array.isArray(node) ? [] : {}
    return { next, changed }
  }
}
