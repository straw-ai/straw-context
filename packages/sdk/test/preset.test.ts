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
})
