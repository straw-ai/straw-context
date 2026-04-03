import { describe, it, expect } from 'vitest'

import { distill } from '../src/distiller/index.js'

describe('ContextDistiller: Safe by Default', () => {
  const mockTokenCounter = (text: string) => text.length // Simple char counter for tests

  it('should drop nodes instead of truncating strings by default when over budget', () => {
    const input = {
      keep: 'This is short',
      long: 'This is a very long string that should normally be truncated if we were using dynamic truncation, but now it should stay intact if the budgeter can just drop it instead.',
      another: 'Another node',
    }

    // Budget that is too small for everything, but big enough for 'keep' and 'another'
    // Total length is ~200. Let's set budget to 50.
    const result = distill(input, {
      tokenCounter: mockTokenCounter,
      budget: {
        maxContextTokens: 50,
      },
      // Even if we set maxStringLength, it shouldn't "nibble" unless allowDynamicTruncation is true
      maxStringLength: 20,
    })

    // The 'long' key should be dropped entirely, NOT truncated to 20 or 10 or 5.
    // 'keep' and 'another' should remain.
    expect(result.contextString).toContain('keep: This is short')
    expect(result.contextString).toContain('another: Another node')
    expect(result.contextString).not.toContain('long:')

    // Check that 'keep' was NOT truncated (it's 13 chars, maxStringLength is 20)
    // Actually, maxStringLength: 20 SHOULD still apply to 'keep' if it was longer,
    // but the point is the BUDGETER shouldn't shrink it further.
  })

  it('should restore dynamic truncation when allowDynamicTruncation is true', () => {
    const input = {
      long: 'This is a very long string that will be truncated middle-out if we allow it.',
    }

    const result = distill(input, {
      tokenCounter: mockTokenCounter,
      budget: {
        maxContextTokens: 60,
        allowDynamicTruncation: true,
      },
      maxStringLength: 100,
      stringTruncationStrategy: 'middle',
    })

    // It should contain '...' because of middle truncation (or 'end' if that's the default, but we set 'middle')
    // and correctly dilated value
    expect(result.contextString).toContain('chars truncated')
    expect(result.contextString.length).toBeLessThanOrEqual(60)
  })

  it('should default to "end" truncation strategy', () => {
    const input = {
      text: '1234567890',
    }

    const result = distill(input, {
      maxStringLength: 5,
      // strategy defaults to 'end'
    })

    // '1234...[6 chars truncated at end]'
    expect(result.contextString).toContain('...[')
    expect(result.contextString).toContain('chars truncated at end')
  })
})
