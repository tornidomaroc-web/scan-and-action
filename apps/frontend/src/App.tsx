import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { SearchScreen } from './screens/SearchScreen';
import { DocumentDetailScreen } from './screens/DocumentDetailScreen';
import { ReviewQueueScreen } from './screens/ReviewQueueScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { ActivityScreen } from './screens/ActivityScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AuthScreen } from './screens/AuthScreen';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen';
import { Layout } from './components/Layout';
import { LandingScreen } from './screens/LandingScreen';
import { TermsOfService } from './screens/TermsOfService';
import { PrivacyPolicy } from './screens/PrivacyPolicy';
import { RefundPolicy } from './screens/RefundPolicy';
import { DeleteAccountInfo } from './screens/DeleteAccountInfo';
import { useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { NativeBackButton } from './native/NativeBackButton';
import { hideSplash, isNativePlatform } from './native/shell';

// Language and direction are owned by LanguageContext (persisted to
// localStorage, sets dir/lang on <html>); screens read it via useStrings.

// Safety net for checkout redirects that land on the marketing page (any
// Paddle session opened before the successUrl pointed at /dashboard):
// forward signed-in users to the dashboard so the PRO welcome still fires.
export const LandingRoute: React.FC<{ authenticated: boolean }> = ({ authenticated }) => {
  const [searchParams] = useSearchParams();
  // The native app has no marketing page: a user who installed it doesn't need a
  // pitch, and a logged-out marketing screen would expose subscription pricing /
  // an upgrade CTA inside the store app (Google Play anti-steering). So "/" goes
  // straight to the dashboard (if signed in) or the login screen. /login itself
  // forwards already-authenticated users to /dashboard, so there is no loop.
  // Guarded by isNativePlatform() — dead on web, so web "/" still renders the
  // marketing LandingScreen exactly as before.
  if (isNativePlatform()) {
    return <Navigate to={authenticated ? '/dashboard' : '/login'} replace />;
  }
  if (authenticated && searchParams.get('checkout') === 'success') {
    return <Navigate to="/dashboard?checkout=success" replace />;
  }
  return <LandingScreen />;
};

/** The one path a pending password recovery is allowed to occupy. */
export const RESET_PASSWORD_PATH = '/reset-password';

function App() {
  const { user, loading, isRecovering } = useAuth();

  // Dismiss the native splash once React has mounted (no-op on web).
  useEffect(() => {
    hideSplash();
  }, []);

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
        <NativeBackButton />
        {/* ══ RECOVERY PRECEDENCE ═══════════════════════════════════════════
            A user who clicked a password-reset email arrives ALREADY
            AUTHENTICATED: Supabase parses the link and establishes a full
            session before React renders. Nothing in `user` or `session`
            distinguishes them from an ordinary sign-in — only the
            PASSWORD_RECOVERY event does, which is why AuthContext now keeps it.

            Without this branch, the ordinary table below applies: the /login
            route forwards authenticated users to /dashboard, and the
            authenticated catch-all (path="*" inside the Layout route) forwards
            EVERY other path there too. The reset screen would never render, and
            the user would land in the app, silently signed in, with the
            password they came to replace still valid.

            The precedence is expressed as a BRANCH rather than as route order
            on purpose. Ordering would make this depend on React Router's
            path-ranking rules and on nobody adding a competing route later;
            a branch means that while a recovery is pending there is exactly
            ONE reachable route, and no route added below can ever outrank it.
            The state is left only by ResetPasswordScreen calling
            clearRecovery() after the password has actually changed, or by a
            sign-out. ══════════════════════════════════════════════════════ */}
        {isRecovering ? (
          <Routes>
            <Route path={RESET_PASSWORD_PATH} element={<ResetPasswordScreen />} />
            <Route path="*" element={<Navigate to={RESET_PASSWORD_PATH} replace />} />
          </Routes>
        ) : (
          <Routes>
            {/* Landing page is accessible to everyone at / */}
            <Route path="/" element={<LandingRoute authenticated={!!user} />} />

            {/* Specific Login route */}
            <Route
              path="/login"
              element={!user ? <AuthScreen /> : <Navigate to="/dashboard" replace />}
            />

            {/* Legal Routes */}
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/refund" element={<RefundPolicy />} />
            {/* Public account-deletion info page (Google Play data-deletion
                policy): reachable logged-out, even after uninstall. */}
            <Route path="/delete-account" element={<DeleteAccountInfo />} />

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
        )}
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;