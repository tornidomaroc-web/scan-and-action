import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';

// ============================================================================
// lib/socialAuth.ts: which buttons a platform gets, the nonce contract, and
// the two paths to a session (web redirect, native ID token). The plugin and
// the Supabase client are mocked; what is asserted is the SHAPE of every call
// that crosses to them, since that is the whole contract: Supabase compares
// SHA-256(raw nonce) with the token's claim, so the hashed value must reach
// the provider and the raw one must reach signInWithIdToken.
// ============================================================================

const h = vi.hoisted(() => ({
  initialize: vi.fn(async () => {}),
  login: vi.fn(),
  signInWithIdToken: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: { initialize: h.initialize, login: h.login },
}));
vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { signInWithIdToken: h.signInWithIdToken, signInWithOAuth: h.signInWithOAuth } },
}));

import {
  makeNonce,
  signInWithSocial,
  socialProvidersFor,
  SocialSignInCancelled,
  APPLE_NATIVE_CLIENT_ID,
} from '../src/lib/socialAuth';

// jsdom's crypto has no SubtleCrypto; the browser's does. Node's WebCrypto is
// the same API, so the hash the code computes is the hash a browser computes.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const CONFIG = { googleWebClientId: 'web-id.apps.googleusercontent.com', googleIosClientId: 'ios-id.apps.googleusercontent.com' };
const NONE = { googleWebClientId: '', googleIosClientId: '' };

beforeEach(() => {
  vi.clearAllMocks();
  h.signInWithIdToken.mockResolvedValue({ data: {}, error: null });
  h.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
});

describe('socialProvidersFor: the platform decides the buttons', () => {
  it('web: Google only, and it needs no client id (Supabase holds the client)', () => {
    expect(socialProvidersFor('web', NONE)).toEqual(['google']);
    expect(socialProvidersFor('web', CONFIG)).toEqual(['google']);
  });
  it('ios: Apple first, then Google when both Google ids are configured', () => {
    expect(socialProvidersFor('ios', CONFIG)).toEqual(['apple', 'google']);
  });
  it('ios without Google ids: Apple alone, never a button that cannot work', () => {
    expect(socialProvidersFor('ios', NONE)).toEqual(['apple']);
    expect(socialProvidersFor('ios', { ...CONFIG, googleIosClientId: '' })).toEqual(['apple']);
  });
  it('android: Google when the web client id is configured, otherwise nothing; never Apple', () => {
    expect(socialProvidersFor('android', CONFIG)).toEqual(['google']);
    expect(socialProvidersFor('android', { ...CONFIG, googleIosClientId: '' })).toEqual(['google']);
    expect(socialProvidersFor('android', NONE)).toEqual([]);
  });
});

describe('makeNonce: hashed is SHA-256 of raw, hex, and every call is fresh', async () => {
  it('pairs correctly', async () => {
    const { raw, hashed } = await makeNonce();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).toBe(createHash('sha256').update(raw).digest('hex'));
  });
  it('control: two calls differ', async () => {
    const a = await makeNonce();
    const b = await makeNonce();
    expect(a.raw).not.toBe(b.raw);
  });
});

