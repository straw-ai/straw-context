import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/capture.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
})
