import { describe, it, expect } from 'vitest'

import { distill } from '../src/index.js'

describe('Official TOON Spec Integration', () => {
  it('encodes simple objects into TOON indented format', () => {
    const data = {
      name: 'Josh',
      role: 'admin',
    }
    const { contextString } = distill(data, { outputFormat: 'toon' })

    expect(contextString).toBe('name: Josh\nrole: admin')
  })

  it('encodes nested objects with correct indentation', () => {
    const data = {
      user: {
        id: 1,
        profile: {
          theme: 'dark',
        },
      },
    }
    const { contextString } = distill(data, { outputFormat: 'toon' })

    // Official TOON Indentation: key: \n  nested: val
    expect(contextString).toBe('user:\n  id: 1\n  profile:\n    theme: dark')
  })

  it('encodes uniform arrays of objects using TOON tabular syntax', () => {
    const data = {
      users: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
    }
    const result = distill(data, { outputFormat: 'toon' })

    // users[2]{id,name}:
    //   1,Alice
    //   2,Bob
    expect(result.contextString).toContain('users[2]{id,name}:')
    expect(result.contextString).toContain('1,Alice')
    expect(result.contextString).toContain('2,Bob')
  })

  it('encodes primitive arrays using list syntax', () => {
    const data = {
      tags: ['a', 'b', 'c'],
    }
    const { contextString } = distill(data, { outputFormat: 'toon' })

    // tags[3]:
    //   - a
    //   - b
    //   - c
    expect(contextString).toContain('tags[3]:')
    expect(contextString).toContain('  - a')
    expect(contextString).toContain('  - b')
    expect(contextString).toContain('  - c')
  })

  it('handles nulls using the official ∅ literal', () => {
    const data = {
      missing: null,
      items: [
        { id: 1, val: null },
        { id: 2, val: 'ok' },
      ],
    }
    const { contextString } = distill(data, {
      outputFormat: 'toon',
    })

    expect(contextString).toContain('missing: ∅')
    expect(contextString).toContain('1,∅')
    expect(contextString).toContain('2,ok')
  })

  it('quotes strings only when necessary (containing delimiter, colon, or quotes)', () => {
    const data = {
      safe: 'simple',
      delimit: 'a,b',
      colon: 'key:val',
      quoted: 'He said "hello"',
    }
    const { contextString } = distill(data, { outputFormat: 'toon' })

    expect(contextString).toContain('safe: simple')
    expect(contextString).toContain('delimit: "a,b"')
    expect(contextString).toContain('colon: "key:val"')
    expect(contextString).toContain('quoted: "He said \\"hello\\""')
  })

  it('handles deeply nested complex mixed data', () => {
    const data = {
      project: 'Straw',
      stats: {
        active: true,
        contributors: [
          { name: 'Josh', commits: 50 },
          { name: 'Sarah', commits: 30 },
        ],
      },
      tags: [1, 2],
    }
    const { contextString } = distill(data, { outputFormat: 'toon' })

    expect(contextString).toContain('project: Straw')
    expect(contextString).toContain('stats:')
    expect(contextString).toContain('active: true')
    expect(contextString).toContain('contributors[2]{name,commits}:')
    expect(contextString).toContain('Josh,50')
    expect(contextString).toContain('tags[2]:')
  })
})
