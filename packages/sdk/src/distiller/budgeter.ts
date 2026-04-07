import { formatOutput, truncate } from './engines.js'
import type { DistillOptions, BudgetOptions, OutputFormat } from './types.js'

export interface NodeWeight {
  path: string
  cost: number
  isEssential: boolean
  depth: number
}

export class Budgeter {
  private static isWithinBudget(
    node: unknown,
    budget: BudgetOptions,
    options: DistillOptions,
    tokenCounter: (text: string) => number,
    format: OutputFormat,
  ): boolean {
    const output = formatOutput(node, format, {
      tableifyArrays: options.tableifyArrays ?? false,
      tableifyThreshold: options.tableifyThreshold ?? 3,
    })
    return tokenCounter(output) <= budget.maxContextTokens
  }

  /**
   * The "Ghost Walk" Budgeter: Prunes the distilled object to fit within the maxContextTokens budget
   * using an O(N) Virtual String calculation rather than physical stringification.
   */
  public static prune(
    node: unknown,
    options: DistillOptions,
    tokenCounter: (text: string) => number,
    format: OutputFormat = 'dmd',
  ): { node: unknown; warnings: string[]; droppedPaths: Set<string> } {
    if (!options.budget) {
      return { node, warnings: [], droppedPaths: new Set() }
    }

    const { budget } = options
    const warnings: string[] = []
    const droppedPaths = new Set<string>()

    const essentialKeys = new Set(budget.essentialKeys ?? [])
    const lowPriorityKeys = new Set(budget.lowPriorityKeys ?? [])

    let current = node
    if (
      options.maxStringLength !== undefined &&
      options.maxStringLength > 0 &&
      budget.allowDynamicTruncation === true
    ) {
      const dilationFactors = [0.5, 0.25, 0.1, 0.05, 0.02]
      const baseMaxLen = options.maxStringLength
      const strategy = options.stringTruncationStrategy ?? 'end'

      const isWithin = () => Budgeter.isWithinBudget(current, budget, options, tokenCounter, format)

      dilationFactors.some((factor) => {
        if (isWithin()) {
          return true
        }
        current = Budgeter.applyStringDilation(current, baseMaxLen, factor, strategy)
        return false
      })
    }

    const weights: NodeWeight[] = []
    let totalStructuralCost = 0

    const walk = (
      n: unknown,
      depth: number,
      path: string,
      keyName: string,
      visited: WeakSet<object>,
    ): number => {
      if (n === null || n === undefined) return 0

      if (typeof n === 'object' && n !== null) {
        if (visited.has(n)) return 0
        visited.add(n)
      }

      let currentCost = 0
      if (format === 'dmd') {
        const indentSize = depth * 2
        if (keyName) {
          currentCost = indentSize + keyName.length + 2
        } else {
          currentCost = indentSize + 2
        }
      } else if (format === 'xml') {
        const tag = keyName || 'item'
        currentCost = depth * 2 + tag.length * 2 + 5
      } else if (format === 'json') {
        currentCost = depth * 2 + (keyName ? keyName.length + 4 : 0)
      }

      const isEssential = budget.essentialKeys
        ? essentialKeys.has(keyName) || essentialKeys.has(path)
        : false

      let branchCost = 0
      if (Array.isArray(n)) {
        if (n.length === 0) {
          branchCost = format === 'dmd' ? 2 : 0
        } else {
          for (let i = 0; i < n.length; i++)
            branchCost += walk(n[i], depth + 1, `${path}.${i}`, '', visited)
        }
      } else if (typeof n === 'object') {
        const entries = Object.entries(n as Record<string, unknown>)
        if (entries.length === 0) {
          branchCost = 0
        } else {
          for (const [k, v] of entries)
            branchCost += walk(v, depth + 1, path ? `${path}.${k}` : k, k, visited)
        }
      } else {
        branchCost = String(n).length + 1
      }

      const totalCost = currentCost + branchCost
      totalStructuralCost += totalCost

      if (path) {
        weights.push({ path, cost: totalCost, isEssential, depth })
      }
      return totalCost
    }

    const initialVisited = new WeakSet<object>()
    if (Array.isArray(current)) {
      initialVisited.add(current)
      for (let i = 0; i < current.length; i++) walk(current[i], 0, `${i}`, '', initialVisited)
    } else if (typeof current === 'object' && current !== null) {
      initialVisited.add(current)
      for (const [k, v] of Object.entries(current as Record<string, unknown>))
        walk(v, 0, k, k, initialVisited)
    } else {
      walk(current, 0, '', '', initialVisited)
    }

    const initialFormatWithTables = formatOutput(current, format, {
      tableifyArrays: options.tableifyArrays ?? false,
      tableifyThreshold: options.tableifyThreshold ?? 3,
    })
    const exactTokens = tokenCounter(initialFormatWithTables)
    if (exactTokens <= budget.maxContextTokens) {
      return { node: current, warnings, droppedPaths: new Set() }
    }

    // To figure out how many chars to cut from the structural walk cost, we map the deficit tokens
    // through safeCharsPerToken, then blow it up by the tableification compression ratio
    // because total Walk Cost mimics Standard (No Table) format length.
    const initialFormatStandard = formatOutput(current, format, {
      tableifyArrays: false,
      tableifyThreshold: 9999,
    })
    const tableCompressionRatio =
      initialFormatStandard.length / Math.max(1, initialFormatWithTables.length)
    const deficitTokens = exactTokens - budget.maxContextTokens
    const safeCharsPerToken = Math.max(1, initialFormatWithTables.length / Math.max(1, exactTokens))
    const requiredCuts = Math.max(
      1,
      deficitTokens *
        safeCharsPerToken *
        tableCompressionRatio *
        (tableCompressionRatio > 1.05 ? 1.2 : 1.1),
    )
    let charsCut = 0
    let nodesDropped = 0
    const droppedCostMap = new Map<string, number>()

    const candidates = weights.filter((w) => !w.isEssential)

    const mappedCandidates = candidates.map((w) => {
      const parts = w.path.split('.')
      const isLowPriority = lowPriorityKeys.has(w.path) || parts.some((p) => lowPriorityKeys.has(p))
      let latestIndex = -1
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        if (p && /^\d+$/.test(p)) {
          latestIndex = parseInt(p, 10)
          break
        }
      }
      return { ...w, isLowPriority, latestIndex }
    })

