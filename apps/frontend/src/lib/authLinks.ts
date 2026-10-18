// ============================================================================
// The one link shape that may bring a person back into the app from an email.
//
// The Supabase templates (Confirm sign up, Reset password) are to point at
//   https://www.scan-action.com/auth/confirm?token_hash=<hash>&type=<type>
// instead of {{ .ConfirmationURL }}, which points at the supabase.co verify
// endpoint. A universal link (iOS) or App Link (Android) opens the app only
// when the TAPPED link is on the associated domain; the verify endpoint
// reaches www.scan-action.com only through a server redirect afterwards.
//
// The same URL is a real page on the web (AuthConfirmScreen), so when the app
// is absent, or the operating system does not hand the link over, the person
// still confirms or resets on the web: the safe fallback.
//
// Accepted strictly: https, the www host, this one path, a token_hash, and a
// type the screen knows. Anything else returns null and the app ignores it,
// so an associated link can never be used to route the app somewhere else.
// ============================================================================

export const AUTH_CONFIRM_PATH = '/auth/confirm';
export const AUTH_LINK_HOST = 'www.scan-action.com';

/** The verifyOtp types an email link can carry. `signup` is the older name of `email`. */
export const AUTH_LINK_TYPES = ['email', 'signup', 'recovery'] as const;
export type AuthLinkType = (typeof AUTH_LINK_TYPES)[number];

export interface AuthLinkParams {
  tokenHash: string;
  type: AuthLinkType;
}

const isAuthLinkType = (v: string | null): v is AuthLinkType =>
  v !== null && (AUTH_LINK_TYPES as readonly string[]).includes(v);

/** Read token_hash and type from a query string; null when either is missing or unknown. */
export function readAuthLinkParams(search: URLSearchParams): AuthLinkParams | null {
  const tokenHash = search.get('token_hash')?.trim() ?? '';
  const type = search.get('type');
  if (!tokenHash || !isAuthLinkType(type)) return null;
  return { tokenHash, type };
}

/**
 * The in-app route for an opened URL, or null when the URL is not an auth
 * link. Used by the native listener on every URL the OS hands the app.
 */
export function inAppPathForAuthLink(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.host !== AUTH_LINK_HOST) return null;
  if (parsed.pathname.replace(/\/+$/, '') !== AUTH_CONFIRM_PATH) return null;
  const params = readAuthLinkParams(parsed.searchParams);
  if (!params) return null;
  const q = new URLSearchParams({ token_hash: params.tokenHash, type: params.type });
  return `${AUTH_CONFIRM_PATH}?${q.toString()}`;
}
