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

    // Pass 1: Iterative String Dilation (Steps: 50%, 25%, 10%, 5%, 2%)
    // This scales down strings until they hit a sensible floor.
    const dilationFactors = [0.5, 0.25, 0.1, 0.05, 0.02]
    const baseMaxLen = options.maxStringLength ?? 1000

    for (const factor of dilationFactors) {
      if (this.isWithinBudget(current, budget, options, tokenCounter, format)) return current
      current = this.applyStringDilation(current, baseMaxLen, factor)
    }

    if (this.isWithinBudget(current, budget, options, tokenCounter, format)) return current

    // Pass 2: Branch Pruning (Priority)
    if (budget.strategy === 'priority') {
      current = this.pruneByPriority(current, budget)
      if (this.isWithinBudget(current, budget, options, tokenCounter, format)) return current
    }

    // Pass 3: Array Truncation (Halve large arrays iteratively)
    for (let i = 0; i < 10; i++) {
      if (this.isWithinBudget(current, budget, options, tokenCounter, format)) return current
      const next = this.truncateArrays(current)
      if (JSON.stringify(next) === JSON.stringify(current)) break
      current = next
    }

    // Pass 4: Iterative Depth-First Pruning (The "Nuke" option)
    // We prune levels one by one from the bottom up until it fits.
    for (let i = 0; i < 10; i++) {
      if (this.isWithinBudget(current, budget, options, tokenCounter, format)) return current
      const next = this.pruneOneLevel(current, budget)
      if (next === current) break
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

  private static applyStringDilation(node: any, maxLen: number, ratio: number): any {
    // Ensure the floor is actually small enough (e.g. 10 chars)
    const newMax = Math.max(10, Math.floor(maxLen * ratio))

    const walk = (n: any): any => {
      if (typeof n === 'string') return truncate(n, newMax)
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

        // If it's low priority and NOT essential, drop it
        if (lowPriority.has(k) || lowPriority.has(subPath)) {
          if (!essential.has(k) && !essential.has(subPath)) {
            continue
          }
        }

        const val = walk(v, subPath)
        if (val !== undefined) obj[k] = val
      }
      return Object.keys(obj).length > 0 ? obj : undefined
    }

    return walk(node)
  }

  private static truncateArrays(node: any): any {
    const walk = (n: any): any => {
      if (Array.isArray(n)) {
        // Halve arrays that have more than 2 elements
        const trimmed = n.length > 2 ? n.slice(0, Math.ceil(n.length / 2)) : n
        return trimmed.map(walk)
      }
      if (typeof n === 'object' && n !== null) {
        const obj: any = {}
        for (const [k, v] of Object.entries(n)) obj[k] = walk(v)
        return obj
      }
      return n
    }
    return walk(node)
  }

  private static pruneOneLevel(node: any, budget: BudgetOptions): any {
    const essential = new Set(budget.essentialKeys ?? [])

    const getDepth = (n: any): number => {
      if (typeof n !== 'object' || n === null) return 0
      const vals: any[] = Array.isArray(n) ? n : Object.values(n)
      if (vals.length === 0) return 0
      return 1 + Math.max(0, ...vals.map(getDepth))
    }

    const currentMaxDepth = getDepth(node)
    const targetDepth = Math.max(0, currentMaxDepth - 1)
    let pruneHappened = false

    const walk = (n: any, currentDepth: number, path: string = ''): any => {
      if (typeof n !== 'object' || n === null) return n

      if (Array.isArray(n)) {
        const res = []
        for (let i = 0; i < n.length; i++) {
          const item = n[i]
          const subPath = `${path}.${i}`

          if (!pruneHappened && currentDepth === targetDepth && !essential.has(subPath)) {
            pruneHappened = true
            continue
          }

          const val = walk(item, currentDepth + 1, subPath)
          if (val !== undefined) res.push(val)
        }
        return res.length > 0 ? res : undefined
      }

      const obj: any = {}
      let hasKeys = false
      for (const [k, v] of Object.entries(n)) {
        const subPath = path ? `${path}.${k}` : k

        if (
          !pruneHappened &&
          currentDepth === targetDepth &&
          !essential.has(k) &&
          !essential.has(subPath)
        ) {
          pruneHappened = true
          continue
        }

        const val = walk(v, currentDepth + 1, subPath)
        if (val !== undefined) {
          obj[k] = val
          hasKeys = true
        }
      }
      return hasKeys ? obj : undefined
    }

    const result = walk(node, 0)
    if (result === undefined) return Array.isArray(node) ? [] : {}
    return result
  }
}
