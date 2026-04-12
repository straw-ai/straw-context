import yaml from 'js-yaml'

import { type OutputFormat, type AliaserRule, type DistillOptions } from './types.js'

/**
 * --- Engine A: The Minifier ---
 * Specialized Node walker for pruning, aliasing, and formatting.
 * Higher-fidelity than a generic compressor, but zero-trust (no structural filtering).
 */

export const uuidAliaser: AliaserRule = {
  name: 'uuid',
  pattern: /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/gi,
  prefix: 'UUID',
} as const

export const shaAliaser: AliaserRule = {
  name: 'sha',
  pattern: /\b[a-f0-9]{32,128}\b/gi,
  prefix: 'SHA',
} as const

/**
 * Unified node minification pass (Lossless).
 */
export function minifyNode(
  input: unknown,
  options: DistillOptions,
  reverseMap: Map<string, string>,
  warnings?: string[],
  debugLogs?: string[],
): unknown {
  const norm = options.normalization ?? {
    nullPlaceholder: '∅',
    undefinedPlaceholder: '∅',
    normalizeEmptyStrings: false,
  }
  const maxDepth = options.maxDepth ?? 50

  let activeAliaser: AliaserRule[] = []
  if (options.aliaser && options.aliaser.length > 0) {
    activeAliaser = options.aliaser
  } else if (options.enableAliasing !== false) {
    activeAliaser = [uuidAliaser, shaAliaser]
  }

  const aliaserCounters = new Map<string, number>()
  const forwardMap = new Map<string, string>()

  function walk(
    node: unknown,
    key: string = '',
    path: string = '',
    visited = new WeakSet(),
    depth = 0,
  ): unknown {
    // 1. Depth Capping (Lossless Normalization)
    const isComplex = typeof node === 'object' && node !== null
    if (depth > maxDepth || (depth === maxDepth && isComplex)) {
      if (warnings && isComplex) {
        warnings.push(
          `Max depth of ${maxDepth} reached at path: "${path || '(root)'}". Node normalized to ${norm.nullPlaceholder ?? '∅'}.`,
        )
      }
      return isComplex ? (norm.nullPlaceholder ?? '∅') : node
    }

    // 2. Primitives & Normalization (Lossless)
    if (node === null) {
      return norm.nullPlaceholder ?? '∅'
    }

    if (node === undefined) {
      return norm.undefinedPlaceholder ?? '∅'
    }

    if (node === '' && norm.normalizeEmptyStrings) {
      return norm.nullPlaceholder ?? '∅'
    }

    if (typeof node === 'string') {
      let finalStr = node

      // Engine C: Aliasing (Programmatic Rules)
      if (activeAliaser.length > 0) {
        for (const rule of activeAliaser) {
          finalStr = finalStr.replace(rule.pattern, (match) => {
            if (forwardMap.has(match)) {
              return forwardMap.get(match)!
            }

            const count = aliaserCounters.get(rule.prefix) || 0
            const alias = `$${rule.prefix}_${count}`
            aliaserCounters.set(rule.prefix, count + 1)

            forwardMap.set(match, alias)
            reverseMap.set(alias, match)

            if (debugLogs) {
              debugLogs.push(
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
      if (warnings) {
        warnings.push(
          `Circular reference detected at path: "${path || '(root)'}". Node normalized to placeholder.`,
        )
      }
      return norm.nullPlaceholder ?? '∅'
    }
    visited.add(node)

    // 3. Arrays (Lossless)
    if (Array.isArray(node)) {
      return node.map((item, idx) =>
        walk(item, String(idx), path ? `${path}.${idx}` : String(idx), visited, depth + 1),
      )
    }

    // 4. Objects (Lossless Refactor: Never Drop Keys)
    const nodeRecord = node as Record<string, unknown>
    return Object.entries(nodeRecord).reduce<Record<string, unknown>>((acc, [k, v]) => {
      const subPath = path ? `${path}.${k}` : k
      acc[k] = walk(v, k, subPath, visited, depth + 1)
      return acc
    }, {})
  }

  return walk(input)
}

// --- Engine D: DMD (Dense Markdown Data) & TOON (Table Oriented Object Notation) ---

/**
 * Universal Formatter Orchestrator
 */
export function formatOutput(
  input: unknown,
  format: OutputFormat,
  options: { tableifyArrays: boolean; tableifyThreshold: number },
): string {
  if (input === null || input === undefined) return ''

  switch (format) {
    case 'xml':
      return formatToXML(input)
    case 'json':
      return formatToJSON(input)
    case 'yaml':
      return formatToYAML(input)
    case 'toon':
      return formatToTOON(input)
    case 'dmd':
    default:
      return formatToDMD(input, options)
  }
}

/**
 * --- Official TOON (Token-Oriented Object Notation) Engine ---
 */

const TOON_DEFAULT_DELIMITER = ','
const TOON_NULL_LITERAL = '∅'

export function encodeToonPrimitive(value: unknown): string {
  if (value === null || value === undefined) return TOON_NULL_LITERAL
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number') return String(value)

  const str = String(value)
  // Spec: If string contains delimiter, newline, or is ambiguous, quote it.
  const needsQuoting =
    str.includes(TOON_DEFAULT_DELIMITER) ||
    str.includes('\n') ||
    str.includes(':') ||
    str.includes('"') ||
    str.trim() !== str

  if (!needsQuoting) return str
  return `"${str.replace(/"/g, '\\"')}"`
}

function formatToonHeader(
  length: number,
  options?: { key?: string | undefined; fields?: string[] | undefined },
): string {
  let header = options?.key ? `${options.key}` : ''
  header += `[${length}]`
  if (options?.fields) {
    header += `{${options.fields.join(TOON_DEFAULT_DELIMITER)}}`
  }
  header += ':'
  return header
}

/**
 * Official TOON Recursive Encoder
 */
export function formatToTOON(input: unknown, depth: number = 0, key?: string): string {
  const spacing = '  '.repeat(depth)

  if (Array.isArray(input)) {
    if (input.length === 0) return `${spacing}${formatToonHeader(0, { key })}`

    const tabularResult = getTabularMetadata(input)
    if (tabularResult) {
      const { keys } = tabularResult
      const header = formatToonHeader(input.length, { fields: keys, key })
      const headerLine = `${spacing}${header}`
      const rows = input
        .map((row) => {
          const values = keys.map((k) => encodeToonPrimitive((row as any)?.[k]))
          return `\n${'  '.repeat(depth + 1)}${values.join(TOON_DEFAULT_DELIMITER)}`
        })
        .join('')
      return `${headerLine}${rows}`
    }

    // List Array
    const headerLine = `${spacing}${formatToonHeader(input.length, { key })}`
    const items = input
      .map((item) => {
        const formatted = formatToTOON(item, depth + 1)
        return `\n${'  '.repeat(depth + 1)}- ${formatted.trim()}`
      })
      .join('')
    return `${headerLine}${items}`
  }

  if (typeof input === 'object' && input !== null) {
    const entries = Object.entries(input)
    if (entries.length === 0) return '{}'

    return entries
      .map(([k, v]) => {
        if (Array.isArray(v)) {
          return formatToTOON(v, depth, k)
        }

        const isComplex = typeof v === 'object' && v !== null && Object.keys(v).length > 0

        if (isComplex) {
          return `${spacing}${k}:\n${formatToTOON(v, depth + 1)}`
        } else {
          return `${spacing}${k}: ${encodeToonPrimitive(v)}`
        }
      })
      .join('\n')
  }

  return encodeToonPrimitive(input)
}

function getTabularMetadata(arr: any[]): { keys: string[] } | null {
  if (arr.length < 2) return null

  // Sample up to 10 items for eligibility
  const sample = arr.slice(0, 10)
  if (sample.some((s) => typeof s !== 'object' || s === null || Array.isArray(s))) return null

  // Robust Union-Scan for Headers
  const allKeys = new Set<string>()
  for (const s of sample) {
    Object.keys(s).forEach((k) => allKeys.add(k))
  }

  const keys = Array.from(allKeys)
  if (keys.length === 0) return null

  // Check if it's "mostly" tabular (at least 50% primitives in values)
  // This avoids trying to table-ify arrays of nested objects which TOON spec discourages
  const nestedCount = sample.reduce((acc, obj) => {
    return acc + Object.values(obj).filter((v) => typeof v === 'object' && v !== null).length
  }, 0)

  if (nestedCount > (sample.length * keys.length) / 2) {
    return null
  }

  return { keys }
}

export function formatToYAML(input: unknown): string {
  try {
    return yaml.dump(input, {
      indent: 2,
      lineWidth: -1, // Don't wrap lines
      noRefs: true,
      sortKeys: true,
    })
  } catch (e) {
    return `[YAML Error: ${String(e)}]`
  }
}

export function formatToXML(input: unknown): string {
  function toXML(node: unknown, indent: number = 0): string {
    const spacing = '  '.repeat(indent)

    if (Array.isArray(node)) {
      if (node.length === 0) {
        return ''
      }
      return node.map((item) => `\n${spacing}<item>${toXML(item, indent + 1)}</item>`).join('')
    }

    if (typeof node === 'object' && node !== null) {
      const entries = Object.entries(node as Record<string, unknown>)
      if (entries.length === 0) {
        return ''
      }
      return entries
        .map(([key, value]) => {
          const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_')
          const inner = toXML(value, indent + 1)
          const closeTagSpacing = inner.includes('\n') ? `\n${spacing}` : ''
          return `\n${spacing}<${safeKey}>${inner}${closeTagSpacing}</${safeKey}>`
        })
        .join('')
    }

    return escapeXML(String(node))
  }

  return `<context>${toXML(input)}</context>`.trim()
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function formatToJSON(input: unknown): string {
  return JSON.stringify(input, null, 2)
}

export function formatToDMD(
  input: unknown,
  options: { tableifyArrays: boolean; tableifyThreshold: number },
): string {
  function toMarkdown(node: unknown, indent: number = 0, inline: boolean = false): string {
    const spacing = '  '.repeat(indent)

    if (Array.isArray(node)) {
      if (node.length === 0) {
        return '[]'
      }

      // Attempt Table-ification
      if (
        options.tableifyArrays &&
        node.length >= options.tableifyThreshold &&
        isArrayOfSimilarObjects(node)
      ) {
        return formatToTOON(node, indent).trim()
      }

      return node.map((item) => `\n${spacing}- ${toMarkdown(item, indent + 1, true)}`).join('')
    }

    if (typeof node === 'object' && node !== null) {
      const entries = Object.entries(node as Record<string, unknown>)
      if (entries.length === 0) {
        return '{}'
      }
      return entries
        .map(([key, value], idx) => {
          const isFirstInline = inline && idx === 0
          const currentPadding = isFirstInline ? '' : spacing
          const currentNewline = isFirstInline ? '' : '\n'
          return `${currentNewline}${currentPadding}${key}: ${toMarkdown(value, indent + 1)}`
        })
        .join('')
    }

    return String(node)
  }

  const output = toMarkdown(input).trim()
  return output
}

function isArrayOfSimilarObjects(arr: unknown[]): boolean {
  if (arr.length < 2) {
    return false
  }
  const sample = arr.slice(0, 3)

  if (sample.some((s) => typeof s !== 'object' || s === null || Array.isArray(s))) {
    return false
  }

  const keysSet = sample.map((s) => new Set(Object.keys(s as Record<string, unknown>)))
  const firstKeys = Object.keys(sample[0] as Record<string, unknown>)

  return keysSet.slice(1).every((currentKeys) => {
    const overlapCount = firstKeys.reduce(
      (count, key) => (currentKeys.has(key) ? count + 1 : count),
      0,
    )
    const overlap = overlapCount / Math.max(firstKeys.length, 1)
    return overlap >= 0.8
  })
}
