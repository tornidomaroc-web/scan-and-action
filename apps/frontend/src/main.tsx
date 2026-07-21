// Sentry FIRST — before React and the providers — so the SDK's global handlers
// (onerror + onunhandledrejection) are installed before any app code can throw.
// PII redaction ships inside this module; init never runs without it. With
// VITE_SENTRY_DSN unset the module is a no-op.
import './sentry'
import * as Sentry from '@sentry/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppCrashFallback } from './components/AppCrashFallback'
// Self-hosted fonts (bundled by Vite — NO Google Fonts CDN, works offline / in
// the Capacitor Android WebView). Only the subsets/weights we use are imported:
// Inter (latin) for the UI, IBM Plex Sans Arabic (arabic) for RTL copy. Both are
// SIL OFL-1.1 licensed. This fixes the prior defect where 'Inter' was declared
// in CSS but never actually loaded (the app fell back to the OS default sans).
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { LanguageProvider } from './i18n/LanguageContext'
import { initNativeShell } from './native/shell'

// Configure the native shell (status bar, etc.) before first paint. No-op on web.
initNativeShell()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <AuthProvider>
        {/*
          Render-crash boundary. INSIDE LanguageProvider so the fallback sits in
          a tree whose <html dir/lang> is already set for the active locale; the
          fallback itself resolves its copy without context (see
          AppCrashFallback) so it cannot fail for the same reason App did.
          The boundary auto-captures to Sentry (no-op with no DSN). Event-handler
          and async errors are NOT caught here — the SDK's GlobalHandlers
          integration covers those.
        */}
        <Sentry.ErrorBoundary fallback={<AppCrashFallback />}>
          <App />
        </Sentry.ErrorBoundary>
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
)
