import { describe, it, expect } from 'vitest'

import { distill, presets } from '../src/index.js'
import { estimateTokens } from './estimate.js'

describe('Public API Surface', () => {
  it('exports distill as a function', () => {
    expect(typeof distill).toBe('function')
  })

  it('exports presets object', () => {
    expect(presets).toBeDefined()
    expect(presets.github).toBeDefined()
  })

  it('throws on null input', () => {
    expect(() => distill(null)).toThrow()
  })

  it('throws on undefined input', () => {
    expect(() => distill(undefined)).toThrow()
  })

  it('throws on numeric input', () => {
    expect(() => distill(42 as any)).toThrow()
  })

  it('returns a valid DistillResult shape', () => {
    const result = distill({ test: 'data' }, { tokenCounter: estimateTokens })
    expect(result).toHaveProperty('contextString')
    expect(result).toHaveProperty('reverseMap')
    expect(result).toHaveProperty('stats')
    expect(result.stats).toHaveProperty('baselineTokens')
    expect(result.stats).toHaveProperty('distilledTokens')
    expect(result.stats).toHaveProperty('reductionPercent')
    expect(result.stats).toHaveProperty('durationMs')
  })

  it('stats.reductionPercent is between 0 and 100 for reducible payloads', () => {
    const data = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      __typename: 'Result', // Dropped by genericBlocklist
      value: 'important',
    }
    const { stats } = distill(data, { tokenCounter: estimateTokens })
    expect(stats.reductionPercent).toBeGreaterThan(0)
    expect(stats.reductionPercent).toBeLessThanOrEqual(100)
  })

  it('stats.durationMs is a non-negative number', () => {
    const { stats } = distill({ x: 1 }, { tokenCounter: estimateTokens })
    expect(stats.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('stats.distilledTokens is 0 for fully pruned payloads', () => {
    // Everything gets scrubbed as noise
    const { stats } = distill({ __typename: 'Result' }, { tokenCounter: estimateTokens })
    expect(stats.distilledTokens).toBe(0)
  })

  it('throws error when budget is provided without tokenCounter', () => {
    expect(() => distill({ test: 'data' }, { budget: { maxContextTokens: 100 } })).toThrowError(
      /MUST be provided/,
    )
  })
})
