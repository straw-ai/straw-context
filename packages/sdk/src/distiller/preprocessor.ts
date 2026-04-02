import { DistillError, type DedupeOptions } from './types.js'

export type InputType = 'structured' | 'unstructured'

export function identifyInput(input: any): InputType {
  if (input === null || input === undefined) {
    throw new DistillError('Input cannot be null or undefined.')
  }

  return typeof input === 'object' ? 'structured' : 'unstructured'
}

export function tryParseJSON(input: string): any | null {
  const trimmed = input.trim()
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return null
    }
  }
  return null
}

/**
 * Heuristic Line Deduplication
 * If multiple consecutive lines share a common prefix (e.g. log levels),
 * it keeps the start and end context, and summarizes the middle.
 */
export function deduplicateLines(text: string, options?: DedupeOptions): string {
  if (options?.enabled === false) return text

  const threshold = options?.threshold ?? 5
  const prefixLength = options?.prefixLength ?? 15
  const contextBuffer = options?.contextBuffer ?? 2

  const lines = text.split('\n')
  if (lines.length <= contextBuffer * 2) return text

  const processed: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line === undefined) {
      i++
      continue
    }

    if (!line.trim()) {
      processed.push(line)
      i++
      continue
    }

    // Heuristic: Check if following lines share the same prefix
    const prefix = line.slice(0, prefixLength)
    let nextIndex = i + 1
    while (nextIndex < lines.length) {
      const nextLine = lines[nextIndex]
      if (nextLine !== undefined && nextLine.startsWith(prefix)) {
        nextIndex++
      } else {
        break
      }
    }

    const count = nextIndex - i
    if (count > threshold) {
      // Repetitive block found: Keep contextBuffer lines from start and end
      for (let k = 0; k < contextBuffer; k++) {
        processed.push(lines[i + k]!)
      }

      processed.push(
        `...[${count - contextBuffer * 2} lines with prefix "${prefix.trim() || 'whitespace'}" deduplicated]...`,
      )

      for (let k = contextBuffer - 1; k >= 0; k--) {
        processed.push(lines[nextIndex - 1 - k]!)
      }
      i = nextIndex
    } else {
      processed.push(line)
      i++
    }
  }

  return processed.join('\n')
}
