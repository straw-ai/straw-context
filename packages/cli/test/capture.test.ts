import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { afterEach, describe, expect, it } from 'vitest'

import { createJsonFixtureWriter } from '../src/capture.js'

const cleanup: string[] = []

afterEach(async () => {
  for (const path of cleanup.splice(0)) {
    for (const file of await fs.readdir(path)) await fs.unlink(join(path, file))
    await fs.rmdir(path)
  }
})

describe('development fixture writer', () => {
  it('writes only explicitly sanitized JSON', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'straw-fixtures-'))
    cleanup.push(directory)
    const writer = createJsonFixtureWriter({
      directory,
      sanitize: ({ request }) => ({ model: request.target?.model, input: '[redacted]' }),
      fileName: () => 'support-read-only.json',
    })
    const capture = {
      provider: 'openai' as const,
      operation: 'responses.create' as const,
      request: {
        id: 'request',
        raw: { model: 'gpt-test', input: 'private message' },
        segments: [],
        target: { provider: 'openai', model: 'gpt-test' },
      },
    }

    const sanitized = await writer.sanitize(capture)
    await writer.write(capture, sanitized)
    const fixture = await fs.readFile(join(directory, 'support-read-only.json'), 'utf8')

    expect(JSON.parse(fixture)).toEqual({ model: 'gpt-test', input: '[redacted]' })
    expect(fixture).not.toContain('private message')
  })

  it('rejects file names that escape the fixture directory', async () => {
    const writer = createJsonFixtureWriter({
      directory: tmpdir(),
      sanitize: () => ({}),
      fileName: () => '../request.json',
    })
    const capture = {
      provider: 'openai' as const,
      operation: 'responses.create' as const,
      request: { id: 'request', raw: {}, segments: [] },
    }

    await expect(writer.write(capture, {})).rejects.toThrow('base name')
  })
})
