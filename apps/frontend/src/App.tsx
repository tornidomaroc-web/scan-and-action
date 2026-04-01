import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SearchScreen } from './screens/SearchScreen';
import { DocumentDetailScreen } from './screens/DocumentDetailScreen';
import { ReviewQueueScreen } from './screens/ReviewQueueScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { ActivityScreen } from './screens/ActivityScreen';
import { SettingsScreen } from './screens/SettingsScreen';
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
            {/* Landing page is accessible to everyone at / */}
            <Route path="/" element={<LandingScreen />} />

            {/* Specific Login route */}
            <Route 
              path="/login" 
              element={!user ? <AuthScreen /> : <Navigate to="/dashboard" replace />} 
            />

            {/* Protected Routes */}
            {user ? (
              <Route element={<Layout />}>
                <Route path="dashboard" element={<DashboardScreen t={t} />} />
                <Route path="activity" element={<ActivityScreen t={t} />} />
                <Route path="search" element={<SearchScreen t={t} rtl={isRTL} currentLanguage={language} />} />
                <Route path="queue" element={<ReviewQueueScreen t={t} />} />
                <Route path="documents/:id" element={<DocumentDetailScreen t={t} />} />
                <Route path="settings" element={<SettingsScreen t={t} />} />
                {/* Redirect any other authenticated path to dashboard */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            ) : (
              // Redirect any other guest path to landing
              <Route path="*" element={<Navigate to="/" replace />} />
            )}
          </Routes>
        </div>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;