    mappedCandidates.sort((a, b) => {
      if (a.isLowPriority && !b.isLowPriority) return -1
      if (!a.isLowPriority && b.isLowPriority) return 1

      if (budget.strategy === 'priority') {
        // Priority drops biggest chunks first
        return b.cost - a.cost
      }

      // Default: depth
      // Group by Array Index (Drop tail items first)
      if (a.latestIndex !== -1 && b.latestIndex !== -1 && a.latestIndex !== b.latestIndex) {
        return b.latestIndex - a.latestIndex
      }

      // Inside array groups, drop the parent container before children to ensure clean excision
      if (a.latestIndex !== -1 && b.latestIndex !== -1) return b.cost - a.cost

      // Drop deepest nodes first, then most expensive
      if (b.depth !== a.depth) return b.depth - a.depth
      return b.cost - a.cost
    })

    for (const candidate of mappedCandidates) {
      if (charsCut >= requiredCuts) break

      let isCovered = false
      let costToSubtractFromCandidate = 0

      for (const [droppedPath, droppedCost] of droppedCostMap.entries()) {
        if (candidate.path.startsWith(`${droppedPath}.`)) {
          isCovered = true
          break
        }
        if (droppedPath.startsWith(`${candidate.path}.`)) {
          costToSubtractFromCandidate += droppedCost
        }
      }

      if (!isCovered) {
        const actualNetCost = candidate.cost - costToSubtractFromCandidate
        if (actualNetCost > 0) {
          droppedCostMap.set(candidate.path, actualNetCost)
          droppedPaths.add(candidate.path)
          charsCut += actualNetCost
          nodesDropped++
        }
      }
    }

    const applyDropMask = (
      n: unknown,
      p: string = '',
      visited = new WeakSet<object>(),
    ): unknown => {
      if (p && droppedPaths.has(p)) return undefined
      if (typeof n === 'object' && n !== null) {
        if (visited.has(n)) return n // Circular ref already handled by Scrubber, but just in case
        visited.add(n)
      }

      if (Array.isArray(n)) {
        const arr = n
          .map((item, idx) => applyDropMask(item, p ? `${p}.${idx}` : `${idx}`, visited))
          .filter((x) => x !== undefined)
        return arr.length > 0 ? arr : undefined
      }
      if (typeof n === 'object' && n !== null) {
        const res: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
          const child = applyDropMask(v, p ? `${p}.${k}` : k, visited)
          if (child !== undefined) res[k] = child
        }
        return Object.keys(res).length > 0 ? res : undefined
      }
      return n
    }

    const finalNode = nodesDropped > 0 ? (applyDropMask(current) ?? {}) : current

    const lossRatio = nodesDropped / Math.max(1, weights.length)
    if (lossRatio > 0.3) {
      warnings.push(
        `High structural loss (${(lossRatio * 100).toFixed(1)}%): Virtual Weight Budgeter forced to drop nodes to meet strict token goals.`,
      )
    }

    return { node: finalNode, warnings, droppedPaths }
  }

  private static applyStringDilation(
    node: unknown,
    maxLen: number,
    ratio: number,
    strategy: 'middle' | 'end' | 'start',
  ): unknown {
    const newMax = Math.max(10, Math.floor(maxLen * ratio))

    const walk = (n: unknown, visited: WeakSet<object>): unknown => {
      if (typeof n === 'string') {
        return truncate(n, newMax, strategy)
      }

      if (typeof n === 'object' && n !== null) {
        if (visited.has(n)) return n
        visited.add(n)
      }

      if (Array.isArray(n)) {
        return n.map((item) => walk(item, visited))
      }
      if (typeof n === 'object' && n !== null) {
        return Object.entries(n as Record<string, unknown>).reduce<Record<string, unknown>>(
          (acc, [k, v]) => {
            const result = acc
            result[k] = walk(v, visited)
            return result
          },
          {},
        )
      }
      return n
    }

    return walk(node, new WeakSet<object>())
  }
}
