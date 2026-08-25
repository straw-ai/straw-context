import { promises as fs } from 'fs'
import { basename, resolve } from 'path'

import { type CaptureFixtureWriter, type CapturedRequest } from '@straw-ai/sdk'

export interface JsonFixtureWriterOptions {
  readonly directory: string
  readonly sanitize: (capture: CapturedRequest) => unknown | Promise<unknown>
  readonly fileName?: (capture: CapturedRequest, sequence: number) => string
}

function defaultFileName(capture: CapturedRequest, sequence: number): string {
  return `${capture.operation.replace(/\./g, '-')}-${sequence}.json`
}

/** Creates an explicit, sanitizer-required JSON writer for development fixtures. */
export function createJsonFixtureWriter(options: JsonFixtureWriterOptions): CaptureFixtureWriter {
  if (!options.directory.trim()) throw new TypeError('Fixture directory must not be empty.')
  const directory = resolve(options.directory)
  let sequence = 0
  return {
    sanitize: options.sanitize,
    write: async (capture, sanitizedRequest) => {
      sequence += 1
      const fileName = (options.fileName ?? defaultFileName)(capture, sequence)
      if (!fileName.trim() || basename(fileName) !== fileName) {
        throw new TypeError('Fixture file name must be a non-empty base name.')
      }
      const json = JSON.stringify(sanitizedRequest, null, 2)
      if (json === undefined) throw new TypeError('Sanitizer returned a non-serializable value.')
      await fs.mkdir(directory, { recursive: true })
      await fs.writeFile(resolve(directory, fileName), `${json}\n`, 'utf8')
    },
  }
}
