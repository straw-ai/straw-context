import yaml from 'js-yaml'

import { genericBlocklist } from './constants.js'
import { redactString, defaultRedactors } from './pii.js'
import {
  type ScrubberOptions,
  type FilterNodeCallback,
  type OutputFormat,
  type RedactOptions,
  type FilterRule,
  type AliaserRule,
  type RedactorRule,
} from './types.js'

/**
 * --- Engine A: The Heuristic Scrubber ---
 * Unified pipeline for scrubbing, aliasing, and date formatting.
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

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$/

// Hoisted Intl.RelativeTimeFormat for significant performance gains
const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('en', {
  numeric: 'always',
  style: 'long',
})

function globToRegex(pattern: string): RegExp {
  // 1. Escape all regex special characters EXCEPT '*'
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  // 2. Convert '*' to '.*'
  const regexStr = escaped.replace(/\*/g, '.*')
  return new RegExp(`^${regexStr}$`)
}

/**
 * Unified scrubber implementation.
 */
export function scrub(
  input: unknown,
  options: ScrubberOptions & {
    relativeDates?: boolean
    aliasIds?: boolean
    dateAnchor?: Date
    maxDepth?: number
    filterNode?: FilterNodeCallback
    filters?: FilterRule[]
    aliaser?: AliaserRule[]
    redactors?: RedactorRule[]
    debug?: boolean
  },
  reverseMap: Map<string, string>,
  redactPII?: RedactOptions,
  warnings?: string[],
  debugLogs?: string[],
): unknown {
  const mode = options.mode ?? 'blocklist'
  const allPreserveKeys = options.preserveKeys || []

  // Combine blocklist if in blocklist mode
  const activeBlocklist = options.blocklist ?? [genericBlocklist]
  const flattenedNoise = mode === 'blocklist' ? activeBlocklist.flat() : []
  const allDropKeys = [...(options.dropKeys || []), ...flattenedNoise]

  const pruning = options.pruning ?? {
    null: true,
    undefined: true,
    emptyString: true,
    object: true,
  }
  const maxDepth = options.maxDepth ?? 50

  const dropPatterns = allDropKeys.filter((k: string) => k.includes('*')).map(globToRegex)
  const dropLiterals = new Set<string>(allDropKeys.filter((k: string) => !k.includes('*')))

  const preservePatterns = allPreserveKeys.filter((k: string) => k.includes('*')).map(globToRegex)
  const preserveLiterals = new Set<string>(allPreserveKeys.filter((k: string) => !k.includes('*')))

  const isMatched = (key: string, path: string, literals: Set<string>, patterns: RegExp[]) =>
    literals.has(key) || literals.has(path) || patterns.some((re) => re.test(key) || re.test(path))

  const parsedPreservePrefixes = allPreserveKeys
    .filter((k: string) => k.includes('*'))
    .map((k: string) => k.split('.'))
  const literalPreserveKeys = allPreserveKeys.filter((k: string) => !k.includes('*'))

  const isPrefixMatch = (pathParts: string[], path: string): boolean => {
    for (const pk of literalPreserveKeys) {
      if (pk === path || pk.startsWith(`${path}.`)) {
        return true
      }
    }

    if (parsedPreservePrefixes.length === 0) {
      return false
    }

    for (const parts of parsedPreservePrefixes) {
      if (pathParts.length > parts.length) {
        continue
      }

      let matches = true
      for (let j = 0; j < pathParts.length; j++) {
        if (parts[j] !== '*' && parts[j] !== pathParts[j]) {
          matches = false
          break
        }
      }
      if (matches) {
        return true
      }
    }
    return false
  }

  const shouldDrop = (
    key: string,
    path: string,
    pathParts: string[],
    isAllowedParent: boolean,
    isExplicitlyKept: boolean,
  ): boolean => {
    // 0. Middleware Priority: If the user explicitly returned 'true' via filterNode, we keep it.
    if (isExplicitlyKept) {
      return false
    }

    // 1. If parent was allow-listed, we don't drop anything unless explicitly blocked
    if (isAllowedParent) {
      return isMatched(key, path, dropLiterals, dropPatterns)
    }

    // 1. PRESERVE wins everything (The "Punch-through" rule)
    if (isMatched(key, path, preserveLiterals, preservePatterns)) {
      return false
    }

    // 2. If in allowlist mode, we drop if it's NOT a preserve and NOT a prefix
    if (mode === 'allowlist') {
      return !isPrefixMatch(pathParts, path)
    }

    // 4. Custom Filters (Regex Rules) - Highest User Priority
    if (options.filters && options.filters.length > 0) {
      for (const rule of options.filters) {
        let matched = false
        if (rule.key && rule.key.test(key)) matched = true
        if (rule.path && rule.path.test(path)) matched = true

        if (matched) {
          if (rule.action === 'keep') {
            if (debugLogs)
              debugLogs.push(`[Filter] KEEP on "${path}" matched ${String(rule.key || rule.path)}`)
            return false
          }
          if (rule.action === 'drop') {
            if (debugLogs)
              debugLogs.push(`[Filter] DROP on "${path}" matched ${String(rule.key || rule.path)}`)
            return true
          }
        }
      }
    }

    // 5. User's explicit DROP list (Includes modular blocklist)
    if (isMatched(key, path, dropLiterals, dropPatterns)) {
      if (debugLogs) debugLogs.push(`[Scrubber] Dropping blocklist key: "${path}"`)
      return true
    }

    return false
  }

  let activeAliaser: AliaserRule[] = []
  if (options.aliaser && options.aliaser.length > 0) {
    activeAliaser = options.aliaser
  } else if (options.aliasIds !== false) {
    activeAliaser = [uuidAliaser, shaAliaser]
  }

  let activeRedactors: RedactorRule[] = []
  if (options.redactors && options.redactors.length > 0) {
    activeRedactors = options.redactors
  } else if (options.redactPII) {
    activeRedactors = defaultRedactors
  }

  const aliaserCounters = new Map<string, number>()
  const piiCounters = new Map<string, number>()
  const forwardMap = new Map<string, string>()

  // THE SINGLE PASS WALKER (Scrub + Date + Alias)
  function walk(
    node: unknown,
    key: string = '',
    path: string = '',
    pathParts: string[] = [],
    visited = new WeakSet(),
    isAllowedParent = false,
    depth = 0,
  ): unknown {
    if (depth > maxDepth) {
      if (warnings) {
        warnings.push(
          `Max depth of ${maxDepth} reached at path: "${path || '(root)'}". Node pruned.`,
        )
      }
      return undefined
    }
    let isExplicitlyKept = false
    // 0. Middleware Escape Hatch
    if (options.filterNode && key) {
      const decision = options.filterNode(key, node, path)
      if (decision === true) {
        if (debugLogs) debugLogs.push(`[Middleware] KEEP forced at "${path}"`)
        isExplicitlyKept = true
      } else if (decision === false) {
        if (debugLogs) debugLogs.push(`[Middleware] DROP forced at "${path}"`)
        return undefined // EXPLICIT DROP (terminal)
      }
    }

    const currentMatched =
      (key ? isMatched(key, path, preserveLiterals, preservePatterns) : false) || isExplicitlyKept
    const currentAllowed = isAllowedParent || currentMatched

    // 1. Drop Logic
    if (key && shouldDrop(key, path, pathParts, isAllowedParent, isExplicitlyKept)) {
      return undefined
    }

    // 2. Primitives & Transforms
    if (node === null) {
      if (pruning.nullReplacement !== undefined) {
        if (debugLogs)
          debugLogs.push(
            `[Scrubber] Replacing null with glyph: "${pruning.nullReplacement}" at "${path}"`,
          )
        return pruning.nullReplacement
      }
      if (pruning.null !== false && !currentMatched) {
        if (debugLogs) debugLogs.push(`[Scrubber] Pruning null at "${path}"`)
        return undefined
      }
      return null
    }

    if (node === undefined) {
      if (pruning.undefined !== false && !currentMatched) {
        if (debugLogs) debugLogs.push(`[Scrubber] Pruning undefined at "${path}"`)
        return undefined
      }
      return undefined
    }

    if (node === '') {
      if (pruning.emptyString !== false && !currentMatched) {
        if (debugLogs) debugLogs.push(`[Scrubber] Pruning empty string at "${path}"`)
        return undefined
      }
      return ''
    }

    if (typeof node === 'string') {
      let finalStr = node

      // Engine F: PII/PHI Redaction (String)
      if (activeRedactors.length > 0) {
        const onRedact =
          typeof options.redactPII === 'object' ? options.redactPII.onRedact : undefined
        finalStr = redactString(
          finalStr,
          activeRedactors,
          forwardMap,
          reverseMap,
          piiCounters,
          path,
          onRedact,
        )
      }

      // Engine E: Date formatting
      if (options.relativeDates === true && ISO_DATE_REGEX.test(finalStr)) {
        finalStr = formatRelativeTime(finalStr, options.dateAnchor)
      }

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

    // 3. Objects & Arrays
    if (visited.has(node)) {
      if (warnings) {
        warnings.push(`Circular reference detected at path: "${path || '(root)'}". Node pruned.`)
      }
      if (debugLogs) debugLogs.push(`[Scrubber] Pruning circular reference at "${path}"`)
      return undefined
    }
    visited.add(node)

    if (Array.isArray(node)) {
      const cleanedArray = node
        .map((item, idx) => {
          const strIdx = String(idx)
          return walk(
            item,
            strIdx,
            path ? `${path}.${idx}` : strIdx,
            [...pathParts, strIdx],
            visited,
            currentAllowed,
            depth + 1,
          )
        })
        .filter((v) => v !== undefined)

      if (cleanedArray.length === 0) {
        if (pruning.array) {
          if (debugLogs)
            debugLogs.push(`[Scrubber] Dropping array at "${path}" (Empty after scrubbing)`)
          return undefined
        }
        return []
      }
      return cleanedArray
    }

    // Process Objects
    const nodeRecord = node as Record<string, unknown>
    const cleanedObj = Object.entries(nodeRecord).reduce<Record<string, unknown>>((acc, [k, v]) => {
      const subPath = path ? `${path}.${k}` : k
      const cleanedValue = walk(
        v,
        k,
        subPath,
        [...pathParts, k],
        visited,
        currentAllowed,
        depth + 1,
      )

      if (cleanedValue === undefined) {
        return acc
      }

      // Engine A: Drop empty objects
      if (
        pruning.object !== false &&
        cleanedValue !== null &&
        typeof cleanedValue === 'object' &&
        !Array.isArray(cleanedValue) &&
        Object.keys(cleanedValue as Record<string, unknown>).length === 0
      ) {
        // Unless it is explicitly preserved
        if (!isMatched(k, subPath, preserveLiterals, preservePatterns)) {
          return acc
        }
      }

      acc[k] = cleanedValue
      return acc
    }, {})

    const hasKeys = Object.keys(cleanedObj).length > 0
    if (!hasKeys && key) {
      if (pruning.object !== false) {
        if (debugLogs)
          debugLogs.push(`[Scrubber] Dropping object at "${path}" (Empty after scrubbing)`)
        return undefined
      }
    }
    return hasKeys || pruning.object === false ? cleanedObj : undefined
  }

  const result = walk(input)
  return result === undefined ? (Array.isArray(input) ? [] : {}) : result
}

/**
 * Formats an ISO date string into a relative time string (e.g. "2 days ago").
 */
export function formatRelativeTime(isoString: string, anchor?: Date): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return isoString
  }

  const now = anchor ?? new Date()
  const diffInMs = date.getTime() - now.getTime()
  const absDiff = Math.abs(diffInMs)

  const seconds = Math.round(absDiff / 1000)
  const minutes = Math.round(seconds / 60)
  const hours = Math.round(minutes / 60)
  const days = Math.round(hours / 24)
  const months = Math.round(days / 30)
  const years = Math.round(days / 365)

  if (years > 0) return RELATIVE_TIME_FORMATTER.format(Math.sign(diffInMs) * years, 'year')
  if (months > 0) return RELATIVE_TIME_FORMATTER.format(Math.sign(diffInMs) * months, 'month')
  if (days > 0) return RELATIVE_TIME_FORMATTER.format(Math.sign(diffInMs) * days, 'day')
  if (hours > 0) return RELATIVE_TIME_FORMATTER.format(Math.sign(diffInMs) * hours, 'hour')
  if (minutes > 0) return RELATIVE_TIME_FORMATTER.format(Math.sign(diffInMs) * minutes, 'minute')

  return RELATIVE_TIME_FORMATTER.format(Math.sign(diffInMs) * seconds, 'second')
}

