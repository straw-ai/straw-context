import { describe, it, expect } from 'vitest'

import { ContextSession } from '../src/index.js'

describe('ContextSession', () => {
  it('accumulates fragments and distills them as a unified payload', () => {
    const session = new ContextSession({ tableifyArrays: false })
    session.append({ user: 'Alice' })
    session.append({ user: 'Bob' })

    const { contextString } = session.distill()
    expect(contextString).toContain('Alice')
    expect(contextString).toContain('Bob')
    // DMD format for arrays is '- \n  key: val' or similar depending on depth
    expect(contextString).toMatch(/-[\s]+user: Alice/)
    expect(contextString).toMatch(/-[\s]+user: Bob/)
  })

  it('honors collective budget across multiple fragments', () => {
    const session = new ContextSession({
      budget: { maxContextTokens: 30 },
      tokenCounter: (t) => t.length,
    })

    session.append('A'.repeat(50))
    session.append('B'.repeat(50))

    const { stats } = session.distill()
    expect(stats.distilledTokens).toBeLessThanOrEqual(30)
  })

  it('can be cleared', () => {
    const session = new ContextSession()
    session.append({ data: 1 })
    session.clear()
    session.append({ data: 2 })

    const { contextString } = session.distill()
    expect(contextString).not.toContain('1')
    expect(contextString).toContain('2')
  })
})
