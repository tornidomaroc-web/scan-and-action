import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor wraps the EXISTING Vite web build (webDir below) into a native
// Android shell. The same `dist/` is what Vercel serves on the web — there is
// deliberately NO server.url here: the app ships its own bundled UI and calls
// the Railway backend over HTTPS. The API base is baked at build time from
// VITE_API_URL (see src/services/apiConfig.ts + .env.production).
const config: CapacitorConfig = {
  appId: 'com.scanaction.app',
  appName: 'Scan & Action',
  webDir: 'dist',
  // androidScheme defaults to 'https' in Capacitor 7 -> the WebView origin is
  // `https://localhost`. The backend CORS allowlist must accept that origin
  // (see apps/backend/src/corsOrigin.ts).
  android: {
    // appendUserAgent lets the backend detect the Android app context (e.g. for
    // hiding payment UI in a later chunk) by sniffing the User-Agent suffix.
    appendUserAgent: 'ScanActionAndroid',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      // We hide it explicitly once React mounts (src/native/index.ts); the
      // duration above is just a safety ceiling.
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
