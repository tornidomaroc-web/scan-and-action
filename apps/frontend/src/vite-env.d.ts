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
  // Google OAuth client ids for the NATIVE Google button (lib/socialAuth.ts).
  // Public by nature (they ship in the app), so they belong in the committed
  // .env.production like VITE_API_URL. Absent: the native Google button is
  // not rendered; the web button needs neither, Supabase holds that client.
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
  readonly VITE_GOOGLE_IOS_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
