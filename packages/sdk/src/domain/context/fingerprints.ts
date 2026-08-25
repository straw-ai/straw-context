const FNV_OFFSET = 14_695_981_039_346_656_037n
const FNV_PRIME = 1_099_511_628_211n
const FNV_MASK = 0xffff_ffff_ffff_ffffn

function hash(value: string): string {
  let result = FNV_OFFSET
  for (const character of value) {
    result ^= BigInt(character.codePointAt(0) ?? 0)
    result = (result * FNV_PRIME) & FNV_MASK
  }
  return `fnv1a64:${result.toString(16).padStart(16, '0')}`
}

function describe(value: unknown, includeValues: boolean, seen: Map<object, number>): string {
  if (value === null) return 'null'
  const type = typeof value
  if (type !== 'object') {
    if (!includeValues) return type
    if (type === 'string') return `string:${JSON.stringify(value)}`
    if (type === 'symbol') return `symbol:${String(value)}`
    if (type === 'function') return `function:${(value as Function).name}`
    return `${type}:${String(value)}`
  }

  const object = value as object
  const reference = seen.get(object)
  if (reference !== undefined) return `reference:${reference}`
  seen.set(object, seen.size)

  if (value instanceof Date) return includeValues ? `date:${value.toISOString()}` : 'date'
  if (value instanceof RegExp) return includeValues ? `regexp:${String(value)}` : 'regexp'
  if (Array.isArray(value)) {
    return `array:[${value.map((item) => describe(item, includeValues, seen)).join(',')}]`
  }

  return `object:{${Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${JSON.stringify(key)}:${describe(item, includeValues, seen)}`)
    .join(',')}}`
}

/** Non-cryptographic fingerprint used only for deterministic change detection. */
export function fingerprintContextValue(value: unknown): string {
  return hash(describe(value, true, new Map()))
}

/** Fingerprints keys, ordering, nesting, and value types while ignoring primitive values. */
export function fingerprintContextStructure(value: unknown): string {
  return hash(describe(value, false, new Map()))
}
