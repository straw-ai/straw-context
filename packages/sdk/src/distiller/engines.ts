import { DistillError, type ScrubberOptions } from './types.js'

// --- Engine A: The Heuristic Scrubber ---

const UNIVERSAL_NOISE_KEYS = new Set([
  '__typename',
  '_links',
  'href',
  'avatar_url',
  'gravatar_id',
  'node_id',
  'checksum',
  'etag',
  'css_classes',
  'created_by_ip',
  'url',
])

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$/
const ID_REGEX =
  /\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{40}|[a-f0-9]{64}|[a-f0-9]{128})\b/gi

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const regexStr = escaped.replace(/\*/g, '.*')
  return new RegExp(`^${regexStr}$`)
}

export function formatRelativeTime(isoString: string, anchor?: Date): string {
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return isoString

  const now = anchor ?? new Date()
  const diffInMs = date.getTime() - now.getTime()
  const absDiff = Math.abs(diffInMs)

  const seconds = Math.round(absDiff / 1000)
  const minutes = Math.round(seconds / 60)
  const hours = Math.round(minutes / 60)
  const days = Math.round(hours / 24)
  const months = Math.round(days / 30)
  const years = Math.round(days / 365)

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'always', style: 'long' })

  if (years > 0) return formatter.format(Math.sign(diffInMs) * years, 'year')
  if (months > 0) return formatter.format(Math.sign(diffInMs) * months, 'month')
  if (days > 0) return formatter.format(Math.sign(diffInMs) * days, 'day')
  if (hours > 0) return formatter.format(Math.sign(diffInMs) * hours, 'hour')
  if (minutes > 0) return formatter.format(Math.sign(diffInMs) * minutes, 'minute')
  return formatter.format(Math.sign(diffInMs) * seconds, 'second')
}

// --- THE UNIFIED PIPELINE ---
export function distillPayload(
  input: any,
  options: ScrubberOptions & { relativeDates?: boolean; aliasIds?: boolean; dateAnchor?: Date },
  reverseMap: Map<string, string>,
): any {
  const allDropKeys = options.dropKeys || []
  const allPreserveKeys = options.preserveKeys || []

  const dropPatterns = allDropKeys.filter((k) => k.includes('*')).map(globToRegex)
  const dropLiterals = new Set(allDropKeys.filter((k) => !k.includes('*')))

  const preservePatterns = allPreserveKeys.filter((k) => k.includes('*')).map(globToRegex)
  const preserveLiterals = new Set(allPreserveKeys.filter((k) => !k.includes('*')))

  let idCounter = 0
  const forwardMap = new Map<string, string>()

  const isPreserved = (key: string) =>
    preserveLiterals.has(key) || preservePatterns.some((re) => re.test(key))
  const isDropped = (key: string) =>
    dropLiterals.has(key) || dropPatterns.some((re) => re.test(key))

  // 1. Validate Conflicts (Literals)
  for (const key of dropLiterals) {
    if (preserveLiterals.has(key)) {
      throw new DistillError(
        `Configuration Conflict: Key '${key}' appears in both dropKeys and preserveKeys.`,
      )
    }
  }

  // THE SINGLE PASS WALKER (Scrub + Date + Alias)
  function walk(node: any, visited = new WeakSet()): any {
    // 1. Primitives & Transforms
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

    // 2. Objects & Arrays
    if (visited.has(node)) throw new DistillError('Circular reference detected.')
    visited.add(node)

    if (Array.isArray(node)) {
      const cleanedArray = node.map((item) => walk(item, visited)).filter((v) => v !== undefined)
      if (cleanedArray.length === 0) {
        return options.pruneEmptyArrays ? undefined : []
      }
      return cleanedArray
    }

    const cleanedObj: Record<string, any> = {}
    let hasKeys = false

    for (const [key, value] of Object.entries(node)) {
      if (isPreserved(key)) {
        cleanedObj[key] = walk(value, visited) // Always walk to format primitives
        hasKeys = true
        continue
      }

      if (isDropped(key) || UNIVERSAL_NOISE_KEYS.has(key)) continue

      const cleanedValue = walk(value, visited)
      if (cleanedValue === undefined) continue

      // Engine A: Drop empty objects
      if (
        cleanedValue !== null &&
        typeof cleanedValue === 'object' &&
        !Array.isArray(cleanedValue) &&
        Object.keys(cleanedValue).length === 0
      ) {
        continue
      }

      cleanedObj[key] = cleanedValue
      hasKeys = true
    }

    return hasKeys ? cleanedObj : undefined
  }

  const result = walk(input)
  return result === undefined ? (Array.isArray(input) ? [] : {}) : result
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
  options: { tableifyArrays: boolean; tableifyThreshold: number },
): string {
  function toMarkdown(node: any, indent: number = 0): string {
    const spacing = '  '.repeat(indent)

    if (Array.isArray(node)) {
      if (node.length === 0) return '[]'

      // Attempt Table-ification
      if (
        options.tableifyArrays &&
        node.length >= options.tableifyThreshold &&
        isArrayOfSimilarObjects(node)
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

function isArrayOfSimilarObjects(arr: any[]): boolean {
  if (arr.length < 2) return false
  const sample = arr.slice(0, 3)

  // Ensure all sampled items are non-null objects
  if (sample.some((s) => typeof s !== 'object' || s === null || Array.isArray(s))) {
    return false
  }

  const keysSet = sample.map((s) => new Set(Object.keys(s)))
  const firstKeys = Object.keys(sample[0])

  // Heuristic: Check for 80% key overlap between first item and subsequent samples
  for (let i = 1; i < sample.length; i++) {
    const currentKeys = keysSet[i]
    if (!currentKeys) continue

    let overlapCount = 0
    for (const key of firstKeys) {
      if (currentKeys.has(key)) overlapCount++
    }

    const overlap = overlapCount / Math.max(firstKeys.length, 1)
    if (overlap < 0.8) return false
  }

  return true
}

function formatAsTable(arr: any[], indent: number): string {
  // Collect ALL unique keys from the first 3 items to form headers
  const sample = arr.slice(0, 3)
  const allKeys = Array.from(new Set(sample.flatMap((s) => Object.keys(s))))
  const spacing = '  '.repeat(indent)

  const header = `| ${allKeys.join(' | ')} |`
  const separator = `| ${allKeys.map(() => '---').join(' | ')} |`
  const rows = arr.map((item) => {
    const values = allKeys.map((k) => {
      const val = item[k]
      if (val === undefined || val === null) return ''
      // Fix: Escape pipes to prevent breaking table structure
      const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val)
      return strVal.replace(/\|/g, '\\|')
    })
    return `| ${values.join(' | ')} |`
  })

  return `\n${spacing}${header}\n${spacing}${separator}\n${spacing}${rows.join(`\n${spacing}`)}`
}
