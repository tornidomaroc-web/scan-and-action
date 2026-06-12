import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Production deploy builds must fail loudly when a required env var is
// missing — the fallbacks are localhost values that break silently once
// deployed. Enforced only on Vercel production builds: CI compile checks and
// local builds need no secrets, and preview deploys may lack
// production-scoped vars (e.g. the live Paddle token).
const REQUIRED_DEPLOY_ENV = [
  'VITE_API_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_PADDLE_PRICE_ID_MONTHLY',
  'VITE_PADDLE_PRICE_ID_YEARLY',
  'VITE_PADDLE_CLIENT_TOKEN',
]

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && process.env.VERCEL_ENV === 'production') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    const missing = REQUIRED_DEPLOY_ENV.filter((key) => !env[key])
    if (missing.length > 0) {
      throw new Error(
        `[env-guard] Deploy build aborted — missing required env vars: ${missing.join(', ')}. ` +
        'Set them in the Vercel project environment.'
      )
    }
  }

  return {
  plugins: [react()],
  css: {
    postcss: './postcss.config.cjs',
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: [
      'brynlee-macrolecithal-uncommiseratively.ngrok-free.dev'
    ]
  }
  }
})