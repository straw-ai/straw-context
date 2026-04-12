import fs from 'fs'

import { StrawService } from '../../src/index.js'
import { OllamaBenchmarker } from './OllamaBenchmarker.js'

async function run() {
  const filePath = process.argv[2]
  const format = (process.argv[3] as any) || 'dmd'

  if (!filePath) {
    console.error('Usage: npx tsx cli.ts <file-path> [format]')
    process.exit(1)
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  const input = JSON.parse(raw)

  const benchmarker = new OllamaBenchmarker()
  const tokenCounter = (text: string) => benchmarker.estimateTokens(text)

  const straw = new StrawService({ tokenCounter })

  console.log('Calculating perplexity...')
  const result = straw.analyze(input, {
    outputFormat: format,
    tokenCounter, // Also pass explicitly for clarity in this bench context
  })

  console.log('\n' + '='.repeat(20) + ' ANALYTICS ' + '='.repeat(20))
  console.log(`Format:           ${format}`)
  console.log(`Original Tokens:  ${result.stats.baselineTokens}`)
  console.log(`Distilled Tokens: ${result.stats.distilledTokens}`)
  console.log(`Reduction:        ${result.stats.reductionPercent}%`)
  console.log(`Duration:         ${result.stats.durationMs}ms`)

  const ppl = await benchmarker.measurePerplexity(result.contextString)
  console.log(`Perplexity:       ${ppl.toFixed(4)}`)
  console.log('='.repeat(51) + '\n')
}

run().catch(console.error)
