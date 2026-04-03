import { describe, it } from 'vitest'

import { distill } from '../src/index.js'
import { estimateTokens } from './estimate.js'

describe('ContextDistiller Demo', () => {
  it('shows Input vs Output in the console', () => {
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
        "This is a very long description that we want to see truncated middle-out because it's too much data for a single prompt to handle if there are hundreds of these objects. " +
        'X'.repeat(500),
      users: [
        { id: 1, name: 'Alice', role: 'admin', email: 'alice@example.com' },
        { id: 2, name: 'Bob', role: 'user', email: 'bob@example.com' },
        { id: 3, name: 'Charlie', role: 'user', email: 'charlie@example.com' },
      ],
    }

    const result = distill(input, { maxStringLength: 100, tokenCounter: estimateTokens })

    console.log('\n' + '='.repeat(20) + ' INPUT ' + '='.repeat(20))
    console.log(JSON.stringify(input, null, 2))

    console.log('\n' + '='.repeat(20) + ' OUTPUT (DMD) ' + '='.repeat(20))
    console.log(result.contextString)

    console.log(`Original Tokens (est):  ${result.stats.originalTokens}`)
    console.log(`Distilled Tokens (est): ${result.stats.distilledTokens}`)
    const reductionPercent = (result.stats.reductionRatio * 100).toFixed(1)
    console.log(`Reduction:              ${reductionPercent}%`)
    console.log(`Aliased IDs:            ${result.reverseMap.size}`)

    if (result.reverseMap.size > 0) {
      console.log('\n' + '='.repeat(20) + ' REVERSE MAP ' + '='.repeat(20))
      for (const [alias, original] of result.reverseMap) {
        console.log(`${alias} -> ${original}`)
      }
    }
    console.log('='.repeat(50) + '\n')
  })
})
