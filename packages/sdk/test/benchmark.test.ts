import { getEncoding } from 'js-tiktoken'
import yaml from 'js-yaml'
import { describe, it } from 'vitest'

import { distill } from '../src/index.js'

describe('Multi-Format Performance Comparison', () => {
  const enc = getEncoding('cl100k_base') // GPT-4 encoding
  const tokenCounter = (t: string) => enc.encode(t).length

  const testCases = [
    {
      name: 'Structured JSON (Metadata)',
      data: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        __typename: 'UserRecord',
        meta: {
          etag: 'W/"567-12345"',
          last_modified: '2024-03-31T15:00:00Z',
          tags: ['active', 'priority-1', 'internal'],
        },
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
        })),
      },
    },
    {
      name: 'Enterprise: PII + Budget',
      budget: 150,
      data: {
        customer_id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'alice@example.com',
        card: '4111-1111-1111-1111',
        history: [
          { date: '2024-03-20T10:00:00Z', event: 'login', ip: '192.168.1.1' },
          { date: '2024-03-21T11:00:00Z', event: 'purchase', amount: 99.99 },
          { date: '2024-03-22T12:00:00Z', event: 'logout', ip: '192.168.1.1' },
        ],
        unstructured_logs: `
          2024-03-31 10:00:01 INFO: User login success
          2024-03-31 10:00:02 INFO: User login success
          2024-03-31 10:00:03 INFO: User login success
          2024-03-31 10:00:04 INFO: User login success
          2024-03-31 10:00:05 INFO: User login success
        `.trim(),
      },
    },
  ]

  it('compares Raw vs YAML vs DMD (ContextDistiller)', () => {
    const colWidths = [30, 8, 8, 8, 12, 12]
    const header = [
      'Dataset'.padEnd(colWidths[0]),
      'Raw'.padStart(colWidths[1]),
      'YAML'.padStart(colWidths[2]),
      'DMD'.padStart(colWidths[3]),
      'Budgeted'.padStart(colWidths[4]),
      'Reduction'.padStart(colWidths[5]),
    ].join(' | ')

    console.log('\n' + '='.repeat(header.length + 4))
    console.log(`| ${header} |`)
    console.log('|' + '-'.repeat(header.length + 2) + '|')

    for (const tc of testCases) {
      // 1. Raw JSON (Pretty)
      const rawStr = JSON.stringify(tc.data, null, 2)
      const rawTokens = tokenCounter(rawStr)

      // 2. YAML
      const yamlStr = yaml.dump(tc.data)
      const yamlTokens = tokenCounter(yamlStr)

      // 3. DMD (Default)
      const { contextString: dmdStr } = distill(tc.data, { tokenCounter })
      const dmdTokens = tokenCounter(dmdStr)

      // 4. DMD (Budgeted & Secure)
      const { contextString: budgetStr } = distill(tc.data, {
        tokenCounter,
        redactPII: true,
        budget: tc.budget ? { maxContextTokens: tc.budget } : undefined,
      })
      const budgetTokens = tokenCounter(budgetStr)

      const finalTokens = budgetTokens || dmdTokens
      const reductionPercent = ((1 - finalTokens / rawTokens) * 100).toFixed(1)

      const row = [
        tc.name.padEnd(colWidths[0]),
        String(rawTokens).padStart(colWidths[1]),
        String(yamlTokens).padStart(colWidths[2]),
        String(dmdTokens).padStart(colWidths[3]),
        (tc.budget ? `${budgetTokens} (max ${tc.budget})` : '-').padStart(colWidths[4]),
        `${reductionPercent}%`.padStart(colWidths[5]),
      ].join(' | ')

      console.log(`| ${row} |`)
    }
    console.log('='.repeat(header.length + 4) + '\n')
  })
})
