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

export function scrub(input: any, options: ScrubberOptions = {}): any {
  const dropKeys = new Set(options.dropKeys || [])
  const preserveKeys = new Set(options.preserveKeys || [])
  const pruneEmptyArrays = options.pruneEmptyArrays ?? false

  // 1. Fail Fast: Validate Conflicts
  for (const key of dropKeys) {
    if (preserveKeys.has(key)) {
      throw new DistillError(
        `Configuration Conflict: Key '${key}' appears in both dropKeys and preserveKeys.`,
      )
    }
  }

  // 2. Fail Fast: Validate Input
  if (input === null || typeof input !== 'object') {
    throw new DistillError(
      `Input must be a valid JSON Object or Array. Received: ${input === null ? 'null' : typeof input}`,
    )
  }

  // 3. The Walker Engine
  function walk(node: any, visited = new WeakSet()): any {
    if (node === null || node === undefined || node === '') return undefined
    if (typeof node !== 'object') return node

    if (visited.has(node)) {
      throw new DistillError('Circular reference detected. Input must be serializable JSON.')
    }
    visited.add(node)

    if (Array.isArray(node)) {
      const cleanedArray = node
        .map((item) => walk(item, visited))
        .filter((item) => item !== undefined)

      if (cleanedArray.length === 0 && pruneEmptyArrays) {
        return undefined
      }
      return cleanedArray
    }

    const cleanedObj: Record<string, any> = {}
    let hasKeys = false

    for (const [key, value] of Object.entries(node)) {
      if (dropKeys.has(key)) continue
      if (UNIVERSAL_NOISE_KEYS.has(key) && !preserveKeys.has(key)) continue

      const isPreserved = preserveKeys.has(key)
      const cleanedValue = isPreserved ? value : walk(value, visited)

      if (!isPreserved) {
        if (cleanedValue === undefined) continue
        if (
          typeof cleanedValue === 'object' &&
          !Array.isArray(cleanedValue) &&
          Object.keys(cleanedValue).length === 0
        ) {
          continue
        }
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

// --- Engine C: The Cryptographic Aliaser ---

const ID_REGEX =
  /\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{40}|[a-f0-9]{64}|[a-f0-9]{128})\b/gi

export function aliasIdentifiers(input: any, reverseMap: Map<string, string>): any {
  const forwardMap = new Map<string, string>()
  let idCounter = 0

  function processValue(val: any): any {
    if (typeof val === 'string') {
      return val.replace(ID_REGEX, (match) => {
        if (forwardMap.has(match)) {
          return forwardMap.get(match)!
        }
        const alias = `$ID_${idCounter++}`
        forwardMap.set(match, alias)
        reverseMap.set(alias, match)
        return alias
      })
    }
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        return val.map(processValue)
      }
      const newObj: Record<string, any> = {}
      for (const [k, v] of Object.entries(val)) {
        newObj[k] = processValue(v)
      }
      return newObj
    }
    return val
  }

  return processValue(input)
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
  if (arr.length === 0) return false
  const first = arr[0]
  if (typeof first !== 'object' || first === null || Array.isArray(first)) return false

  const firstKeys = Object.keys(first).sort().join(',')
  return arr.every((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return false
    return Object.keys(item).sort().join(',') === firstKeys
  })
}

function formatAsTable(arr: any[], indent: number): string {
  const keys = Object.keys(arr[0])
  const spacing = '  '.repeat(indent)

  const header = `| ${keys.join(' | ')} |`
  const separator = `| ${keys.map(() => '---').join(' | ')} |`
  const rows = arr.map((item) => `| ${keys.map((k) => String(item[k])).join(' | ')} |`)

  return `\n${spacing}${header}\n${spacing}${separator}\n${spacing}${rows.join(`\n${spacing}`)}`
}
