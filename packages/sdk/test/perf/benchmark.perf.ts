import { getEncoding } from 'js-tiktoken'
import yaml from 'js-yaml'
import { describe, it } from 'vitest'

import { analyze } from '../../src/index.js'

describe('Multi-Format Performance Comparison (Lossless Architecture)', () => {
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
      name: 'GitHub PR (Metadata Heavy)',
      data: {
        id: 123456789,
        node_id: 'PR_kwDOAKXzo85...',
        number: 42,
        state: 'open',
        title: 'feat: implement TOON and DMD rebranding',
        user: {
          login: 'octocat',
          id: 1,
          node_id: 'MDQ6VXNlcjE=',
          avatar_url: 'https://github.com/images/error/octocat_happy.gif',
        },
        body: 'This is a long body description with multiple lines and markdown formatting.\n\n- Fixes #101\n- Adds TOON support\n- Improves DMD density',
        labels: [
          { id: 208045946, name: 'enhancement', color: 'a2eeef', default: true },
          { id: 123456789, name: 'high-priority', color: 'ff0000', default: false },
        ],
        milestone: { title: 'v1.0.0', state: 'open', created_at: '2024-01-01T00:00:00Z' },
        created_at: '2024-03-31T10:00:00Z',
        updated_at: '2024-04-01T12:00:00Z',
      },
    },
    {
      name: 'Stripe PaymentIntent (Deeply Nested)',
      data: {
        id: 'pi_3P1Abc2eZvKYlo2C1abc1234',
        object: 'payment_intent',
        amount: 2000,
        currency: 'usd',
        status: 'succeeded',
        payment_method: 'pm_1P1Abc2eZvKYlo2C1abc1234',
        client_secret: 'pi_3P1Abc2eZvKYlo2C1abc1234_secret_abc123',
        metadata: { order_id: '6735', customer_ref: 'cust_9988' },
        charges: {
          object: 'list',
          data: [
            {
              id: 'ch_3P1Abc2eZvKYlo2C1abc1234',
              object: 'charge',
              amount: 2000,
              balance_transaction: 'txn_1P1Abc2eZvKYlo2C1abc1234',
              billing_details: {
                address: { city: 'San Francisco', country: 'US', line1: '123 Market St' },
                email: 'jane.doe@example.com',
                name: 'Jane Doe',
              },
            },
          ],
        },
      },
    },
    {
      name: 'Inventory (TOON Testing)',
      data: {
        warehouse: 'SF-01',
        last_audit: '2024-03-25T08:00:00Z',
        items: Array.from({ length: 25 }, (_, i) => ({
          sku: `SKU-${1000 + i}`,
          name: `Industrial Widget Type ${String.fromCharCode(65 + (i % 26))}`,
          quantity: Math.floor(Math.random() * 1000),
          unit_price: (Math.random() * 100).toFixed(2),
          supplier_id: `SUP-${500 + (i % 5)}`,
          location: `Aisle-${i % 10}-Shelf-${Math.floor(i / 10)}`,
        })),
      },
    },
    {
      name: 'Kubernetes Pod (Structural)',
      data: {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: {
          name: 'straw-api-deployment-7f8c9d0b1a-2x4y6',
          namespace: 'production',
          labels: { app: 'straw-api', tier: 'backend' },
          annotations: { 'prometheus.io/scrape': 'true' },
        },
        spec: {
          containers: [
            {
              name: 'api',
              image: 'straw-ai/api:v1.2.3',
              ports: [{ containerPort: 8080 }],
              env: [
                { name: 'NODE_ENV', value: 'production' },
                { name: 'DB_URL', value: 'secret://db-prod' },
              ],
              resources: { limits: { cpu: '500m', memory: '512Mi' } },
            },
          ],
        },
      },
    },
    {
      name: 'Log Chunk (Structured)',
      data: {
        type: 'log_stream',
        entries: [
          '2024-04-01 12:00:01 [INFO] Connected to Database',
          '2024-04-01 12:00:02 [DEBUG] Fetching user preferences...',
          '2024-04-01 12:00:02 [DEBUG] Fetching user preferences...',
          '2024-04-01 12:00:03 [INFO] User preferences loaded',
        ],
      },
    },
  ]

  it('compares Raw vs Min vs YAML vs DMD/TOON (Lossless Analysis)', () => {
    const colWidths = [30, 8, 8, 8, 8, 8, 12, 12]
    const header = [
      'Dataset'.padEnd(colWidths[0]),
      'Raw'.padStart(colWidths[1]),
      'Min'.padStart(colWidths[2]),
      'YAML'.padStart(colWidths[3]),
      'DMD'.padStart(colWidths[4]),
      'TOON'.padStart(colWidths[5]),
      'Headline'.padStart(colWidths[6]),
      'Efficiency'.padStart(colWidths[7]),
    ].join(' | ')

    console.log('\n' + '='.repeat(header.length + 4))
    console.log(`| ${header} |`)
    console.log('|' + '-'.repeat(header.length + 2) + '|')

    for (const tc of testCases) {
      // 1. Raw JSON (Pretty)
      const rawStr = JSON.stringify(tc.data, null, 2)
      const rawTokens = tokenCounter(rawStr)

      // 1.5 Minified JSON
      const minStr = JSON.stringify(tc.data)
      const minTokens = tokenCounter(minStr)

      // 2. YAML
      const yamlStr = yaml.dump(tc.data)
      const yamlTokens = tokenCounter(yamlStr)

      // 3. DMD Pass (Lossless)
      const resultDMD = analyze(tc.data, {
        tokenCounter,
        tableifyArrays: false,
      })

      // 4. TOON Pass (Lossless)
      const resultTOON = analyze(tc.data, {
        tokenCounter,
        tableifyArrays: true,
        tableifyThreshold: 3,
      })

      const headline = resultTOON.stats.reductionPercent
      const efficiency = resultTOON.stats.efficiencyGain

      const row = [
        tc.name.padEnd(colWidths[0]),
        String(rawTokens).padStart(colWidths[1]),
        String(minTokens).padStart(colWidths[2]),
        String(yamlTokens).padStart(colWidths[3]),
        String(resultDMD.stats.distilledTokens).padStart(colWidths[4]),
        String(resultTOON.stats.distilledTokens).padStart(colWidths[5]),
        `${headline}%`.padStart(colWidths[6]),
        `${efficiency}%`.padStart(colWidths[7]),
      ].join(' | ')

      console.log(`| ${row} |`)
    }
    console.log('='.repeat(header.length + 4) + '\n')
  })
})
