import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor wraps the EXISTING Vite web build (webDir below) into native
// Android and iOS shells. The same `dist/` is what Vercel serves on the web —
// there is deliberately NO server.url here: the app ships its own bundled UI
// and calls the Railway backend over HTTPS. The API base is baked at build
// time from VITE_API_URL (see src/services/apiConfig.ts + .env.production).
//
// iOS (2026-09-27): `ios/` is the Capacitor 8 SPM template, generated on this
// machine and committed. Its signing, version and entitlement settings live in
// the Xcode project itself; CI archives and uploads it (.github/workflows/
// ios-testflight.yml). Nothing here is read by the web build.
const config: CapacitorConfig = {
  appId: 'com.scanaction.app',
  appName: 'Scan & Action',
  webDir: 'dist',
  // androidScheme defaults to 'https' in Capacitor 8 -> the WebView origin is
  // `https://localhost`. The backend CORS allowlist must accept that origin
  // (see apps/backend/src/corsOrigin.ts). iOS's origin is `capacitor://localhost`,
  // also on that allowlist.
  android: {
    // appendUserAgent lets the backend detect the Android app context (e.g. for
    // hiding payment UI in a later chunk) by sniffing the User-Agent suffix.
    appendUserAgent: 'ScanActionAndroid',
  },
  plugins: {
    // The social-login plugin links facebook-ios-sdk unconditionally in its
    // Package.swift. Its capacitor:sync:before hook (scripts/
    // configure-dependencies.js) reads this map and comments the Facebook
    // package and products out of that manifest on every `cap sync`, and
    // selects the facebookDisabled source set on Android. The app offers
    // Google and Apple only; a Facebook provider that is never called still
    // pulls AppTrackingTransparency into the binary, and a tracking purpose
    // string in an app that does not track contradicts the App Privacy
    // answers (WORK-QUEUE, "Remove the Facebook SDK"). The CI audit
    // (.github/workflows/ios-audit.yml) proves the linked binary carries
    // neither framework; iosPlatform.test.ts pins this map.
    SocialLogin: {
      providers: { google: true, apple: true, facebook: false, twitter: false },
    },
    SplashScreen: {
      launchShowDuration: 1500,
      // We hide it explicitly once React mounts (src/native/index.ts); the
      // duration above is just a safety ceiling.
      launchAutoHide: true,
      // The page surface, --sa-surface in styles/tokens.css. Must equal
      // SPLASH_NAVY in assets/generate-android-icons.py (which paints the
      // splash PNGs on both platforms) and the LaunchScreen.storyboard
      // colour; iosPlatform.test.ts pins the three together.
      backgroundColor: '#0F1014',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
