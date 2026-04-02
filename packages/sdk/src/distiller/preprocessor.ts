import { DistillError } from './types.js'

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
 * it keeps the first 2, the last 2, and summarizes the middle.
 */
export function deduplicateLines(text: string): string {
  const lines = text.split('\n')
  if (lines.length <= 10) return text // Too short to deduplicate safely

  const processed: string[] = []
  let i = 0

  while (i < lines.length) {
    const currentLine = lines[i]
    if (currentLine === undefined || !currentLine.trim()) {
      if (currentLine !== undefined) processed.push(currentLine)
      i++
      continue
    }

    // Heuristic: Check if next lines share the same prefix (first 15 chars)
    const firstLine = lines[i]
    if (firstLine === undefined) {
      i++
      continue
    }
    const prefix = firstLine.slice(0, 15)
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
    if (count > 5) {
      // Repetitive block found
      processed.push(lines[i]!)
      processed.push(lines[i + 1]!)
      processed.push(`...[${count - 4} lines with prefix "${prefix.trim()}" deduplicated]...`)
      processed.push(lines[j - 2]!)
      processed.push(lines[j - 1]!)
      i = j
    } else {
      processed.push(currentLine!)
      i++
    }
  }

  return processed.join('\n')
}
