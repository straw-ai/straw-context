import { DistillError, type DedupeOptions } from './types.js'

export type InputType = 'structured' | 'unstructured'

export function identifyInput(input: any): InputType {
  if (input === null || input === undefined) {
    throw new DistillError('Input cannot be null or undefined.')
  }

  if (typeof input === 'object') return 'structured'
  if (typeof input === 'string') return 'unstructured'

  throw new DistillError(
    `Invalid Input: Must be a JSON object, Array, or String. Received: ${typeof input}`,
  )
}

export function tryParseJSON(input: string): any | null {
  if (
    (input.startsWith('{') && input.endsWith('}')) ||
    (input.startsWith('[') && input.endsWith(']'))
  ) {
    try {
      return JSON.parse(input)
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
  if (lines.length <= contextBuffer * 2) return text // Too short to deduplicate safely

  const processed: string[] = []
  let i = 0

  while (i < lines.length) {
    const currentLine = lines[i]
    if (currentLine === undefined || !currentLine.trim()) {
      if (currentLine !== undefined) processed.push(currentLine)
      i++
      continue
    }

    // Heuristic: Check if next lines share the same prefix
    const firstLine = lines[i]
    if (firstLine === undefined) {
      i++
      continue
    }
    const prefix = firstLine.slice(0, prefixLength)
    let j = i + 1
    while (j < lines.length) {
      const line = lines[j]
      if (line !== undefined && line.startsWith(prefix)) {
        j++
      } else {
        break
      }
    }

    const count = j - i
    if (count > threshold) {
      // Repetitive block found
      for (let k = 0; k < contextBuffer; k++) {
        const line = lines[i + k]
        if (line !== undefined) processed.push(line)
      }

      processed.push(
        `...[${count - contextBuffer * 2} lines with prefix "${prefix.trim()}" deduplicated]...`,
      )

      for (let k = contextBuffer; k > 0; k--) {
        const line = lines[j - k]
        if (line !== undefined) processed.push(line)
      }
      i = j
    } else {
      processed.push(currentLine!)
      i++
    }
  }

  return processed.join('\n')
}
