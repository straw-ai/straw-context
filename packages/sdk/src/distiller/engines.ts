import { DEFAULT_NOISE_KEYS } from './constants.js'
import { redactString } from './pii.js'
import {
  type ScrubberOptions,
  type FilterNodeCallback,
  type OutputFormat,
  type RedactOptions,
} from './types.js'

/**
 * --- Engine A: The Heuristic Scrubber ---
 * Unified pipeline for scrubbing, aliasing, and date formatting.
 */

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$/
const ID_REGEX =
  /\b([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}|[a-f0-9]{32,128})\b/gi

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
 * Performs a single pass over the input to scrub noise, alias IDs, and format dates.
 */
export function scrub(
  input: unknown,
  options: ScrubberOptions & {
    relativeDates?: boolean
    aliasIds?: boolean
    dateAnchor?: Date
    filterNode?: FilterNodeCallback
  },
  reverseMap: Map<string, string>,
  redactPII?: RedactOptions,
  warnings?: string[],
): unknown {
  const mode = options.mode ?? 'blocklist'
  const allDropKeys = options.dropKeys || []
  const allPreserveKeys = options.preserveKeys || []
  const useDefaultFilter = options.useSystemBlocklist ?? options.useDefaultBlacklist ?? true
  const pruneEmptyValues = options.pruneEmptyValues !== false

  const dropPatterns = allDropKeys.filter((k) => k.includes('*')).map(globToRegex)
  const dropLiterals = new Set(allDropKeys.filter((k) => !k.includes('*')))

  const preservePatterns = allPreserveKeys.filter((k) => k.includes('*')).map(globToRegex)
  const preserveLiterals = new Set(allPreserveKeys.filter((k) => !k.includes('*')))

  const isMatched = (key: string, path: string, literals: Set<string>, patterns: RegExp[]) =>
    literals.has(key) || literals.has(path) || patterns.some((re) => re.test(key) || re.test(path))

  const parsedPreservePrefixes = allPreserveKeys
    .filter((k) => k.includes('*'))
    .map((k) => k.split('.'))
  const literalPreserveKeys = allPreserveKeys.filter((k) => !k.includes('*'))

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

    // 3. User's explicit DROP list
    if (isMatched(key, path, dropLiterals, dropPatterns)) {
      return true
    }

    // 5. System's DEFAULT list (if enabled)
    if (useDefaultFilter && DEFAULT_NOISE_KEYS.has(key)) {
      return true
    }

    return false
  }

  let idCounter = 0
  const forwardMap = new Map<string, string>()
  const piiCounters: Record<string, number> = {}

  // THE SINGLE PASS WALKER (Scrub + Date + Alias)
  function walk(
    node: unknown,
    key: string = '',
    path: string = '',
    pathParts: string[] = [],
    visited = new WeakSet(),
    isAllowedParent = false,
  ): unknown {
    let isExplicitlyKept = false
    // 0. Middleware Escape Hatch
    if (options.filterNode && key) {
      const decision = options.filterNode(key, node, path)
      if (decision === true) {
        isExplicitlyKept = true
      } else if (decision === false) {
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
    // Only drop null/empty if pruneEmptyValues is true AND it's not explicitly preserved
    if (node === null || node === undefined || node === '') {
      if (pruneEmptyValues && !currentMatched) {
        return undefined
      }
      return node
    }

    if (typeof node === 'string') {
      let finalStr = node

      // Engine F: PII/PHI Redaction (String)
      if (redactPII) {
        finalStr = redactString(finalStr, redactPII, forwardMap, reverseMap, piiCounters, path)
      }

      // Engine E: Date formatting
      if (options.relativeDates === true && ISO_DATE_REGEX.test(finalStr)) {
        finalStr = formatRelativeTime(finalStr, options.dateAnchor)
      }

      // Engine C: Aliasing
      if (options.aliasIds !== false) {
        finalStr = finalStr.replace(ID_REGEX, (match) => {
          if (forwardMap.has(match)) {
            return forwardMap.get(match)!
          }
          const alias = `$ID_${idCounter}`
          idCounter += 1
          forwardMap.set(match, alias)
          reverseMap.set(alias, match)
          return alias
        })
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
          )
        })
        .filter((v) => v !== undefined)

      if (cleanedArray.length === 0) {
        return options.pruneEmptyArrays ? undefined : []
      }
      return cleanedArray
    }

    // Process Objects
    const nodeRecord = node as Record<string, unknown>
    const cleanedObj = Object.entries(nodeRecord).reduce<Record<string, unknown>>((acc, [k, v]) => {
      const subPath = path ? `${path}.${k}` : k
      const cleanedValue = walk(v, k, subPath, [...pathParts, k], visited, currentAllowed)

      if (cleanedValue === undefined) {
        return acc
      }

      // Engine A: Drop empty objects
      if (
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
    return hasKeys ? cleanedObj : undefined
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
    case 'dmd':
    default:
      return formatToDMD(input, options)
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
      return Object.entries(node as Record<string, unknown>)
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

  const header = `| ${allKeys.join(' | ')} |`
  const separator = `| ${allKeys.map(() => '---').join(' | ')} |`
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
    return `| ${values.join(' | ')} |`
  })

  return `\n${spacing}${header}\n${spacing}${separator}\n${spacing}${rows.join(`\n${spacing}`)}`
}
