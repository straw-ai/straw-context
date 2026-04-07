import { describe, it, expect } from 'vitest'

import { distill, emailRedactor, githubBlocklist } from '../src/index.js'

describe('Straw SDK Refinements', () => {
  const mockTokens = (text: string) => text.length // Simple char count for testing

  it('should include new byte size metrics and tokensSaved', () => {
    const input = { name: 'Josh', age: 30, city: 'Berlin' }
    const result = distill(input, { tokenCounter: mockTokens })

    expect(result.originalSizeBytes).toBeGreaterThan(0)
    expect(result.distilledSizeBytes).toBeGreaterThan(0)
    expect(result.stats.tokensSaved).toBeDefined()
    expect(typeof result.stats.tokensSaved).toBe('number')
  })

  it('should respect maxDepth and prune deep nodes', () => {
    const deepObject = {
      keep: 'me',
      a: {
        a_sibling: 'stay',
        b: {
          b_sibling: 'stay',
          c: {
            d: {
              e: 'too deep',
            },
          },
        },
      },
    }

    const result = distill(deepObject, {
      tokenCounter: mockTokens,
      maxDepth: 3,
    })

    expect(result.contextString).toContain('keep: me')
    expect(result.contextString).toContain('a_sibling: stay')
    expect(result.contextString).toContain('b_sibling: stay')
    expect(result.contextString).not.toContain('c:')
    expect(result.warnings).toBeDefined()
    expect(result.warnings?.[0]).toContain('Max depth of 3 reached')
  })

  it('should support YAML output format', () => {
    const input = { user: { id: 1, name: 'Test' } }
    const result = distill(input, {
      tokenCounter: mockTokens,
      outputFormat: 'yaml',
    })

    expect(result.contextString).toContain('user:')
    expect(result.contextString).toContain('name: Test')
    expect(result.contextString).not.toContain('{')
  })

  it('should support multi-regex filtering (key and path)', () => {
    const input = {
      safe: 'content',
      secret_key: 'shhh',
      nested: {
        internal_data: 'private',
        public_data: 'hello',
      },
    }

    const result = distill(input, {
      tokenCounter: mockTokens,
      filters: [
        { key: /secret/, action: 'drop' },
        { path: /nested\.internal/, action: 'drop' },
      ],
    })

    expect(result.contextString).toContain('safe: content')
    expect(result.contextString).toContain('public_data: hello')
    expect(result.contextString).not.toContain('secret_key')
    expect(result.contextString).not.toContain('internal_data')
  })

  it('should produce detailed debug logs when debug: true', () => {
    const input = { id: '550e8400-e29b-41d4-a716-446655440000', drop_me: true }
    const result = distill(input, {
      tokenCounter: mockTokens,
      debug: true,
      dropKeys: ['drop_me'],
    })

    expect(result.debugLogs).toBeDefined()
    expect(result.debugLogs?.length).toBeGreaterThan(0)
    const logStr = result.debugLogs?.join('\n')
    expect(logStr).toContain('[Aliaser:uuid]')
    expect(logStr).toContain('[Scrubber] Dropping blocklist key: "drop_me"')
  })

  it('should support modular aliasers with distinct counters', () => {
    const input = {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      sha: 'a9993e364706816aba3e25717850c26c9cd0d89d',
    }

    const result = distill(input, { tokenCounter: mockTokens })

    expect(result.contextString).toContain('$UUID_0')
    expect(result.contextString).toContain('$SHA_0')
  })

  it('should support custom aliasers for domain-specific patterns', () => {
    const input = {
      order: 'ORD-12345',
      another: 'ORD-67890',
    }

    const result = distill(input, {
      tokenCounter: mockTokens,
      aliaser: [{ name: 'orders', pattern: /ORD-\d+/g, prefix: 'ORDER' }],
    })

    expect(result.contextString).toContain('$ORDER_0')
    expect(result.contextString).toContain('$ORDER_1')
    expect(result.contextString).not.toContain('ORD-12345')
  })

  it('should support modular redactors for granular PII protection', () => {
    const input = {
      email: 'josh@example.com',
      phone: '+49 170 1234567',
    }

    const result = distill(input, {
      tokenCounter: mockTokens,
      redactors: [emailRedactor], // Only email
    })

    expect(result.contextString).toContain('<EMAIL_0>')
    expect(result.contextString).not.toContain('<PHONE_0>')
    expect(result.contextString).toContain('+49 170')
  })

  it('should support custom redactors and audit callbacks', () => {
    let auditType = ''
    const input = { secret: 'TOP_SECRET_123' }

    const result = distill(input, {
      tokenCounter: mockTokens,
      redactPII: {
        onRedact: (type) => {
          auditType = type
        },
      },
      redactors: [{ name: 'classified', pattern: /TOP_SECRET_\d+/g, prefix: 'SECRET' }],
    })

    expect(result.contextString).toContain('<SECRET_0>')
    expect(auditType).toBe('classified')
  })

  it('should support null replacement with glyphs', () => {
    const input = { value: null }
    const result = distill(input, {
      tokenCounter: mockTokens,
      pruning: { nullReplacement: '∅' },
    })

    expect(result.contextString).toContain('value: ∅')
  })

  it('should support selective pruning of primitives', () => {
    const input = { a: null, b: '', c: undefined }
    const result = distill(input, {
      tokenCounter: mockTokens,
      pruning: { null: false, emptyString: true, undefined: true },
    })

    expect(result.contextString).toContain('a: null')
    expect(result.contextString).not.toContain('b:')
    expect(result.contextString).not.toContain('c:')
  })

  it('should support granular pruning of empty collections', () => {
    const input = { emptyArr: [], emptyObj: {} }

    // Case 1: Prune both
    const res1 = distill(input, {
      tokenCounter: mockTokens,
      pruning: { array: true, object: true },
    })
    expect(res1.contextString).not.toContain('emptyArr')
    expect(res1.contextString).not.toContain('emptyObj')

    // Case 2: Keep both
    const res2 = distill(input, {
      tokenCounter: mockTokens,
      pruning: { array: false, object: false },
    })
    expect(res2.contextString).toContain('emptyArr: []')
    expect(res2.contextString).toContain('emptyObj: {}')
  })

  it('should support modular blocklists and defaults', () => {
    // 1. Default should drop __typename
    const res1 = distill({ __typename: 'User', id: 1 }, { tokenCounter: mockTokens })
    expect(res1.contextString).not.toContain('__typename')

    // 2. Composable list should drop github keys
    const res2 = distill(
      { node_id: '123', name: 'straw' },
      {
        tokenCounter: mockTokens,
        blocklist: [githubBlocklist],
      },
    )
    expect(res2.contextString).not.toContain('node_id')
    expect(res2.contextString).toContain('name: straw')

    // 3. Custom blocklist as nested array
    const res3 = distill(
      { junk: 'data', important: 'yes' },
      {
        tokenCounter: mockTokens,
        blocklist: [['junk']],
      },
    )
    expect(res3.contextString).not.toContain('junk')
    expect(res3.contextString).toContain('important: yes')
  })
})
