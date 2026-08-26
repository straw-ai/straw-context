import { describe, expect, it } from 'vitest'

import { adaptAnthropicRequest } from '../src/index.js'

describe('Anthropic Messages context adapter', () => {
  it('annotates system, tools, message blocks, and tool results', () => {
    const raw = {
      model: 'claude-test',
      system: [{ type: 'text', text: 'Follow policy.' }],
      tools: [{ name: 'search', input_schema: { type: 'object' } }],
      messages: [
        { role: 'user', content: 'Find an invoice.' },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tool-1', content: 'Two matches' },
            { type: 'text', text: 'Continue.' },
          ],
        },
      ],
    }
    const request = adaptAnthropicRequest(raw)

    expect(request.raw).toBe(raw)
    expect(request.target).toEqual({ provider: 'anthropic', model: 'claude-test' })
    expect(request.segments.map(({ kind, rawPath }) => ({ kind, rawPath }))).toEqual([
      { kind: 'instruction', rawPath: '/system' },
      { kind: 'tool-definition', rawPath: '/tools/0' },
      { kind: 'message', rawPath: '/messages/0' },
      { kind: 'tool-result', rawPath: '/messages/1/content/0' },
      { kind: 'message', rawPath: '/messages/1/content/1' },
    ])
  })

  it('does not invent a model target when model is absent', () => {
    expect(adaptAnthropicRequest({ messages: [] }).target).toBeUndefined()
  })
})
