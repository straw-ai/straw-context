import { describe, it } from 'vitest'
import { getEncoding } from 'js-tiktoken'
import yaml from 'js-yaml'
import { distill } from '../src/index.js'

describe('Multi-Format Performance Comparison', () => {
  const enc = getEncoding('cl100k_base') // GPT-4 encoding

  const testCases = [
    {
      name: 'Structured JSON (Metadata Heavy)',
      data: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        __typename: 'UserRecord',
        meta: {
          etag: 'W/"567-12345"',
          last_modified: '2024-03-31T15:00:00Z',
          tags: ['active', 'priority-1', 'internal'],
        },
        payload: {
          content: 'Simple payload',
        },
      },
    },
    {
      name: 'TypeScript Code Blob',
      data: {
        file: 'main.ts',
        content: `
          import { distill } from '@straw-ai/sdk'
          const result = distill({ foo: "bar" })
          console.log(result.contextString)
          // ${'X'.repeat(500)} 
        `,
      },
    },
    {
      name: 'Complex Object Array',
      data: {
        title: 'User List',
        users: Array.from({ length: 5 }, (_, i) => ({
          id: i + 1,
          uuid: '550e8400-e29b-41d4-a716-446655440000',
          name: `User ${i}`,
          role: i % 2 === 0 ? 'admin' : 'user',
          email: `user${i}@example.com`,
          metadata: { login_count: i * 10, last_ip: '127.0.0.1' }
        }))
      },
    }
  ]

  it('compares Raw vs YAML vs DMD (ContextDistiller)', () => {
    console.log('\n' + '='.repeat(100))
    console.log(
      '| ' + 
      'Dataset'.padEnd(30) + ' | ' + 
      'Raw'.padStart(10) + ' | ' + 
      'YAML'.padStart(10) + ' | ' + 
      'DMD (Ours)'.padStart(10) + ' | ' + 
      'Reduction %'.padStart(12) + ' |'
    )
    console.log('-'.repeat(100))

    for (const tc of testCases) {
      // 1. Raw JSON
      const rawStr = JSON.stringify(tc.data, null, 2)
      const rawTokens = enc.encode(rawStr).length

      // 2. YAML
      const yamlStr = yaml.dump(tc.data)
      const yamlTokens = enc.encode(yamlStr).length

      // 3. DMD (ContextDistiller)
      const { contextString } = distill(tc.data, { maxStringLength: 100 })
      const dmdTokens = enc.encode(contextString).length
      
      const reductionPercent = ((1 - dmdTokens / rawTokens) * 100).toFixed(1)

      console.log(
        '| ' + 
        tc.name.padEnd(30) + ' | ' + 
        String(rawTokens).padStart(10) + ' | ' + 
        String(yamlTokens).padStart(10) + ' | ' + 
        String(dmdTokens).padStart(10) + ' | ' + 
        `${reductionPercent}%`.padStart(12) + ' |'
      )
    }
    console.log('='.repeat(100) + '\n')
  })
})
