import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { inAppPathForAuthLink } from '../lib/authLinks';

// Routes an email's confirmation or reset link into the app when the OS opens
// the app with it (iOS universal link, Android App Link). Rendered once inside
// the Router, beside NativeBackButton. Renders nothing; no-op on web.
//
// Two ways the URL arrives: `appUrlOpen` while the app is running, and
// getLaunchUrl() when the tap cold-started it. Only the one link shape
// lib/authLinks.ts accepts is followed; every other URL is ignored, and an
// ignored or failed hand-over leaves the person where they were (the web page
// at the same address is the fallback when the OS never opens the app).
export const NativeAuthLinks: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const follow = (url: string | undefined) => {
      if (!url) return;
      const path = inAppPathForAuthLink(url);
      if (path) navigate(path, { replace: true });
    };

    let remove: (() => void) | undefined;
    let cancelled = false;
    App.addListener('appUrlOpen', ({ url }) => follow(url))
      .then((h) => {
        if (cancelled) h.remove();
        else remove = h.remove;
      })
      .catch(() => {});
    App.getLaunchUrl()
      .then((launch) => {
        if (!cancelled) follow(launch?.url);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [navigate]);

  return null;
};
