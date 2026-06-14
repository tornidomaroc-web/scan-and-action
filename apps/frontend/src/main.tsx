import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
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
        <App />
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
)
