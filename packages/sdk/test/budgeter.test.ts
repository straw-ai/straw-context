import { describe, it, expect, vi } from 'vitest'

import { distill } from '../src/index.js'

describe('Enterprise: Tokenizer-Aware Budgeting', () => {
  const mockCounter = (text: string) => text.length // 1 char = 1 token for simplicity

  it('prunes strings via dilation when significantly over budget', () => {
    const data = {
      text: 'A'.repeat(200), // 200 chars
      meta: 'noise',
    }

    // Goal: Fit in 100 tokens. Must explicitly enable maxStringLength for dilation to occur.
    const { contextString, stats } = distill(data, {
      tokenCounter: mockCounter,
      maxStringLength: 100,
      budget: { maxContextTokens: 100 },
    })

    expect(stats.distilledTokens).toBeLessThanOrEqual(100)
    expect(contextString).toContain('chars truncated')
  })

  it('prunes via depth strategy by default', () => {
    const data = {
      level1: {
        level2: {
          level3: {
            deep: 'value',
          },
        },
      },
      important: 'keep',
    }

    // The entire path "level1.level2.level3.deep" adds significant overhead.
    // If we limit tokens, it should prune level3 or level2.
    const { contextString } = distill(data, {
      tokenCounter: mockCounter,
      budget: { maxContextTokens: 30, strategy: 'depth' },
    })

    expect(contextString).toContain('important: keep')
    expect(contextString).not.toContain('deep: value')
  })

  it('respects priority strategy and lowPriorityKeys', () => {
    const data = {
      essential: 'always keep',
      boring: 'lose this first',
      deep: { stuff: 'also noise' },
    }

    const { contextString } = distill(data, {
      tokenCounter: mockCounter,
      budget: {
        maxContextTokens: 30,
        strategy: 'priority',
        lowPriorityKeys: ['boring', 'deep'],
      },
    })

    expect(contextString).toContain('essential: always keep')
    expect(contextString).not.toContain('boring')
    expect(contextString).not.toContain('deep')
  })

  it('never prunes essentialKeys', () => {
    const data = {
      secret: 'must stay',
      noise: 'X'.repeat(500),
    }

    const { contextString } = distill(data, {
      tokenCounter: mockCounter,
      budget: {
        maxContextTokens: 50,
        essentialKeys: ['secret'],
      },
    })

    expect(contextString).toContain('secret: must stay')
    // String truncation will still happen to the noise, but 'secret' is immune to branch pruning.
  })

  it('uses the custom tokenCounter consistently', () => {
    const spy = vi.fn((t: string) => t.length)

    distill(
      { test: 'data' },
      {
        tokenCounter: spy,
        budget: { maxContextTokens: 10 },
      },
    )

    // Should be called at least twice:
    // 1. Initial statistics
    // 2. Budgeter check
    // 3. Final statistics
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('prunes large arrays to fit budget', () => {
    const data = {
      users: Array.from({ length: 20 }, (_, i) => ({
        name: `User_${i}`,
        role: 'member',
      })),
    }

    const { contextString, stats } = distill(data, {
      tokenCounter: mockCounter,
      tableifyArrays: true,
      budget: { maxContextTokens: 80 },
    })

    expect(stats.distilledTokens).toBeLessThanOrEqual(80)
    // At least some users should remain
    expect(contextString).toContain('User_')
  })

  it('budgets correctly when output format is XML', () => {
    const data = {
      title: 'Report',
      detail: 'X'.repeat(300),
    }

    const { contextString, stats } = distill(data, {
      tokenCounter: mockCounter,
      outputFormat: 'xml',
      budget: { maxContextTokens: 100 },
    })

    expect(stats.distilledTokens).toBeLessThanOrEqual(100)
    expect(contextString).toContain('<context>')
    expect(contextString).toContain('</context>')
  })

  it('budgets correctly when output format is JSON', () => {
    const data = {
      payload: 'Y'.repeat(300),
    }

    const { contextString, stats } = distill(data, {
      tokenCounter: mockCounter,
      outputFormat: 'json',
      budget: { maxContextTokens: 60 },
    })

    expect(stats.distilledTokens).toBeLessThanOrEqual(60)
    // Should still be valid JSON
    expect(() => JSON.parse(contextString)).not.toThrow()
  })

  it('triggers structural loss warning when budget is tight and truncation is disabled', () => {
    const data = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      text: 'Long content that cannot be truncated by default.',
    }))

    const { warnings } = distill(data, {
      tokenCounter: mockCounter,
      tableifyArrays: true,
      budget: { maxContextTokens: 100 }, // Very tight
    })

    expect(warnings).toBeDefined()
    expect(warnings![0]).toContain('High structural loss')
  })
})
