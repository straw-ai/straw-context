import { describe, it, expect } from 'vitest'

import { distill } from '../src/index.js'

describe('Engine B: String Truncation Strategies', () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  // 62 characters

  it('uses middle-out truncation by default', () => {
    const res = distill({ text: alphabet }, { maxStringLength: 20 })
    // Middle should keep approx 8 chars from start and end (0.4 * 20 = 8)
    expect(res.contextString).toContain('ABCDEFGH')
    expect(res.contextString).toContain('23456789') // end of string
    expect(res.contextString).toContain('chars truncated')
  })

  it('supports end truncation', () => {
    const res = distill(
      { text: alphabet },
      { maxStringLength: 20, stringTruncationStrategy: 'end' },
    )
    // End keeps first 16 chars (0.8 * 20 = 16)
    expect(res.contextString).toContain('ABCDEFGHIJKLMNOP')
    expect(res.contextString).not.toContain('STUVWXYZ')
    expect(res.contextString).toContain('chars truncated at end')
  })

  it('supports start truncation', () => {
    const res = distill(
      { text: alphabet },
      { maxStringLength: 20, stringTruncationStrategy: 'start' },
    )
    // Start keeps last 16 chars
    expect(res.contextString).not.toContain('ABCDEFGH')
    expect(res.contextString).toContain('wxyz0123456789')
    expect(res.contextString).toContain('chars truncated at start')
  })
})
