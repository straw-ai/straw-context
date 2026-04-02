import { describe, it, expect } from 'vitest'

import { identifyInput, tryParseJSON, deduplicateLines } from '../src/distiller/preprocessor.js'

describe('Preprocessor', () => {
  describe('identifyInput', () => {
    it('returns "structured" for objects', () => {
      expect(identifyInput({ a: 1 })).toBe('structured')
    })

    it('returns "structured" for arrays', () => {
      expect(identifyInput([1, 2, 3])).toBe('structured')
    })

    it('returns "unstructured" for strings', () => {
      expect(identifyInput('hello world')).toBe('unstructured')
    })

    it('throws on null', () => {
      expect(() => identifyInput(null)).toThrow('null or undefined')
    })

    it('throws on undefined', () => {
      expect(() => identifyInput(undefined)).toThrow('null or undefined')
    })

    it('throws on numbers', () => {
      expect(() => identifyInput(42)).toThrow('Invalid Input')
    })

    it('throws on booleans', () => {
      expect(() => identifyInput(true)).toThrow('Invalid Input')
    })
  })

  describe('tryParseJSON', () => {
    it('parses valid JSON objects', () => {
      expect(tryParseJSON('{"a":1}')).toEqual({ a: 1 })
    })

    it('parses valid JSON arrays', () => {
      expect(tryParseJSON('[1,2,3]')).toEqual([1, 2, 3])
    })

    it('returns null for plain text', () => {
      expect(tryParseJSON('hello world')).toBeNull()
    })

    it('returns null for malformed JSON that starts with {', () => {
      expect(tryParseJSON('{not valid json}')).toBeNull()
    })

    it('returns null for empty strings', () => {
      expect(tryParseJSON('')).toBeNull()
    })

    it('returns null for strings that look like JSON but are not', () => {
      expect(tryParseJSON('{key: value}')).toBeNull()
    })
  })

  describe('deduplicateLines', () => {
    it('returns short text unchanged', () => {
      const text = 'line 1\nline 2'
      expect(deduplicateLines(text)).toBe(text)
    })

    it('deduplicates repetitive lines above threshold', () => {
      const lines = Array(10).fill('[INFO] Server started').join('\n')
      const result = deduplicateLines(lines, { threshold: 3, contextBuffer: 1, prefixLength: 10 })
      expect(result).toContain('deduplicated')
      expect(result.split('\n').length).toBeLessThan(10)
    })

    it('preserves context buffer lines around deduplication', () => {
      const lines = Array(10).fill('[INFO] Server started').join('\n')
      const result = deduplicateLines(lines, { threshold: 3, contextBuffer: 2, prefixLength: 10 })
      expect(result).toContain('[INFO] Server started')
      expect(result).toContain('deduplicated')
    })

    it('respects enabled: false', () => {
      const lines = Array(10).fill('[INFO] Repeat').join('\n')
      const result = deduplicateLines(lines, { enabled: false })
      expect(result).toBe(lines)
    })

    it('handles mixed content (some repetitive, some unique)', () => {
      const lines = [
        'UNIQUE: First line',
        ...Array(8).fill('[WARN] Timeout on connection'),
        'UNIQUE: Last line',
      ].join('\n')
      const result = deduplicateLines(lines, { threshold: 3, contextBuffer: 1, prefixLength: 10 })
      expect(result).toContain('UNIQUE: First line')
      expect(result).toContain('UNIQUE: Last line')
      expect(result).toContain('deduplicated')
    })
  })
})
