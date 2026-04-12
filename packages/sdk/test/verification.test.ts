import { describe, it, expect } from 'vitest'

import { distill, analyze } from '../src/index.js'

describe('Straw SDK: Lossless Transformation Verification', () => {
  const mockTokens = (text: string) => text.length // Simple char count for testing

  it('should include new byte size metrics and tokensSaved', () => {
    const input = { name: 'Josh', age: 30, city: 'Berlin' }
    const result = analyze(input, { tokenCounter: mockTokens })

    expect(result.originalSizeBytes).toBeGreaterThan(0)
    expect(result.distilledSizeBytes).toBeGreaterThan(0)
    expect(result.stats.tokensSaved).toBeDefined()
    expect(typeof result.stats.tokensSaved).toBe('number')
  })

  it('should respect maxDepth and normalize deep nodes', () => {
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

    const result = analyze(deepObject, {
      tokenCounter: mockTokens,
      maxDepth: 3,
    })

    expect(result.contextString).toContain('keep: me')
    expect(result.contextString).toContain('a_sibling: stay')
    expect(result.contextString).toContain('b_sibling: stay')
    // Depth limit reached at 'c', so it should be normalized to placeholder
    expect(result.contextString).toContain('c: ∅')
    expect(result.warnings).toBeDefined()
    expect(result.warnings?.[0]).toContain('Max depth of 3 reached')
  })

  it('should support YAML output format', () => {
    const input = { user: { id: 1, name: 'Test' } }
    const result = distill(input, {
      outputFormat: 'yaml',
    })

    expect(result.contextString).toContain('user:')
    expect(result.contextString).toContain('name: Test')
    expect(result.contextString).not.toContain('{')
  })

  it('should produce detailed debug logs when debug: true', () => {
    const input = { id: '550e8400-e29b-41d4-a716-446655440000', label: 'test' }
    const result = analyze(input, {
      tokenCounter: mockTokens,
      debug: true,
      enableAliasing: true,
    })

    expect(result.debugLogs).toBeDefined()
    expect(result.debugLogs?.length).toBeGreaterThan(0)
    const logStr = result.debugLogs?.join('\n')
    expect(logStr).toContain('[Aliaser:uuid]')
  })

  it('should support custom aliasers for domain-specific patterns', () => {
    const input = {
      order: 'ORD-12345',
      another: 'ORD-67890',
    }

    const result = distill(input, {
      aliaser: [{ name: 'orders', pattern: /ORD-\d+/g, prefix: 'ORDER' }],
    })

    expect(result.contextString).toContain('$ORDER_0')
    expect(result.contextString).toContain('$ORDER_1')
    expect(result.contextString).not.toContain('ORD-12345')
  })

  describe('Enterprise-Ready TOON v2 (Table Oriented Object Notation)', () => {
    it('should union-scan headers across large arrays to prevent data loss', () => {
      const input = [
        { id: 1, common: 'yes' },
        { id: 2, common: 'yes' },
        { id: 3, common: 'yes' },
        { id: 4, unique: 'special_data' },
      ]

      const result = distill(input, {
        tableifyThreshold: 2,
        tableifyArrays: true,
      })

      // Column mapping should include the unique key found late in the array
      expect(result.contextString).toContain('[4]{id,common,unique}:')
      expect(result.contextString).toContain('1,yes,∅')
      expect(result.contextString).toContain('4,∅,special_data')
    })

    it('should handle missing keys with explicit ∅ placeholders', () => {
      const input = [
        { id: 1, val: 'A' },
        { id: 2 }, // Missing 'val'
      ]

      const result = distill(input, {
        outputFormat: 'toon',
      })

      expect(result.contextString).toContain('1,A')
      expect(result.contextString).toContain('2,∅')
    })
  })

  it('should substitute null values with ∅ instead of dropping keys', () => {
    const input = { a: null, b: { c: null } }
    const result = distill(input)

    expect(result.contextString).toContain('a: ∅')
    expect(result.contextString).toContain('c: ∅')
  })

  it('should support selective normalization of empty strings', () => {
    const input = { a: '', b: 'content' }

    // Default: empty strings are preserved as literals
    const res1 = distill(input)
    expect(res1.contextString).toContain('a: ')

    // With normalization: empty strings become placeholders
    const res2 = distill(input, {
      normalization: { normalizeEmptyStrings: true },
    })
    expect(res2.contextString).toContain('a: ∅')
  })
})
