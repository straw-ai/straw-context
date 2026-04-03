import { describe, it, expect } from 'vitest'

import { distill } from '../src/index.js'
import { estimateTokens } from './estimate.js'

describe('Engine F: PII/PHI Redaction', () => {
  it('does nothing by default if redactPII is omitted', () => {
    const data = { email: 'alice@example.com' }
    const res = distill(data, { tokenCounter: estimateTokens })
    expect(res.contextString).toContain('alice@example.com')
  })

  it('redacts emails and assigns semantic counters', () => {
    const data = {
      email1: 'alice@example.com',
      email2: 'bob@test.com',
      email3: 'alice@example.com',
    }
    const res = distill(data, { redactPII: {}, tokenCounter: estimateTokens })

    expect(res.contextString).toContain('<EMAIL_0>')
    expect(res.contextString).toContain('<EMAIL_1>')
    expect(res.contextString).not.toContain('alice@example.com')

    // Alice's email shows up twice, so it should be mapped to the exact same token
    const tokenForAlice = Array.from(res.reverseMap.entries()).find(
      (e) => e[1] === 'alice@example.com',
    )?.[0]
    expect(tokenForAlice).toBeDefined()
    expect(res.contextString.match(new RegExp(tokenForAlice!, 'g'))?.length).toBe(2)
  })

  it('redacts credit cards', () => {
    const data = { visa: 'My card is 4111-1111-1111-1111, do not steal' }
    const res = distill(data, { redactPII: {}, tokenCounter: estimateTokens })
    expect(res.contextString).toContain('<CREDIT_CARD_0>')
    expect(res.contextString).not.toContain('4111-1111-1111-1111')
  })

  it('redacts common API keys', () => {
    const key = 'sk-123456789012345678901234567890123456789012345678'
    const data = { apiKey: key }
    const res = distill(data, { redactPII: {}, tokenCounter: estimateTokens })

    expect(res.contextString).toContain('<API_KEY_0>')
    expect(res.contextString).not.toContain(key)
    expect(res.reverseMap.get('<API_KEY_0>')).toBe(key)
  })

  it('allows enabling specific built-in types only', () => {
    const data = { email: 'test@example.com', phone: '555-555-5555' }
    const res = distill(data, { redactPII: { types: ['email'] }, tokenCounter: estimateTokens })

    expect(res.contextString).toContain('<EMAIL_0>')
    expect(res.contextString).toContain('555-555-5555') // phone should be preserved
  })

  it('supports custom redaction patterns with semantic placeholders', () => {
    const data = { internalId: 'USR-998877' }
    const res = distill(data, {
      redactPII: {
        customRules: [
          {
            pattern: /USR-\d{6}/g,
            replacement: '<INTERNAL_USER>',
          },
        ],
      },
      tokenCounter: estimateTokens,
    })

    expect(res.contextString).toContain('<INTERNAL_USER_0>')
    expect(res.contextString).not.toContain('USR-998877')
    expect(res.reverseMap.get('<INTERNAL_USER_0>')).toBe('USR-998877')
  })

  it('triggers onRedact callback for audit logging', () => {
    let capturedType = ''
    let capturedMatch = ''
    let capturedPath = ''

    const data = { user: { email: 'audit@test.com' } }
    distill(data, {
      redactPII: {
        onRedact: (type, match, path) => {
          capturedType = type
          capturedMatch = match
          capturedPath = path
        },
      },
      tokenCounter: estimateTokens,
    })

    expect(capturedType).toBe('EMAIL')
    expect(capturedMatch).toBe('audit@test.com')
    expect(capturedPath).toBe('user.email')
  })

  it('redacts PII inside deeply nested arrays', () => {
    const data = {
      records: [
        { contacts: ['alice@example.com', 'bob@test.com'] },
        { contacts: ['charlie@example.com'] },
      ],
    }
    const res = distill(data, { redactPII: {}, tokenCounter: estimateTokens })
    expect(res.contextString).not.toContain('alice@example.com')
    expect(res.contextString).toContain('<EMAIL_0>')
    expect(res.contextString).toContain('<EMAIL_1>')
    expect(res.contextString).toContain('<EMAIL_2>')
  })

  it('skips everything when redactPII is omitted', () => {
    const data = { apiKey: 'sk-123456789012345678901234567890123456789012345678' }
    const res = distill(data, { tokenCounter: estimateTokens })
    expect(res.contextString).toContain('sk-')
  })

  it('handles multiple PII types in a single string value', () => {
    const data = {
      note: 'Contact alice@example.com or call 555-555-5555 for card 4111-1111-1111-1111',
    }
    const res = distill(data, { redactPII: {}, tokenCounter: estimateTokens })
    expect(res.contextString).toContain('<EMAIL_0>')
    expect(res.contextString).toContain('<CREDIT_CARD_0>')
    expect(res.contextString).not.toContain('alice@example.com')
    expect(res.contextString).not.toContain('4111-1111-1111-1111')
  })
})
