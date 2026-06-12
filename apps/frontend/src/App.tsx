import React from 'react';
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
import { TermsOfService } from './screens/TermsOfService';
import { PrivacyPolicy } from './screens/PrivacyPolicy';
import { RefundPolicy } from './screens/RefundPolicy';
import { useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';

// Language and direction are owned by LanguageContext (persisted to
// localStorage, sets dir/lang on <html>); screens read it via useStrings.

function App() {
  const { user, loading } = useAuth();

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
        <Routes>
          {/* Landing page is accessible to everyone at / */}
          <Route path="/" element={<LandingScreen />} />

          {/* Specific Login route */}
          <Route
            path="/login"
            element={!user ? <AuthScreen /> : <Navigate to="/dashboard" replace />}
          />

          {/* Legal Routes */}
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/refund" element={<RefundPolicy />} />

          {/* Protected Routes */}
          {user ? (
            <Route element={<Layout />}>
              <Route path="dashboard" element={<DashboardScreen />} />
              <Route path="activity" element={<ActivityScreen />} />
              <Route path="search" element={<SearchScreen />} />
              <Route path="queue" element={<ReviewQueueScreen />} />
              <Route path="documents/:id" element={<DocumentDetailScreen />} />
              <Route path="settings" element={<SettingsScreen />} />
              {/* Redirect any other authenticated path to dashboard */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          ) : (
            // Redirect any other guest path to landing
            <Route path="*" element={<Navigate to="/" replace />} />
          )}
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;