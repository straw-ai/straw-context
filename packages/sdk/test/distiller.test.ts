import { describe, it, expect } from 'vitest'

import { distill } from '../src/index.js'

describe('ContextDistiller', () => {
  describe('Engine A: Scrubber', () => {
    it('resolves conflicts by letting preserveKeys win', () => {
      const { contextString } = distill({ id: 123 }, { dropKeys: ['id'], preserveKeys: ['id'] })
      expect(contextString).toContain('id: 123')
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

      const { contextString, reverseMap } = distill(data, { enableAliasing: true })

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

      const { contextString } = distill(data, { tableifyArrays: true, tableifyThreshold: 3 })

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

      const { contextString } = distill(data, { relativeDates: true })
      expect(contextString).toContain('created: 5 days ago')
    })

    it('handles future dates', () => {
      const now = new Date()
      const inTwoYears = new Date(now.getTime() + 2 * 31536000 * 1000).toISOString()
      const data = { expires: inTwoYears }

      const { contextString } = distill(data, { relativeDates: true })
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

      const { contextString } = distill(data, { relativeDates: true, dateAnchor: anchor })
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
    it('respects custom deduplication threshold', () => {
      const logs = [
        '[INFO] Identical prefix...',
        '[INFO] Identical prefix...',
        '[INFO] Identical prefix...',
        '[INFO] Identical prefix...',
      ].join('\n')

      // Default threshold is 5, so 4 lines shouldn't dedupe by default
      const { contextString: defaultOut } = distill(logs)
      expect(defaultOut).not.toContain('deduplicated')

      // Set threshold to 2, it should now dedupe
      const { contextString: customOut } = distill(logs, {
        dedupe: { threshold: 2, contextBuffer: 1, prefixLength: 10 },
      })
      expect(customOut).toContain('lines with prefix "[INFO] Ide" deduplicated')
    })

    it('can disable deduplication via config', () => {
      const logs = Array(10).fill('[INFO] Repeat').join('\n')
      const { contextString } = distill(logs, { dedupe: { enabled: false } })
      expect(contextString).not.toContain('deduplicated')
      expect(contextString.split('\n').length).toBe(10)
    })

    it('runs deduplication even if enableInputGuard is false', () => {
      const logs = Array(10).fill('[INFO] Repeat').join('\n')
      const { contextString } = distill(logs, {
        enableInputGuard: false,
        dedupe: { threshold: 2, contextBuffer: 1, prefixLength: 10 },
      })
      expect(contextString).toContain('deduplicated')
    })
  })

  describe('Enterprise Policies & Path-Based Pruning', () => {
    it('supports dot-notation paths in dropKeys', () => {
      const data = {
        user: { id: 1, internal_id: 'secret' },
        project: { id: 2, internal_id: 'secret' },
      }

      // Drop only user.internal_id, but keep project.internal_id
      const { contextString } = distill(data, { dropKeys: ['user.internal_id'] })
      expect(contextString).not.toContain('user:\n  internal_id')
      expect(contextString).toContain('project:')
      expect(contextString).toContain('internal_id: secret')
    })

    it('implements Specificity Wins: preserveKeys overrides default blacklist', () => {
      const data = {
        avatar_url: 'https://...', // Normally dropped by DEFAULT_NOISE_KEYS
        other: 'info',
      }

      const { contextString } = distill(data, { preserveKeys: ['avatar_url'] })
      expect(contextString).toContain('avatar_url: https://...')
    })

    it('can disable the system blocklist entirely', () => {
      const data = {
        avatar_url: 'https://...', // Normally dropped by DEFAULT_NOISE_KEYS
        other: 'info',
      }

      // Default is enabled (dropped)
      expect(distill(data).contextString).not.toContain('avatar_url')

      // Explicitly disabled (kept)
      const { contextString } = distill(data, { useSystemBlocklist: false })
      expect(contextString).toContain('avatar_url: https://...')
    })

    it('works with Enterprise Presets (e.g. GitHub)', () => {
      const githubData = {
        id: 123,
        node_id: 'MDQ6VXNlcjE=',
        login: 'octocat',
      }

      const { contextString } = distill(githubData, { preset: 'github' })
      expect(contextString).toContain('login: octocat')
      expect(contextString).not.toContain('node_id')
    })

    it('supports path-based wildcards like *.key', () => {
      const data = {
        meta: { css_classes: 'foo' },
        deep: { nested: { css_classes: 'bar' } },
      }

      const { contextString } = distill(data, { dropKeys: ['*.css_classes'] })
      expect(contextString).not.toContain('css_classes')
    })
  })

  describe('Middleware Escape Hatch (filterNode)', () => {
    it('runs custom middleware before internal engines', () => {
      const data = {
        nuke_me: 'data',
        keep_me: 'data',
        sensitive: 'very secret',
      }

      const { contextString } = distill(data, {
        filterNode: (key, _value) => {
          if (key === 'nuke_me') return false // DROP
          if (key === 'sensitive') return true // KEEP (no further processing on this node)
          return undefined // Fall back
        },
      })

      expect(contextString).not.toContain('nuke_me')
      expect(contextString).toContain('keep_me')
      expect(contextString).toContain('sensitive: very secret')
    })

    it('provides the full path to the middleware', () => {
      const data = {
        user: { profile: { email: 'test@example.com' } },
      }

      let capturedPath = ''
      distill(data, {
        filterNode: (_key, _value, path) => {
          if (path === 'user.profile.email') {
            capturedPath = path
          }
          return undefined
        },
      })

      expect(capturedPath).toBe('user.profile.email')
    })

    it('remains non-terminal for "true", allowing subsequent PII redaction', () => {
      const data = {
        sensitive: 'Contact me at alice@example.com',
      }
      const { contextString } = distill(data, {
        redactPII: {}, // Enable PII redaction
        filterNode: (key) => key === 'sensitive', // Explicitly keep
      })
      // Should still be redacted!
      expect(contextString).toContain('sensitive: Contact me at <EMAIL_0>')
    })

    it('remains non-terminal for "true", allowing subsequent ID aliasing', () => {
      const data = {
        user_uuid: '550e8400-e29b-41d4-a716-446655440000',
      }
      const { contextString } = distill(data, {
        enableAliasing: true,
        filterNode: (key) => key === 'user_uuid', // Explicitly keep
      })
      // Should still be aliased!
      expect(contextString).toContain('user_uuid: $ID_0')
    })
  })

  describe('Enterprise: Zero-Trust (Allowlist Mode)', () => {
    it('drops everything by default in allowlist mode', () => {
      const data = { name: 'Alice', secret: '1234' }
      const { contextString } = distill(data, { mode: 'allowlist' })
      expect(contextString).toBe('')
    })

    it('only keeps explicitly preserved keys', () => {
      const data = { name: 'Alice', secret: '1234' }
      const { contextString } = distill(data, { mode: 'allowlist', preserveKeys: ['name'] })
      expect(contextString).toBe('name: Alice')
    })

    it('correctly traverses paths to reach allowed keys', () => {
      const data = {
        user: {
          profile: { name: 'Alice', bio: 'secret' },
          id: 1,
        },
        other: 'noise',
      }
      const { contextString } = distill(data, {
        mode: 'allowlist',
        preserveKeys: ['user.profile.name'],
      })
      expect(contextString).toBe('user: \n  profile: \n    name: Alice')
      expect(contextString).not.toContain('bio')
      expect(contextString).not.toContain('other')
    })

    it('supports wildcards in allowlist mode', () => {
      const data = {
        items: [
          { id: 1, val: 'A' },
          { id: 2, val: 'B' },
        ],
        meta: 'noise',
      }
      const { contextString } = distill(data, {
        mode: 'allowlist',
        preserveKeys: ['items.*.val'],
      })
      expect(contextString).toContain('val: A')
      expect(contextString).toContain('val: B')
      expect(contextString).not.toContain('id')
      expect(contextString).not.toContain('meta')
    })

    it('allows entire sub-trees if parent is preserved', () => {
      const data = {
        config: { theme: 'dark', layout: 'grid' },
        user: 'Alice',
      }
      const { contextString } = distill(data, {
        mode: 'allowlist',
        preserveKeys: ['config'],
      })
      expect(contextString).toContain('theme: dark')
      expect(contextString).toContain('layout: grid')
      expect(contextString).not.toContain('Alice')
    })
  })

  describe('Array Input (Data Accumulation)', () => {
    it('distills multiple fragments as a unified payload', () => {
      const fragments = [{ user: 'Alice' }, { user: 'Bob' }]

      const { contextString } = distill(fragments)
      expect(contextString).toContain('Alice')
      expect(contextString).toContain('Bob')
      // DMD format for arrays is '- \n  key: val' or similar depending on depth
      expect(contextString).toMatch(/-[\s]+user: Alice/)
      expect(contextString).toMatch(/-[\s]+user: Bob/)
    })

    it('honors collective budget across multiple fragments', () => {
      const fragments = ['A'.repeat(50), 'B'.repeat(50)]

      const { stats } = distill(fragments, {
        budget: { maxContextTokens: 30 },
        tokenCounter: (t) => t.length,
      })
      expect(stats.distilledTokens).toBeLessThanOrEqual(30)
    })
  })
})
