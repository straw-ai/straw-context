import { describe, it, expect } from 'vitest'

import { distill } from '../src/index.js'
import { estimateTokens } from './estimate.js'

describe('Enterprise: Multi-LLM Output Optimization', () => {
  const data = {
    user: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Alice <Script>',
      roles: ['admin', 'editor'],
    },
  }

  it('defaults to DMD for OpenAI', () => {
    const { contextString } = distill(data, {
      targetProvider: 'openai',
      enableAliasing: true,
      tokenCounter: estimateTokens,
    })
    expect(contextString).toContain('user:')
    expect(contextString).toContain('id: $UUID_0')
    expect(contextString).not.toContain('<context>')
  })

  it('defaults to XML for Anthropic', () => {
    const { contextString } = distill(data, {
      targetProvider: 'anthropic',
      enableAliasing: true,
      tokenCounter: estimateTokens,
    })
    expect(contextString).toContain('<context>')
    expect(contextString).toContain('<user>')
    expect(contextString).toContain('<id>$UUID_0</id>')
    expect(contextString).toContain('<item>admin</item>')
    expect(contextString).toContain('Alice &lt;Script&gt;') // Escaped XML
  })

  it('allows explicit JSON output override', () => {
    const { contextString } = distill(data, {
      outputFormat: 'json',
      enableAliasing: true,
      tokenCounter: estimateTokens,
    })
    // Should be a valid JSON string
    const parsed = JSON.parse(contextString)
    expect(parsed.user.id).toBe('$UUID_0')
  })

  it('allows explicit XML override on non-anthropic provider', () => {
    const { contextString } = distill(data, {
      targetProvider: 'openai',
      outputFormat: 'xml',
      tokenCounter: estimateTokens,
    })
    expect(contextString).toContain('<context>')
  })

  it('handles empty data in XML gracefully', () => {
    // When everything is pruned by the default scrubber, we get an empty context.
    const { contextString } = distill({}, { outputFormat: 'xml', tokenCounter: estimateTokens })
    expect(contextString).toBe('')
  })
})
