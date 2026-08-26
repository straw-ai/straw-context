import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

import { createJsonFixtureWriter } from '@straw-ai/cli/capture'
import { captureOpenAIClient, createContractCaptureHandler } from '@straw-ai/context'

import { createFakeOpenAI } from './fake-openai.js'
import { supportContract } from './policy.js'
import { answerSupportQuestion } from './support-agent.js'

const exampleDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = createJsonFixtureWriter({
  directory: resolve(exampleDirectory, 'fixtures'),
  fileName: () => 'support-read-only.json',
  sanitize: ({ request }) => {
    const raw = request.raw as Record<string, unknown>
    return { ...raw, input: 'Summarize support ticket TKT-123.' }
  },
})

const client = captureOpenAIClient(createFakeOpenAI(), {
  onCapture: createContractCaptureHandler({ contract: supportContract, fixture }),
})

await answerSupportQuestion(client, 'This runtime question is deliberately not persisted.')
process.stdout.write('Wrote sanitized fixture: fixtures/support-read-only.json\n')
