import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SearchScreen } from './screens/SearchScreen';
import { DocumentDetailScreen } from './screens/DocumentDetailScreen';
import { ReviewQueueScreen } from './screens/ReviewQueueScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { AuthScreen } from './screens/AuthScreen';
import { Layout } from './components/Layout';
import { LandingScreen } from './screens/LandingScreen';
import { useAuth } from './contexts/AuthContext';
import { strings } from './i18n/strings';
import { ToastProvider } from './contexts/ToastContext';

function App() {
  const { user, loading } = useAuth();
  const [language, setLanguage] = useState<'en' | 'fr' | 'ar'>('en');

  const t = strings[language];
  const isRTL = language === 'ar';

  // Wait for Supabase to resolve the session before choosing a screen
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: 'var(--bg, #f8fafc)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="Loading application"
      />
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <div className={isRTL ? 'rtl' : 'ltr'} dir={isRTL ? 'rtl' : 'ltr'}>
          <Routes>
            {/* Public route */}
            <Route path="/landing" element={<LandingScreen />} />

            {/* Private vs Auth routes map here */}
            {!user ? (
              <Route path="*" element={<AuthScreen />} />
            ) : (
              <Route element={<Layout />}>
                <Route index element={<DashboardScreen t={t} />} />
                <Route path="search" element={<SearchScreen t={t} rtl={isRTL} currentLanguage={language} />} />
                <Route path="queue" element={<ReviewQueueScreen t={t} />} />
                <Route path="documents/:id" element={<DocumentDetailScreen t={t} />} />
                <Route path="settings" element={<div className="p-8"><h1>Settings</h1><p>Coming soon.</p></div>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            )}
          </Routes>
        </div>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;