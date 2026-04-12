import { describe, it } from 'vitest'

import { StrawService } from '../src/index.js'
import { estimateTokens } from './estimate.js'

describe('Straw Context Optimizer Demo', () => {
  it('shows Input vs Output analytics', () => {
    const input = {
      project: 'Project-X',
      config: {
        __typename: 'ProjectConfig',
        id: '550e8400-e29b-41d4-a716-446655440000',
        created_at: '2024-03-31T00:00:00Z',
        url: 'https://api.example.com',
        css_classes: 'theme-dark',
        nested_noise: {
          avatar_url: 'hidden',
          null_val: null,
          empty_str: '',
        },
      },
      description:
        "This is a very long description that we want to see ... because it's too much data for a single prompt to handle if there are hundreds of these objects.",
      users: [
        { id: 1, name: 'Alice', role: 'admin', email: 'alice@example.com' },
        { id: 2, name: 'Bob', role: 'user', email: 'bob@example.com' },
        { id: 3, name: 'Charlie', role: 'user', email: 'charlie@example.com' },
      ],
    }

    const straw = new StrawService({ tokenCounter: estimateTokens })
    const result = straw.analyze(input, { debug: true })

    console.log('\n' + '='.repeat(20) + ' INPUT RAW ' + '='.repeat(20))
    console.log(JSON.stringify(input, null, 2))

    console.log('\n' + '='.repeat(20) + ' STRAW OUTPUT (DMD) ' + '='.repeat(20))
    console.log(result.contextString)

    console.log(`Baseline Tokens (Pretty):  ${result.stats.baselineTokens}`)
    console.log(`Minified Tokens (Bench):  ${result.stats.minifiedTokens}`)
    console.log(`Straw Tokens (DMD):       ${result.stats.distilledTokens}`)
    console.log(`Reduction (Headline):     ${result.stats.reductionPercent}%`)
    console.log(`Efficiency Gain (Moat):   ${result.stats.efficiencyGain}%`)
    console.log(`Aliased IDs:              ${result.reverseMap.size}`)

    if (result.reverseMap.size > 0) {
      console.log('\n' + '='.repeat(20) + ' REVERSE MAP ' + '='.repeat(20))
      for (const [alias, original] of result.reverseMap) {
        console.log(`${alias} -> ${original}`)
      }
    }
    console.log('='.repeat(50) + '\n')
  })
})