// --- Engine B: The Middle-Out Truncator ---

export function truncate(
  text: string,
  maxLength: number,
  strategy: 'middle' | 'end' | 'start' = 'middle',
): string {
  if (text.length <= maxLength) {
    return text
  }

  if (strategy === 'middle') {
    const keepChars = Math.floor(maxLength * 0.4)
    const truncatedCount = text.length - keepChars * 2
    const start = text.slice(0, keepChars)
    const end = text.slice(-keepChars)
    return `${start}...[${truncatedCount.toLocaleString()} chars truncated]...${end}`
  }

  if (strategy === 'end') {
    const keepChars = Math.floor(maxLength * 0.8)
    const truncatedCount = text.length - keepChars
    const start = text.slice(0, keepChars)
    return `${start}...[${truncatedCount.toLocaleString()} chars truncated at end]`
  }

  if (strategy === 'start') {
    const keepChars = Math.floor(maxLength * 0.8)
    const truncatedCount = text.length - keepChars
    const end = text.slice(-keepChars)
    return `[${truncatedCount.toLocaleString()} chars truncated at start]...${end}`
  }

  return text
}

// --- Engine D: DMD (Dense Markdown Data) Formatter ---

/**
 * Universal Formatter Orchestrator
 */
export function formatOutput(
  input: unknown,
  format: OutputFormat,
  options: { tableifyArrays: boolean; tableifyThreshold: number },
): string {
  switch (format) {
    case 'xml':
      return formatToXML(input)
    case 'json':
      return formatToJSON(input)
    case 'yaml':
      return formatToYAML(input)
    case 'dmd':
    default:
      return formatToDMD(input, options)
  }
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
        return formatAsTable(node, indent)
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

  return toMarkdown(input).trim()
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

function formatAsTable(arr: unknown[], indent: number): string {
  const sample = arr.slice(0, 3)
  const allKeys = Array.from(
    new Set(sample.flatMap((s) => Object.keys(s as Record<string, unknown>))),
  )
  const spacing = '  '.repeat(indent)

  const header = allKeys.join(' | ')
  const rows = arr.map((item) => {
    const itemRecord = item as Record<string, unknown>
    const values = allKeys.map((k) => {
      const val = itemRecord[k]
      if (val === undefined || val === null) {
        return ''
      }
      const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val)
      return strVal.replace(/\|/g, '\\|')
    })
    return values.join(' | ')
  })

  return `\n${spacing}${header}\n${spacing}${rows.join(`\n${spacing}`)}`
}
