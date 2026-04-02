import { DEFAULT_NOISE_KEYS } from './constants.js'
import { DistillError, type ScrubberOptions, type FilterNodeCallback } from './types.js'

// --- Engine A: Scrubber & Unified Engine ---

export { DEFAULT_NOISE_KEYS } from './constants.js'

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$/
const ID_REGEX =
  /\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{40}|[a-f0-9]{64}|[a-f0-9]{128})\b/gi

function globToRegex(pattern: string): RegExp {
  // 1. Escape all regex special characters EXCEPT '*'
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  // 2. Convert '*' to '.*'
  const regexStr = escaped.replace(/\*/g, '.*')
  return new RegExp(`^${regexStr}$`)
}

// --- THE Unified PIPELINE ---
export function scrub(
  input: any,
  options: ScrubberOptions & {
    relativeDates?: boolean
    aliasIds?: boolean
    dateAnchor?: Date
    filterNode?: FilterNodeCallback
  },
  reverseMap: Map<string, string>,
): any {
  const allDropKeys = options.dropKeys || []
  const allPreserveKeys = options.preserveKeys || []
  const useDefaultFilter = options.useDefaultBlacklist ?? true

  const dropPatterns = allDropKeys.filter((k) => k.includes('*')).map(globToRegex)
  const dropLiterals = new Set(allDropKeys.filter((k) => !k.includes('*')))

  const preservePatterns = allPreserveKeys.filter((k) => k.includes('*')).map(globToRegex)
  const preserveLiterals = new Set(allPreserveKeys.filter((k) => !k.includes('*')))

  const isMatched = (key: string, path: string, literals: Set<string>, patterns: RegExp[]) =>
    literals.has(key) || literals.has(path) || patterns.some((re) => re.test(key) || re.test(path))

  const shouldDrop = (key: string, path: string): boolean => {
    // 1. PRESERVE wins everything (The "Punch-through" rule)
    if (isMatched(key, path, preserveLiterals, preservePatterns)) return false

    // 2. User's explicit DROP list
    if (isMatched(key, path, dropLiterals, dropPatterns)) return true

    // 3. System's DEFAULT list (if enabled)
    if (useDefaultFilter && DEFAULT_NOISE_KEYS.has(key)) return true

    return false
  }

  let idCounter = 0
  const forwardMap = new Map<string, string>()

  // THE SINGLE PASS WALKER (Scrub + Date + Alias)
  function walk(node: any, key: string = '', path: string = '', visited = new WeakSet()): any {
    // 0. Middleware Escape Hatch
    if (options.filterNode && key) {
      const decision = options.filterNode(key, node, path)
      if (decision === true) return node // EXPLICIT KEEP
      if (decision === false) return undefined // EXPLICIT DROP
    }

    // 1. Specificity Wins Logic
    if (key) {
      if (shouldDrop(key, path)) return undefined
    }

    // 2. Primitives & Transforms
    if (node === null || node === undefined || node === '') return undefined

    if (typeof node === 'string') {
      let finalStr = node
      // Engine E: Date formatting
      if (options.relativeDates !== false && ISO_DATE_REGEX.test(finalStr)) {
        finalStr = formatRelativeTime(finalStr, options.dateAnchor)
      }
      // Engine C: Aliasing
      if (options.aliasIds !== false) {
        finalStr = finalStr.replace(ID_REGEX, (match) => {
          if (forwardMap.has(match)) return forwardMap.get(match)!
          const alias = `$ID_${idCounter++}`
          forwardMap.set(match, alias)
          reverseMap.set(alias, match)
          return alias
        })
      }
      return finalStr
    }

    if (typeof node !== 'object') return node

    // 3. Objects & Arrays
    if (visited.has(node)) throw new DistillError('Circular reference detected.')
    visited.add(node)

    if (Array.isArray(node)) {
      const cleanedArray = node
        .map((item, idx) => walk(item, String(idx), path ? `${path}.${idx}` : String(idx), visited))
        .filter((v) => v !== undefined)

      if (cleanedArray.length === 0) {
        return options.pruneEmptyArrays ? undefined : []
      }
      return cleanedArray
    }

    const cleanedObj: Record<string, any> = {}
    let hasKeys = false

    for (const [k, v] of Object.entries(node)) {
      const subPath = path ? `${path}.${k}` : k
      const cleanedValue = walk(v, k, subPath, visited)

      if (cleanedValue === undefined) continue

      // Engine A: Drop empty objects
      if (
        cleanedValue !== null &&
        typeof cleanedValue === 'object' &&
        !Array.isArray(cleanedValue) &&
        Object.keys(cleanedValue).length === 0
      ) {
        // Unless it is explicitly preserved
        if (!isMatched(k, subPath, preserveLiterals, preservePatterns)) {
          continue
        }
      }

      cleanedObj[k] = cleanedValue
      hasKeys = true
    }

    return hasKeys ? cleanedObj : undefined
  }

  const result = walk(input)
  return result === undefined ? (Array.isArray(input) ? [] : {}) : result
}

