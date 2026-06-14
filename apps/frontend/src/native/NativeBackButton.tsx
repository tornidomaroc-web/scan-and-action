import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { closeTopOverlay } from './overlayStack';

// Top-level tab routes: back from any of these (other than the home route) goes
// to the dashboard; back from the home route backgrounds the app.
const HOME_ROUTES = new Set(['/', '/dashboard']);
const MAIN_TABS = new Set(['/search', '/queue', '/settings']);

// Wires the Android hardware back button. Rendered once inside the Router so it
// has navigate()/location. Order of precedence:
//   1. An open overlay (sheet/modal) closes first.
//   2. A main tab routes back to the dashboard.
//   3. A sub-page (e.g. /documents/:id) goes back one history entry.
//   4. The home route minimizes the app — it must NOT close unexpectedly.
// Renders nothing; no-op on web.
export const NativeBackButton: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locRef = useRef(location);
  locRef.current = location;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let remove: (() => void) | undefined;
    const handlePromise = App.addListener('backButton', () => {
      if (closeTopOverlay()) return;

      const path = locRef.current.pathname;
      if (HOME_ROUTES.has(path)) {
        void App.minimizeApp();
        return;
      }
      if (MAIN_TABS.has(path)) {
        navigate('/dashboard');
        return;
      }
      navigate(-1);
    });

    handlePromise.then((h) => {
      remove = h.remove;
    });
    return () => {
      remove?.();
    };
  }, [navigate]);

  return null;
};
