import { describe, it, expect } from 'vitest'

import { distill, DistillError } from '../src/index.js'

describe('ContextDistiller', () => {
  describe('Engine A: Scrubber', () => {
    it('throws on configuration conflict', () => {
      expect(() => distill({}, { dropKeys: ['id'], preserveKeys: ['id'] })).toThrowError(
        DistillError,
      )
    })

    it('throws on circular references', () => {
      const a: any = { name: 'A' }
      a.self = a
      // We catch either our custom error or the native JSON.stringify error depending on where it fails
      expect(() => distill(a)).toThrow()
    })

    it('removes universal noise, nulls, and empty strings', () => {
      const raw = {
        id: 123,
        __typename: 'User',
        avatar_url: 'https://...',
        empty_str: '',
        missing: null,
        valid: 'data',
      }

      const { contextString } = distill(raw)
      // Format: "id: 123\nvalid: data"
      expect(contextString).toContain('id: 123')
      expect(contextString).toContain('valid: data')
      expect(contextString).not.toContain('User')
      expect(contextString).not.toContain('avatar_url')
    })

    it('preserves empty arrays by default, but drops them if configured', () => {
      const raw = { data: [] }

      expect(distill(raw).contextString).toBe('data: []')
      expect(distill(raw, { pruneEmptyArrays: true }).contextString).toBe('')
    })
  })

  describe('Engine B: Truncator', () => {
    it('truncates long strings middle-out', () => {
      // Use characters that aren't hex to avoid Aliaser (Engine C) matching them as IDs
      const longString = 'X'.repeat(100) + 'Y'.repeat(1000) + 'Z'.repeat(100)
      const { contextString } = distill({ text: longString }, { maxStringLength: 100 })

      expect(contextString).toContain('...[')
      expect(contextString).toContain('chars truncated]...')
      expect(contextString.length).toBeLessThan(longString.length)
      // 40% of 100 is 40 chars.
      expect(contextString).toContain('XXXX')
      expect(contextString).toContain('ZZZZ')
    })
  })

  describe('Engine C: Aliaser', () => {
    it('replaces UUIDs with aliases and provides reverse map', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      const data = { user_id: uuid, meta: `Ref: ${uuid}` }

      const { contextString, reverseMap } = distill(data)

      expect(contextString).toContain('$ID_0')
      expect(contextString).not.toContain(uuid)
      expect(reverseMap.get('$ID_0')).toBe(uuid)
    })
  })

  describe('Engine D: Formatter (Table-ification)', () => {
    it('converts arrays of similar objects to Markdown tables', () => {
      const data = {
        users: [
          { id: 1, name: 'Alice', role: 'admin' },
          { id: 2, name: 'Bob', role: 'user' },
          { id: 3, name: 'Charlie', role: 'user' },
        ],
      }

      const { contextString } = distill(data, { tableifyThreshold: 3 })

      expect(contextString).toContain('| id | name | role |')
      expect(contextString).toContain('| --- | --- | --- |')
      expect(contextString).toContain('| 1 | Alice | admin |')
    })

    it('respects tableifyThreshold', () => {
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]

      const { contextString } = distill(data, { tableifyThreshold: 3 })
      expect(contextString).not.toContain('| id |')
      expect(contextString).toContain('id: 1')
    })
  })

  describe('Full Distillation', () => {
    it('calculates reduction statistics', () => {
      const data = {
        junk: null,
        noise: '__typename',
        nested: {
          deep: 'value',
          long: 'X'.repeat(2000),
        },
      }

      const { stats } = distill(data, { maxStringLength: 100 })

      expect(stats.originalTokens).toBeGreaterThan(0)
      expect(stats.distilledTokens).toBeLessThan(stats.originalTokens)
      expect(stats.reductionPercent).toBeGreaterThan(0)
    })
  })
})
