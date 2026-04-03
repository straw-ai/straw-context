/**
 * Naive Token Estimation Heuristic
 * This is for development and test usage ONLY.
 * Do not use for production context window enforcement.
 */
export function estimateTokens(text: string): number {
  if (!text) {
    return 0
  }

  const chunks = text.match(/[\w]+|[^\w\s]+/g)
  if (!chunks) {
    return Math.ceil(text.length / 3.5)
  }

  return chunks.reduce((estimatedCount, chunk) => {
    // Long alphanumeric words usually get split into 3-4 char BPE sub-tokens
    if (chunk.length > 4 && /\w/.test(chunk)) {
      return estimatedCount + Math.ceil(chunk.length / 4)
    }
    // Short words or punctuation blocks count as roughly 1 token
    return estimatedCount + 1
  }, 0)
}
