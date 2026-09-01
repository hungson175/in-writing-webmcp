import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  test: { environment: 'node' },
})
