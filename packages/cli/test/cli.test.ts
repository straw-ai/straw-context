import { resolve } from 'path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { runCli } from '../src/index.js'

const fixtures = resolve(import.meta.dirname, 'fixtures')

afterEach(() => vi.restoreAllMocks())

describe('straw CLI', () => {
  it('inspects a provider request as JSON', async () => {
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const code = await runCli(['inspect', resolve(fixtures, 'openai-request.json'), '--json'])

    expect(code).toBe(0)
    const manifest = JSON.parse(String(output.mock.calls[0]?.[0])) as Record<string, unknown>
    expect(manifest).toMatchObject({ schemaVersion: 1, requestId: expect.any(String) })
  })

  it('returns a failing exit code for contract violations', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const code = await runCli([
      'test',
      resolve(fixtures, 'security-request.json'),
      '--contract',
      resolve(fixtures, 'security-contract.json'),
      '--json',
    ])

    expect(code).toBe(1)
  })

  it('inspects the provider-neutral message shape', async () => {
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const code = await runCli([
      'inspect',
      resolve(fixtures, 'message-request.json'),
      '--adapter',
      'message',
      '--json',
    ])

    expect(code).toBe(0)
    const manifest = JSON.parse(String(output.mock.calls[0]?.[0])) as {
      target: unknown
      components: Array<{ kind: string }>
    }
    expect(manifest.target).toEqual({ provider: 'acme-ai', model: 'agent-1' })
    expect(manifest.components.map(({ kind }) => kind)).toEqual([
      'instruction',
      'tool-definition',
      'message',
    ])
  })

  it('inspects Anthropic Messages with estimated tokenization', async () => {
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const code = await runCli([
      'inspect',
      resolve(fixtures, 'anthropic-request.json'),
      '--adapter',
      'anthropic',
      '--json',
    ])

    expect(code).toBe(0)
    const manifest = JSON.parse(String(output.mock.calls[0]?.[0])) as {
      target: unknown
      analyzers: Record<string, Record<string, unknown>>
      components: Array<{ kind: string }>
    }
    expect(manifest.target).toEqual({ provider: 'anthropic', model: 'claude-test' })
    expect(manifest.analyzers['tokens.composition']?.accuracy).toBe('estimated')
    expect(manifest.components.map(({ kind }) => kind)).toContain('tool-result')
  })

  it('checks every scenario and returns one CI result', async () => {
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const code = await runCli(['check', resolve(fixtures, 'scenarios.json'), '--json'])

    expect(code).toBe(1)
    const suite = JSON.parse(String(output.mock.calls[0]?.[0])) as {
      passed: boolean
      scenarios: Array<{ name: string; passed: boolean }>
    }
    expect(suite.passed).toBe(false)
    expect(suite.scenarios).toEqual([
      expect.objectContaining({ name: 'support-read-only', passed: true }),
      expect.objectContaining({ name: 'support-forbidden-tool', passed: false }),
    ])
  })

  it('emits GitHub Actions error annotations', async () => {
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const code = await runCli(['check', resolve(fixtures, 'scenarios.json'), '--github'])

    expect(code).toBe(1)
    expect(String(output.mock.calls[0]?.[0])).toContain(
      '::error file=openai-request.json,title=Straw%3A support-forbidden-tool%3A Forbidden tool is exposed::',
    )
  })
})
