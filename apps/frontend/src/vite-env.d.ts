/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_URL: string;
  // NOTE: there are deliberately no VITE_PADDLE_PRICE_ID_* entries. Paddle price
  // ids live in src/lib/pricing.ts as the single source of truth — see that file
  // for why an env var bought nothing here (VITE_ vars are build-time inlined, so
  // changing one needs the same redeploy as editing the constant) while creating a
  // second, invisible copy of the value that could disagree with the price we show.
  readonly VITE_PADDLE_CLIENT_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
