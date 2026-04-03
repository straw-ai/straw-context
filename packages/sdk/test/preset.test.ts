import { describe, it, expect } from 'vitest'

import { distill } from '../src/index.js'
import { estimateTokens } from './estimate.js'

describe('Enterprise: Intelligent Preset Merging', () => {
  it('concatenates dropKeys instead of overwriting them', () => {
    const data = {
      id: 1,
      node_id: 'secret', // From github preset
      custom_key: 'noise', // User provided
      keep_me: 'data',
    }

    const { contextString } = distill(data, {
      preset: 'github',
      dropKeys: ['custom_key'],
      tokenCounter: estimateTokens,
    })

    expect(contextString).not.toContain('node_id')
    expect(contextString).not.toContain('custom_key')
    expect(contextString).toContain('keep_me: data')
  })

  it('merges multiple presets in order', () => {
    const data = {
      node_id: 'secret', // From github
      __typename: 'Noise', // From graphql
      keep_me: 'data',
    }

    const { contextString } = distill(data, {
      preset: ['github', 'graphql'],
      tokenCounter: estimateTokens,
    })

    expect(contextString).not.toContain('node_id')
    expect(contextString).not.toContain('__typename')
    expect(contextString).toContain('keep_me: data')
  })

  it('merges nested configuration blocks like dedupe', () => {
    const logs = Array(10).fill('[INFO] Repeat').join('\n')

    // Stripe preset doesn't have dedupe config, but we can provide it
    const { contextString } = distill(logs, {
      preset: 'stripe',
      dedupe: { enabled: true, threshold: 2 },
      tokenCounter: estimateTokens,
    })

    expect(contextString).toContain('deduplicated')
  })

  it('allows user options to override primitive preset values', () => {
    // Github preset has maxStringLength: 500
    const data = {
      text: 'A'.repeat(200),
    }

    const { contextString } = distill(data, {
      preset: 'github',
      maxStringLength: 100, // User override (tighter)
      tokenCounter: estimateTokens,
    })

    expect(contextString).toContain('chars truncated')
  })

  it('deduplicates arrays during merge', () => {
    const data = { id: 1 }
    // github preset has dropKeys: ['node_id', ...]
    const { contextString } = distill(data, {
      preset: 'github',
      dropKeys: ['node_id', 'id'], // 'node_id' is already in github preset
      tokenCounter: estimateTokens,
    })

    // No direct way to check the internal array, but we verify it still works and didn't crash
    expect(contextString).not.toContain('id: 1')
  })

  it('deeply merges nested blocks like budget', () => {
    const data = { secret: 'top secret', noise: 'X'.repeat(100) }

    // Hypothetical situation: preset defines a strategy, user defines a limit
    // Note: presets currently don't have budget, but we can mock a merge test
    const { contextString } = distill(data, {
      budget: { maxContextTokens: 20, strategy: 'depth' },
      preserveKeys: ['secret'],
      tokenCounter: estimateTokens,
    })

    expect(contextString).toContain('secret: top secret')
    expect(contextString).not.toContain('noise')
  })
})