describe('web path: Supabase redirect, back to /login on this origin', () => {
  it('google calls signInWithOAuth with redirectTo = origin + /login and never touches the plugin', async () => {
    await signInWithSocial('google', CONFIG, 'web');
    expect(h.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(h.signInWithOAuth.mock.calls[0][0]).toEqual({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login` },
    });
    expect(h.initialize).not.toHaveBeenCalled();
    expect(h.login).not.toHaveBeenCalled();
    expect(h.signInWithIdToken).not.toHaveBeenCalled();
  });
  it('apple is refused on the web (it is offered on iOS only)', async () => {
    await expect(signInWithSocial('apple', CONFIG, 'web')).rejects.toThrow(/not offered on the web/);
    expect(h.signInWithOAuth).not.toHaveBeenCalled();
  });
  it('a Supabase error is thrown to the caller', async () => {
    h.signInWithOAuth.mockResolvedValue({ data: {}, error: new Error('provider is not enabled') });
    await expect(signInWithSocial('google', CONFIG, 'web')).rejects.toThrow('provider is not enabled');
  });
});

describe('native path: the plugin returns an ID token, Supabase exchanges it', () => {
  it('google on android: hashed nonce to the plugin, raw nonce and the token to Supabase', async () => {
    h.login.mockResolvedValue({ provider: 'google', result: { responseType: 'online', idToken: 'google.jwt', profile: {} } });
    await signInWithSocial('google', CONFIG, 'android');

    expect(h.initialize).toHaveBeenCalledTimes(1);
    const init = h.initialize.mock.calls[0][0] as any;
    expect(init.google).toMatchObject({
      webClientId: CONFIG.googleWebClientId,
      iOSClientId: CONFIG.googleIosClientId,
      iOSServerClientId: CONFIG.googleWebClientId, // the token's audience must be the WEB client
      mode: 'online',
    });
    expect(init.apple).toEqual({ clientId: APPLE_NATIVE_CLIENT_ID, redirectUrl: '', useProperTokenExchange: true });

    const loginArgs = h.login.mock.calls[0][0] as any;
    expect(loginArgs.provider).toBe('google');
    expect(loginArgs.options.scopes).toEqual(['email', 'profile']);
    const hashedSent = loginArgs.options.nonce as string;

    expect(h.signInWithIdToken).toHaveBeenCalledTimes(1);
    const exchange = h.signInWithIdToken.mock.calls[0][0] as any;
    expect(exchange).toMatchObject({ provider: 'google', token: 'google.jwt' });
    expect(createHash('sha256').update(exchange.nonce).digest('hex')).toBe(hashedSent);
    expect(h.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('apple on ios: same contract, the email and name scopes', async () => {
    h.login.mockResolvedValue({ provider: 'apple', result: { idToken: 'apple.jwt', accessToken: null, profile: {} } });
    await signInWithSocial('apple', CONFIG, 'ios');
    const loginArgs = h.login.mock.calls[0][0] as any;
    expect(loginArgs.provider).toBe('apple');
    expect(loginArgs.options.scopes).toEqual(['email', 'name']);
    const exchange = h.signInWithIdToken.mock.calls[0][0] as any;
    expect(exchange).toMatchObject({ provider: 'apple', token: 'apple.jwt' });
    expect(createHash('sha256').update(exchange.nonce).digest('hex')).toBe(loginArgs.options.nonce);
  });

  it('the plugin is initialised once across sign-ins', async () => {
    // A fresh module: the once-only promise lives at module scope, and the
    // tests above have already paid it.
    vi.resetModules();
    const fresh = await import('../src/lib/socialAuth');
    h.login.mockResolvedValue({ provider: 'apple', result: { idToken: 'apple.jwt', accessToken: null, profile: {} } });
    await fresh.signInWithSocial('apple', CONFIG, 'ios');
    await fresh.signInWithSocial('apple', CONFIG, 'ios');
    expect(h.initialize).toHaveBeenCalledTimes(1);
    expect(h.login).toHaveBeenCalledTimes(2);
  });

  it('a dismissed sheet becomes SocialSignInCancelled and nothing reaches Supabase', async () => {
    for (const message of ['The user canceled the sign-in flow.', 'Login cancelled', 'ASAuthorizationError error 1001']) {
      h.login.mockRejectedValueOnce(new Error(message));
      await expect(signInWithSocial('google', CONFIG, 'android')).rejects.toBeInstanceOf(SocialSignInCancelled);
    }
    expect(h.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('control: any other plugin failure is thrown as itself', async () => {
    h.login.mockRejectedValueOnce(new Error('[28444] Developer console is not set up correctly'));
    await expect(signInWithSocial('google', CONFIG, 'android')).rejects.toThrow(/28444/);
  });

  it('no ID token: refused before Supabase is asked', async () => {
    h.login.mockResolvedValue({ provider: 'google', result: { responseType: 'online', idToken: null, profile: {} } });
    await expect(signInWithSocial('google', CONFIG, 'android')).rejects.toThrow(/no ID token/);
    expect(h.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('a Supabase refusal of the token is thrown to the caller', async () => {
    h.login.mockResolvedValue({ provider: 'apple', result: { idToken: 'apple.jwt', accessToken: null, profile: {} } });
    h.signInWithIdToken.mockResolvedValue({ data: {}, error: new Error('Passed nonce and nonce in id_token should either both exist or not.') });
    await expect(signInWithSocial('apple', CONFIG, 'ios')).rejects.toThrow(/nonce/);
  });
});
