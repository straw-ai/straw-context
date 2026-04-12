import { uuidAliaser, shaAliaser } from '../constants/aliasing.js'
import { type AliaserRule } from '../entities.js'
import { type StrawOptions } from '../models.js'

/**
 * Domain Service for Node Minification.
 * Handles lossless traversal, normalization, and aliasing of data structures.
 * This class is intended to be instantiated once per distillation pass to encapsulate state.
 */
export class Minifier {
  private readonly norm: NonNullable<StrawOptions['normalization']>
  private readonly maxDepth: number
  private readonly activeAliaser: AliaserRule[]
  private readonly aliaserCounters = new Map<string, number>()
  private readonly forwardMap = new Map<string, string>()

  constructor(
    private readonly options: StrawOptions,
    private readonly reverseMap: Map<string, string>,
    private readonly warnings?: string[],
    private readonly debugLogs?: string[],
  ) {
    this.norm = options.normalization ?? {
      nullPlaceholder: '∅',
      undefinedPlaceholder: '∅',
      normalizeEmptyStrings: false,
    }
    this.maxDepth = options.maxDepth ?? 50

    if (options.aliaser && options.aliaser.length > 0) {
      this.activeAliaser = options.aliaser
    } else if (options.enableAliasing !== false) {
      this.activeAliaser = [uuidAliaser, shaAliaser]
    } else {
      this.activeAliaser = []
    }
  }

  /**
   * Universal node minification pass (Lossless).
   * @param input The raw JSON object or Array to transform.
   */
  public minify(input: unknown): unknown {
    return this.walk(input)
  }

  private walk(
    node: unknown,
    key: string = '',
    path: string = '',
    visited = new WeakSet(),
    depth = 0,
  ): unknown {
    // 1. Depth Capping (Lossless Normalization)
    const isComplex = typeof node === 'object' && node !== null
    if (depth > this.maxDepth || (depth === this.maxDepth && isComplex)) {
      if (this.warnings && isComplex) {
        this.warnings.push(
          `Max depth of ${this.maxDepth} reached at path: "${path || '(root)'}". Node normalized to ${this.norm.nullPlaceholder ?? '∅'}.`,
        )
      }
      return isComplex ? (this.norm.nullPlaceholder ?? '∅') : node
    }

    // 2. Primitives & Normalization (Lossless)
    if (node === null) {
      return this.norm.nullPlaceholder ?? '∅'
    }

    if (node === undefined) {
      return this.norm.undefinedPlaceholder ?? '∅'
    }

    if (node === '' && this.norm.normalizeEmptyStrings) {
      return this.norm.nullPlaceholder ?? '∅'
    }

    if (typeof node === 'string') {
      let finalStr = node

      // Aliasing (Programmatic Rules)
      if (this.activeAliaser.length > 0) {
        for (const rule of this.activeAliaser) {
          finalStr = finalStr.replace(rule.pattern, (match) => {
            if (this.forwardMap.has(match)) {
              return this.forwardMap.get(match)!
            }

            const count = this.aliaserCounters.get(rule.prefix) || 0
            const alias = `$${rule.prefix}_${count}`
            this.aliaserCounters.set(rule.prefix, count + 1)

            this.forwardMap.set(match, alias)
            this.reverseMap.set(alias, match)

            if (this.debugLogs) {
              this.debugLogs.push(
                `[Aliaser:${rule.name}] Aliasing "${match.slice(0, 8)}..." -> ${alias} at "${path}"`,
              )
            }
            return alias
          })
        }
      }
      return finalStr
    }

    if (typeof node !== 'object') {
      return node
    }

    // 2. Circularity Check (Lossless)
    if (visited.has(node)) {
      if (this.warnings) {
        this.warnings.push(
          `Circular reference detected at path: "${path || '(root)'}". Node normalized to placeholder.`,
        )
      }
      return this.norm.nullPlaceholder ?? '∅'
    }
    visited.add(node)

    // 3. Arrays (Lossless)
    if (Array.isArray(node)) {
      return node.map((item, idx) =>
        this.walk(item, String(idx), path ? `${path}.${idx}` : String(idx), visited, depth + 1),
      )
    }

    // 4. Objects (Lossless Refactor: Never Drop Keys)
    const nodeRecord = node as Record<string, unknown>
    return Object.entries(nodeRecord).reduce<Record<string, unknown>>((acc, [k, v]) => {
      const subPath = path ? `${path}.${k}` : k
      acc[k] = this.walk(v, k, subPath, visited, depth + 1)
      return acc
    }, {})
  }
}
