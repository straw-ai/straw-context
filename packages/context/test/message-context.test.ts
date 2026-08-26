import { describe, expect, it } from 'vitest'

import { adaptMessageRequest } from '../src/index.js'

describe('provider-neutral message request adapter', () => {
  it('annotates system, tools, messages, and tool results', () => {
    const raw = {
      provider: 'acme-ai',
      model: 'agent-1',
      system: 'Follow policy.',
      tools: [{ name: 'search', inputSchema: { type: 'object' } }],
      messages: [
        { role: 'user', content: 'Search for invoices.' },
        { role: 'tool', content: { matches: 2 } },
      ],
    }
    const request = adaptMessageRequest(raw)

    expect(request.raw).toBe(raw)
    expect(request.target).toEqual({ provider: 'acme-ai', model: 'agent-1' })
    expect(request.segments.map(({ id, kind, rawPath }) => ({ id, kind, rawPath }))).toEqual([
      { id: 'system', kind: 'instruction', rawPath: '/system' },
      { id: 'tool:search:0', kind: 'tool-definition', rawPath: '/tools/0' },
      { id: 'messages:0', kind: 'message', rawPath: '/messages/0' },
      { id: 'messages:1', kind: 'tool-result', rawPath: '/messages/1' },
    ])
  })

  it('supports custom role classification and an explicit provider', () => {
    const request = adaptMessageRequest(
      { model: 'local-1', messages: [{ role: 'policy', content: 'Be safe.' }] },
      { provider: 'local', instructionRoles: ['policy'] },
    )

    expect(request.target).toEqual({ provider: 'local', model: 'local-1' })
    expect(request.segments[0]?.kind).toBe('instruction')
  })
})
