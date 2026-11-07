import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/fetchWithTimeout';
import { isIOSApp } from '../native/shell';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Guard: a production/native build with no VITE_API_URL would silently fall back
// to localhost and the shipped app would be dead (no backend reachable). The
// committed apps/frontend/.env.production sets this for both the Vercel web build
// and the Capacitor Android build, so this should never fire — it's a tripwire
// for a misconfigured build env.
if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  console.error(
    '[apiConfig] VITE_API_URL is missing in a production build — API calls will ' +
      'hit the localhost fallback and fail. Check apps/frontend/.env.production and the build environment.'
  );
}

/** The session read runs under the Supabase client's own lock; a stall there
 *  would hold every request behind it. Bounded like the requests themselves. */
export const SESSION_TIMEOUT_MS = 10_000;

/**
 * Sent by the iOS app on every API request. The backend serves the iOS app
 * the free tier (entitlement/clientPlatform.ts). WKWebView's own
 * `Origin: capacitor://localhost` says the same; this header covers a request
 * that reaches the backend without an Origin. The web and Android send none.
 */
export const CLIENT_PLATFORM_HEADER = 'X-Client-Platform';

export const getAuthHeaders = async () => {
  const { data: { session } } = await withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS, 'auth session');
  const token = session?.access_token;

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(isIOSApp() ? { [CLIENT_PLATFORM_HEADER]: 'ios' } : {}),
  };
};

export const getJsonHeaders = async () => {
  const authHeaders = await getAuthHeaders();

  return {
    'Content-Type': 'application/json',
    ...authHeaders,
  };
};