import { type IFormatter } from './IFormatter.js'

export class TOONFormatter implements IFormatter {
  private readonly DEFAULT_DELIMITER = ','
  private readonly NULL_LITERAL = '∅'

  public format(input: unknown, options?: { depth?: number; key?: string }): string {
    return this.formatRecursive(input, options?.depth ?? 0, options?.key)
  }

  public encodePrimitive(value: unknown): string {
    if (value === null || value === undefined) return this.NULL_LITERAL
    if (typeof value === 'boolean') return String(value)
    if (typeof value === 'number') return String(value)

    const str = String(value)
    // Spec: If string contains delimiter, newline, or is ambiguous, quote it.
    const needsQuoting =
      str.includes(this.DEFAULT_DELIMITER) ||
      str.includes('\n') ||
      str.includes(':') ||
      str.includes('"') ||
      str.trim() !== str

    if (!needsQuoting) return str
    return `"${str.replace(/"/g, '\\"')}"`
  }

  private formatHeader(
    length: number,
    options?: { key?: string | undefined; fields?: string[] | undefined },
  ): string {
    let header = options?.key ? `${options.key}` : ''
    header += `[${length}]`
    if (options?.fields) {
      header += `{${options.fields.join(this.DEFAULT_DELIMITER)}}`
    }
    header += ':'
    return header
  }

  private formatRecursive(input: unknown, depth: number = 0, key?: string): string {
    const spacing = '  '.repeat(depth)

    if (Array.isArray(input)) {
      if (input.length === 0) return `${spacing}${this.formatHeader(0, { key })}`

      const tabularResult = this.getTabularMetadata(input)
      if (tabularResult) {
        const { keys } = tabularResult
        const header = this.formatHeader(input.length, { fields: keys, key })
        const headerLine = `${spacing}${header}`
        const rows = input
          .map((row) => {
            const values = keys.map((k) => this.encodePrimitive((row as any)?.[k]))
            return `\n${'  '.repeat(depth + 1)}${values.join(this.DEFAULT_DELIMITER)}`
          })
          .join('')
        return `${headerLine}${rows}`
      }

      // List Array
      const headerLine = `${spacing}${this.formatHeader(input.length, { key })}`
      const items = input
        .map((item) => {
          const formatted = this.formatRecursive(item, depth + 1)
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
            return this.formatRecursive(v, depth, k)
          }

          const isComplex = typeof v === 'object' && v !== null && Object.keys(v).length > 0

          if (isComplex) {
            return `${spacing}${k}:\n${this.formatRecursive(v, depth + 1)}`
          } else {
            return `${spacing}${k}: ${this.encodePrimitive(v)}`
          }
        })
        .join('\n')
    }

    return this.encodePrimitive(input)
  }

  private getTabularMetadata(arr: any[]): { keys: string[] } | null {
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
    const nestedCount = sample.reduce((acc, obj) => {
      return acc + Object.values(obj).filter((v) => typeof v === 'object' && v !== null).length
    }, 0)

    if (nestedCount > (sample.length * keys.length) / 2) {
      return null
    }

    return { keys }
  }
}
