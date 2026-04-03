import { describe, it, expect } from 'vitest'

import { distill } from '../src/index.js'
import { estimateTokens } from './estimate.js'

describe('Engine B: String Truncation Strategies', () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

  it('no longer truncates by default (Deterministic Change)', () => {
    const res = distill({ text: alphabet }, { tokenCounter: estimateTokens })
    // In previous versions, this would have been truncated at 1000.
    // Here we test that even with a smaller implicit limit, it is NOT touched.
    expect(res.contextString).toContain(alphabet)
    expect(res.contextString).not.toContain('truncated')
  })

  it('uses middle-out truncation when explicitly enabled', () => {
    const res = distill({ text: alphabet }, { maxStringLength: 20, tokenCounter: estimateTokens })
    // Middle keeps first 8 (0.4 * 20) and last 8
    expect(res.contextString).toContain('ABCDEFGH')
    expect(res.contextString).toContain('3456789')
    expect(res.contextString).toContain('chars truncated')
  })

  it('supports end truncation', () => {
    const res = distill(
      { text: alphabet },
      { maxStringLength: 20, stringTruncationStrategy: 'end', tokenCounter: estimateTokens },
    )
    // End keeps first 16 chars (0.8 * 20 = 16)
    expect(res.contextString).toContain('ABCDEFGHIJKLMNOP')
    expect(res.contextString).not.toContain('STUVWXYZ')
  })

  it('supports start truncation', () => {
    const res = distill(
      { text: alphabet },
      { maxStringLength: 20, stringTruncationStrategy: 'start', tokenCounter: estimateTokens },
    )
    // Start keeps last 16 chars
    expect(res.contextString).not.toContain('ABCDEFGH')
    expect(res.contextString).toContain('wxyz0123456789')
  })

  it('triggers Safety Trigger warning on high structural loss', () => {
    const largeObject: any = {}
    for (let i = 0; i < 100; i++) {
      largeObject[`key_${i}`] = 'This is a moderately long string that we are NOT truncating.'
    }

    // Force a tight budget that requires dropping > 30% of nodes
    const res = distill(largeObject, {
      budget: { maxContextTokens: 50 }, // Extremely tight
      tokenCounter: estimateTokens,
      // maxStringLength: undefined (Default)
    })

    expect(res.warnings).toBeDefined()
    expect(res.warnings![0]).toContain('High structural loss')
  })
})
