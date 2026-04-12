import fs from 'fs'

import { distill } from '../index.js'
import { measurePerplexity } from './perplexity.js'

async function run() {
  const filePath = process.argv[2]

  if (!filePath) {
    console.error('Error: Please provide a path to a JSON payload file.')
    console.log('Usage: pnpm bench:ppl <path-to-json>')
    process.exit(1)
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at ${filePath}`)
    process.exit(1)
  }

  const payloadString = fs.readFileSync(filePath, 'utf8')
  let payload: any
  try {
    payload = JSON.parse(payloadString)
  } catch {
    console.error('Error: Failed to parse JSON payload.')
    process.exit(1)
  }

  const rawJson = JSON.stringify(payload, null, 2)
  const { contextString } = distill(payload)

  console.log('Measuring perplexity via Ollama (this takes a few seconds)...\n')

  try {
    const [rawResult, distilledResult] = await Promise.all([
      measurePerplexity(rawJson),
      measurePerplexity(contextString),
    ])

    const pplDelta = (((rawResult.ppl - distilledResult.ppl) / rawResult.ppl) * 100).toFixed(1)
    const tokenDelta = (
      ((rawResult.tokenCount - distilledResult.tokenCount) / rawResult.tokenCount) *
      100
    ).toFixed(1)

    console.log(`
  Format        Tokens    PPL
  ─────────────────────────────
  Raw JSON      ${rawResult.tokenCount}      ${rawResult.ppl.toFixed(2)}
  Straw DMD     ${distilledResult.tokenCount}       ${distilledResult.ppl.toFixed(2)}

  Token reduction:  ${tokenDelta}%
  PPL improvement:  ${pplDelta}%
`)
  } catch (err: any) {
    console.error(`Benchmark Failed: ${err.message}`)
    process.exit(1)
  }
}

run()
