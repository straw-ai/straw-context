import { type IFormatter } from './IFormatter.js'
import { TOONFormatter } from './TOONFormatter.js'

export class DMDFormatter implements IFormatter {
  private toon = new TOONFormatter()

  public format(
    input: unknown,
    options: { tableifyArrays: boolean; tableifyThreshold: number },
  ): string {
    return this.toMarkdown(input, options).trim()
  }

  private toMarkdown(
    node: unknown,
    options: { tableifyArrays: boolean; tableifyThreshold: number },
    indent: number = 0,
    inline: boolean = false,
  ): string {
    const spacing = '  '.repeat(indent)

    if (Array.isArray(node)) {
      if (node.length === 0) {
        return '[]'
      }

      // Attempt Table-ification
      if (
        options.tableifyArrays &&
        node.length >= options.tableifyThreshold &&
        this.isArrayOfSimilarObjects(node)
      ) {
        return this.toon.format(node, { depth: indent }).trim()
      }

      return node
        .map((item) => `\n${spacing}- ${this.toMarkdown(item, options, indent + 1, true)}`)
        .join('')
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
          return `${currentNewline}${currentPadding}${key}: ${this.toMarkdown(value, options, indent + 1)}`
        })
        .join('')
    }

    return String(node)
  }

  private isArrayOfSimilarObjects(arr: unknown[]): boolean {
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
}