export function formatRelativeTime(isoString: string, anchor?: Date): string {
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return isoString

  const now = anchor ?? new Date()
  const diffInMs = date.getTime() - now.getTime()
  const absDiff = Math.abs(diffInMs)

  const units: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
    { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
    { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
    { unit: 'day', ms: 24 * 60 * 60 * 1000 },
    { unit: 'hour', ms: 60 * 60 * 1000 },
    { unit: 'minute', ms: 60 * 1000 },
    { unit: 'second', ms: 1000 },
  ]

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'always', style: 'long' })

  for (const { unit, ms } of units) {
    if (absDiff >= ms || unit === 'second') {
      return formatter.format(Math.round(diffInMs / ms), unit)
    }
  }

  return isoString
}

// --- Engine B: The Middle-Out Truncator ---

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  const keepChars = Math.floor(maxLength * 0.4)
  const truncatedCount = text.length - keepChars * 2

  const start = text.slice(0, keepChars)
  const end = text.slice(-keepChars)

  return `${start}...[${truncatedCount.toLocaleString()} chars truncated]...${end}`
}

// --- Engine D: DMD (Dense Markdown Data) Formatter ---

export function formatToDMD(
  input: any,
  options: { tableifyArrays: boolean; tableifyThreshold: number; tableifyTolerance: number },
): string {
  function toMarkdown(node: any, indent: number = 0): string {
    const spacing = '  '.repeat(indent)

    if (Array.isArray(node)) {
      if (node.length === 0) return '[]'

      // Attempt Table-ification
      if (
        options.tableifyArrays &&
        node.length >= options.tableifyThreshold &&
        isArrayOfSimilarObjects(node, options.tableifyTolerance)
      ) {
        return formatAsTable(node, indent)
      }

      return node.map((item) => `\n${spacing}- ${toMarkdown(item, indent + 1)}`).join('')
    }

    if (typeof node === 'object' && node !== null) {
      return Object.entries(node)
        .map(([key, value]) => `\n${spacing}${key}: ${toMarkdown(value, indent + 1)}`)
        .join('')
    }

    return String(node)
  }

  return toMarkdown(input).trim()
}

function isArrayOfSimilarObjects(arr: any[], tolerance: number): boolean {
  if (arr.length < 2) return false
  const sample = arr.slice(0, 3)

  const isObject = (val: any) => val !== null && typeof val === 'object' && !Array.isArray(val)
  if (!sample.every(isObject)) return false

  const firstKeys = Object.keys(sample[0]!)
  return sample.slice(1).every((s) => {
    const keys = new Set(Object.keys(s))
    const overlap = firstKeys.filter((k) => keys.has(k)).length / Math.max(firstKeys.length, 1)
    return overlap >= tolerance
  })
}

function formatAsTable(arr: any[], indent: number): string {
  const sample = arr.slice(0, 3)
  const allKeys = Array.from(new Set(sample.flatMap((s) => Object.keys(s))))
  const spacing = '  '.repeat(indent)

  const header = `| ${allKeys.join(' | ')} |`
  const separator = `| ${allKeys.map(() => '---').join(' | ')} |`
  const rows = arr.map((item) => {
    const values = allKeys.map((k) => {
      const val = item[k]
      if (val === undefined || val === null) return ''
      const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val)
      return strVal.replace(/\|/g, '\\|')
    })
    return `| ${values.join(' | ')} |`
  })

  return `\n${spacing}${header}\n${spacing}${separator}\n${spacing}${rows.join(`\n${spacing}`)}`
}
