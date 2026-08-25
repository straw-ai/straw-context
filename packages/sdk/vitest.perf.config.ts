import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.perf.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
