import { type IFormatter } from './IFormatter.js'

export class XMLFormatter implements IFormatter {
  public format(input: unknown): string {
    return `<context>${this.toXML(input)}</context>`.trim()
  }

  private toXML(node: unknown, indent: number = 0): string {
    const spacing = '  '.repeat(indent)

    if (Array.isArray(node)) {
      if (node.length === 0) {
        return ''
      }
      return node.map((item) => `\n${spacing}<item>${this.toXML(item, indent + 1)}</item>`).join('')
    }

    if (typeof node === 'object' && node !== null) {
      const entries = Object.entries(node as Record<string, unknown>)
      if (entries.length === 0) {
        return ''
      }
      return entries
        .map(([key, value]) => {
          const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_')
          const inner = this.toXML(value, indent + 1)
          const closeTagSpacing = inner.includes('\n') ? `\n${spacing}` : ''
          return `\n${spacing}<${safeKey}>${inner}${closeTagSpacing}</${safeKey}>`
        })
        .join('')
    }

    return this.escapeXML(String(node))
  }

  private escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }
}
