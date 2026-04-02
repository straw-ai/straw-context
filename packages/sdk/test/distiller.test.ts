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

    it('supports wildcard pattern matching in dropKeys', () => {
      const raw = {
        user_id: 1,
        project_id: 2,
        internal_secret: 'keep out',
        external_data: 'ok',
      }

      const { contextString } = distill(raw, { dropKeys: ['*_id', 'internal_*'] })
      expect(contextString).not.toContain('user_id')
      expect(contextString).not.toContain('project_id')
      expect(contextString).not.toContain('secret')
      expect(contextString).toContain('external_data: ok')
    })

    it('supports wildcard pattern matching in preserveKeys', () => {
      const raw = {
        __typename: 'Noise',
        important_metadata: 'keep',
      }

      // __typename is normally dropped by UNIVERSAL_NOISE_KEYS
      const { contextString } = distill(raw, { preserveKeys: ['__type*', 'important_*'] })
      expect(contextString).toContain('__typename: Noise')
      expect(contextString).toContain('important_metadata: keep')
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

  describe('Engine E: Date Formatter', () => {
    it('converts ISO dates to relative time', () => {
      const now = new Date()
      const fiveDaysAgo = new Date(now.getTime() - 5 * 86400 * 1000).toISOString()
      const data = { created: fiveDaysAgo }

      const { contextString } = distill(data)
      expect(contextString).toContain('created: 5 days ago')
    })

    it('handles future dates', () => {
      const now = new Date()
      const inTwoYears = new Date(now.getTime() + 2 * 31536000 * 1000).toISOString()
      const data = { expires: inTwoYears }

      const { contextString } = distill(data)
      expect(contextString).toContain('expires: in 2 years')
    })

    it('respects relativeDates: false', () => {
      const date = '2024-03-31T00:00:00Z'
      const data = { date }

      const { contextString } = distill(data, { relativeDates: false })
      expect(contextString).toContain(`date: ${date}`)
    })

    it('uses dateAnchor for deterministic relative dates', () => {
      const anchor = new Date('2026-04-02T10:00:00Z')
      const target = new Date('2026-03-30T10:00:00Z').toISOString() // 3 days before anchor
      const data = { event: target }

      const { contextString } = distill(data, { dateAnchor: anchor })
      expect(contextString).toContain('event: 3 days ago')
    })
  })

  describe('Input Guard & Configuration', () => {
    it('automatically parses valid JSON strings by default', () => {
      const json = JSON.stringify({ hello: 'world' })
      const { contextString } = distill(json)
      expect(contextString).toBe('hello: world')
    })

    it('can disable the entire Input Guard', () => {
      const json = JSON.stringify({ hello: 'world' })
      // With guard disabled, it shouldn't auto-parse JSON, should treat as plain text
      const { contextString } = distill(json, { enableInputGuard: false })
      expect(contextString).toBe(json)
    })

    it('deduplicates repetitive log lines with custom threshold', () => {
      const logs = ['[INFO] Repeat', '[INFO] Repeat', '[INFO] Repeat'].join('\n')

      const { contextString } = distill(logs, {
        dedupe: { threshold: 1, contextBuffer: 1, prefixLength: 10 },
      })
      expect(contextString).toContain('lines with prefix "[INFO] Rep" deduplicated')
    })

    it('can disable deduplication via config', () => {
      const logs = Array(10).fill('[INFO] Repeat').join('\n')
      const { contextString } = distill(logs, { dedupe: { enabled: false } })
      expect(contextString).not.toContain('deduplicated')
      expect(contextString.split('\n').length).toBe(10)
    })
  })

  describe('Regression: Table Fixes', () => {
    it('stringifies nested objects in table cells instead of [object Object]', () => {
      const data = [
        { id: 1, info: { name: 'Alice', age: 30 } },
        { id: 2, info: { name: 'Bob', age: 25 } },
      ]

      const { contextString } = distill(data, { tableifyThreshold: 2 })
      expect(contextString).toContain('{"name":"Alice","age":30}')
      expect(contextString).not.toContain('[object Object]')
    })

    it('escapes pipes in table cells to prevent Markdown breakage', () => {
      const data = [
        { id: 1, note: 'Value | with | pipes' },
        { id: 2, note: 'Normal' },
      ]

      const { contextString } = distill(data, { tableifyThreshold: 2 })
      expect(contextString).toContain('Value \\| with \\| pipes')
    })
  })

  describe('Full Distillation Statistics', () => {
    it('calculates reduction statistics', () => {
      const data = {
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
