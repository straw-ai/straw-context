import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/capture.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
})
