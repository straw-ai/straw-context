import { describe, it, expect } from 'vitest'

import { distill, analyze } from '../src/index.js'
import { estimateTokens } from './estimate.js'

describe('Lossless Structural Transformation (Straw SDK)', () => {
  describe('Input Validation', () => {
    it('throws DistillError when passed a string', () => {
      expect(() => distill('raw string' as any)).toThrow('strictly accepts structured data')
    })

    it('throws DistillError when passed null', () => {
      expect(() => distill(null as any)).toThrow('strictly accepts structured data')
    })

    it('throws DistillError when passed a number', () => {
      expect(() => distill(123 as any)).toThrow('strictly accepts structured data')
    })

    it('accepts an empty object', () => {
      const { contextString } = distill({})
      expect(contextString).toBe('{}')
    })

    it('accepts an empty array', () => {
      const { contextString } = distill([])
      expect(contextString).toBe('[]')
    })
  })

  describe('Engine A: Lossless Minifier (Normalization & Key Preservation)', () => {
    it('normalizes nulls and treats empty strings as literal by default', () => {
      const raw = {
        id: 123,
        empty_str: '',
        missing: null,
        valid: 'data',
      }

      const { contextString } = distill(raw)
      // Enterprise Ready: We NEVER drop keys
      expect(contextString).toContain('id: 123')
      expect(contextString).toContain('valid: data')
      expect(contextString).toContain('empty_str: ')
      expect(contextString).toContain('missing: ∅')
    })

    it('replaces nulls/undefined with custom placeholders', () => {
      const raw = {
        empty_str: '',
        missing: null,
        undef: undefined,
      }

      const { contextString } = distill(raw, {
        normalization: {
          nullPlaceholder: 'None',
          undefinedPlaceholder: 'Unknown',
          normalizeEmptyStrings: true,
        },
      })
      expect(contextString).toContain('empty_str: None')
      expect(contextString).toContain('missing: None')
      expect(contextString).toContain('undef: Unknown')
    })

    it('preserves empty objects but represents them structurally', () => {
      const raw = { empty: {}, keep: { a: 1 } }
      const { contextString } = distill(raw)
      // We keep the keys to maintain structural integrity
      expect(contextString).toContain('empty: {}')
      expect(contextString).toContain('keep:')
    })
  })

  describe('Engine C: Aliaser', () => {
    it('replaces UUIDs with aliases and provides reverse map (Lossless Pointers)', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      const data = { user_id: uuid, meta: `Ref: ${uuid}` }

      const { contextString, reverseMap } = distill(data, {
        enableAliasing: true,
      })

      expect(contextString).toContain('$UUID_0')
      expect(reverseMap.get('$UUID_0')).toBe(uuid)
      expect(contextString).not.toContain(uuid)
    })
  })

  describe('Engine D: Formatters (TOON & DMD)', () => {
    it('converts arrays of similar objects to TOON (Markdown tables)', () => {
      const data = {
        users: [
          { id: 1, name: 'Alice', role: 'admin' },
          { id: 2, name: 'Bob', role: 'user' },
          { id: 3, name: 'Charlie', role: 'user' },
          { id: 4, common: 'yes', unique: 'special_data' },
        ],
      }

      const result = distill(data, {
        outputFormat: 'toon',
        tableifyArrays: true,
        tableifyThreshold: 3,
      })

      expect(result.contextString).toContain('users[4]{id,name,role,common,unique}:')
      expect(result.contextString).toContain('4,∅,∅,yes,special_data')
      expect(result.contextString).toContain('2,Bob,user,∅,∅')
    })
  })

  describe('Circular Reference Handling', () => {
    it('detects and normalizes circular nodes to placeholders', () => {
      const data: any = { name: 'Alice' }
      data.self = data

      // circular detection warnings are part of analyze result
      const { contextString, warnings } = analyze(data, { tokenCounter: estimateTokens })

      expect(contextString).toContain('name: Alice')
      expect(contextString).toContain('self: ∅')
      expect(warnings).toBeDefined()
      expect(warnings![0]).toContain('Circular reference detected')
    })
  })
})
