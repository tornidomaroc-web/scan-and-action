import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from './googleClientIds';

// ============================================================================
// Google and Apple sign-in (2026-09-26).
//
// TWO PATHS, ONE OUTCOME: a Supabase session. Which path runs is decided by
// the platform, never by the caller:
//
//   web      Google only, through Supabase's own redirect
//            (signInWithOAuth). The client keeps its default implicit flow,
//            so the tokens come back in the URL hash and detectSessionInUrl
//            (also a default) turns them into a session. No client id is
//            needed here: Supabase holds the Google web client and its
//            secret. REQUIRES the page's origin on Supabase's Redirect URLs
//            allowlist (production and the Vercel preview wildcard), or
//            Supabase falls back to the Site URL silently.
//
//   ios      Apple, then Google, both NATIVE through
//   android  @capgo/capacitor-social-login: the system sheet returns an
//            OpenID Connect ID token and signInWithIdToken exchanges it. No
//            browser hop, no redirect, no deep link. Google's OAuth policy
//            forbids its page inside an embedded WebView
//            ("disallowed_useragent"), which is why the redirect path above is
//            web-only. Apple is iOS-only: on Android and the web it needs a
//            Services ID and a client secret Apple expires every six months,
//            and the board records that decision.
//
// THE NONCE. Supabase compares SHA-256(nonce it is given) with the token's
// `nonce` claim, so the HASHED value goes to the provider and the RAW value
// to signInWithIdToken. Same rule for both providers.
//
// ACCOUNT LINKING is Supabase's, not ours: an identity whose verified email
// matches an existing user is attached to that user, so the uuid the backend
// keys on (authMiddleware.ts, ensureUser) does not change. A Hide-My-Email
// relay address is a new uuid and a new address, so it provisions a second
// account and collides with nothing. authMiddleware.identityLinking.test.ts
// holds those three shapes.
// ============================================================================

export type SocialProvider = 'google' | 'apple';

/** The iOS bundle id; Supabase's Apple provider lists it under Client IDs. */
export const APPLE_NATIVE_CLIENT_ID = 'com.scanaction.app';

export interface SocialConfig {
  /** Google OAuth client of type Web. Android and iOS both need it: the ID
   *  token's audience must be this client for Supabase to accept it. */
  googleWebClientId: string;
  /** Google OAuth client of type iOS, bundle com.scanaction.app. */
  googleIosClientId: string;
}

/** An environment variable wins; the committed public ids are the default. */
export const socialConfigFromEnv = (): SocialConfig => ({
  googleWebClientId: (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || GOOGLE_WEB_CLIENT_ID).trim(),
  googleIosClientId: (import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID || GOOGLE_IOS_CLIENT_ID).trim(),
});

/**
 * Which buttons a platform shows, in order. Apple first on iOS: Apple's HIG
 * asks that its button be no smaller or less prominent than the others, and
 * Google's branding page asks the same of its own, so the two are the same
 * size and the platform's own provider leads.
 *
 * A native Google button is shown only when its client ids are configured:
 * a button that cannot work is placeholder content (Apple 2.1(a)). The web
 * needs no id, since Supabase holds the client.
 */
export function socialProvidersFor(platform: string, config: SocialConfig): SocialProvider[] {
  if (platform === 'web') return ['google'];
  const googleReady = config.googleWebClientId !== '' && (platform !== 'ios' || config.googleIosClientId !== '');
  const google: SocialProvider[] = googleReady ? ['google'] : [];
  return platform === 'ios' ? ['apple', ...google] : google;
}

export class SocialSignInCancelled extends Error {
  constructor() {
    super('social sign-in cancelled');
    this.name = 'SocialSignInCancelled';
  }
}

const toHex = (bytes: ArrayLike<number>) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** A fresh nonce pair: `raw` for Supabase, `hashed` (SHA-256 hex) for the provider. */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = toHex(bytes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return { raw, hashed: toHex(new Uint8Array(digest)) };
}

