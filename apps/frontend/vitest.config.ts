import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Standalone vitest config so tests stay decoupled from the build-time
// env guard in vite.config.ts.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
