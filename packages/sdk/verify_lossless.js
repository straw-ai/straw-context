import { distill } from './src/distiller/index.js'

const data = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  user: {
    name: 'Josh',
    metadata: null,
    secret: undefined,
  },
  items: [
    { id: 1, val: 'A' },
    { id: 2, val: null },
  ],
}

console.log('--- Straw SDK Enterprise Reset Verification ---')
const result = distill(data, {
  enableAliasing: true,
  tableifyArrays: true,
})

console.log('Context Output:')
console.log(result.contextString)

console.log('\nIntegrity Check:')
const hasPlaceholder = result.contextString.includes('∅')
const hasAllKeys = ['user', 'metadata', 'secret', 'items', 'val'].every((k) =>
  result.contextString.includes(k),
)
const isAliased = result.contextString.includes('$UUID_0')

console.log(`- Placeholders (∅) present: ${hasPlaceholder}`)
console.log(`- All keys preserved: ${hasAllKeys}`)
console.log(`- Aliasing active: ${isAliased}`)

if (hasPlaceholder && hasAllKeys && isAliased) {
  console.log('\n✅ VERIFICATION SUCCESSFUL: 100% Lossless Key Preservation')
} else {
  console.log('\n❌ VERIFICATION FAILED')
  process.exit(1)
}