/**
 * The plugin rejects a dismissed sheet with a message rather than a code, and
 * the wording differs by platform and provider ("canceled", "cancelled",
 * ASAuthorizationError 1001). A dismissal is not an error the person needs to
 * read, so it is mapped to SocialSignInCancelled and the screen shows nothing.
 */
const looksCancelled = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /cancel/i.test(message) || /\b1001\b/.test(message);
};

let initialized: Promise<void> | null = null;

async function nativePlugin(config: SocialConfig) {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  if (!initialized) {
    initialized = SocialLogin.initialize({
      google: {
        webClientId: config.googleWebClientId,
        iOSClientId: config.googleIosClientId,
        iOSServerClientId: config.googleWebClientId,
        mode: 'online',
      },
      // clientId is only the plugin's own switch on iOS; the bundle id is
      // what Apple puts in the token's audience. An empty redirectUrl tells
      // the plugin not to redirect on iOS. useProperTokenExchange makes the
      // plugin return Apple's raw authorization code untouched (with the
      // legacy default it is copied into accessToken and the field is empty;
      // AppleProvider.swift:276-314); the backend exchanges it at account
      // deletion (reauthenticateWithApple below). Sign-in reads only idToken
      // either way.
      apple: { clientId: APPLE_NATIVE_CLIENT_ID, redirectUrl: '', useProperTokenExchange: true },
    }).catch((err) => {
      initialized = null;
      throw err;
    });
  }
  await initialized;
  return SocialLogin;
}

async function signInNative(provider: SocialProvider, config: SocialConfig): Promise<void> {
  const plugin = await nativePlugin(config);
  const nonce = await makeNonce();
  let idToken: string | null;
  try {
    if (provider === 'apple') {
      const res = await plugin.login({ provider: 'apple', options: { scopes: ['email', 'name'], nonce: nonce.hashed } });
      idToken = res.result.idToken;
    } else {
      const res = await plugin.login({ provider: 'google', options: { scopes: ['email', 'profile'], nonce: nonce.hashed } });
      idToken = res.result.responseType === 'online' ? res.result.idToken : null;
    }
  } catch (err) {
    if (looksCancelled(err)) throw new SocialSignInCancelled();
    throw err;
  }
  if (!idToken) throw new Error(`${provider} returned no ID token`);
  const { error } = await supabase.auth.signInWithIdToken({ provider, token: idToken, nonce: nonce.raw });
  if (error) throw error;
}

/**
 * One more Apple sheet, for account deletion on iOS. Returns the authorization
 * code the backend exchanges and revokes (DELETE /api/account, body
 * appleAuthorizationCode); nothing is sent to Supabase and nothing is kept.
 * A dismissed sheet throws SocialSignInCancelled, like sign-in; a sheet that
 * comes back with no code throws APPLE_NO_CODE, so the caller can tell the
 * two apart and the deletion does not proceed on either.
 */
export async function reauthenticateWithApple(config: SocialConfig = socialConfigFromEnv()): Promise<string> {
  const plugin = await nativePlugin(config);
  const nonce = await makeNonce();
  let code: string | undefined;
  try {
    const res = await plugin.login({ provider: 'apple', options: { scopes: ['email'], nonce: nonce.hashed } });
    code = (res.result as { authorizationCode?: string }).authorizationCode;
  } catch (err) {
    if (looksCancelled(err)) throw new SocialSignInCancelled();
    throw err;
  }
  if (!code) throw new Error('APPLE_NO_CODE');
  return code;
}

async function signInWeb(provider: SocialProvider): Promise<void> {
  if (provider !== 'google') throw new Error(`${provider} is not offered on the web`);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/login` },
  });
  if (error) throw error;
  // The page is now navigating to Google; nothing more happens here.
}

/**
 * Start a sign-in with `provider`. Resolves once a session exists (native)
 * or once the redirect has been issued (web). Throws SocialSignInCancelled
 * when the person dismissed the sheet, and any other error as-is.
 */
export async function signInWithSocial(
  provider: SocialProvider,
  config: SocialConfig = socialConfigFromEnv(),
  platform: string = Capacitor.getPlatform(),
): Promise<void> {
  if (platform === 'web') return signInWeb(provider);
  return signInNative(provider, config);
}
