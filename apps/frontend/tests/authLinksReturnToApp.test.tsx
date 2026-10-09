import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// Design step 5: the confirmation and password-reset emails bring the person
// back into the app (universal links / App Links), and the same address is a
// working web page when the app is absent (the fallback).
//
// Held here, all failing on 526dd088, where none of it exists:
//   1. lib/authLinks.ts accepts one link shape and nothing else.
//   2. /auth/confirm spends the token once and lands in the right place, in
//      en, fr and ar, with RTL-safe classes; a spent link and a dropped
//      connection say different things.
//   3. The native listener follows only that link shape.
//   4. The two well-known files are valid, name this app exactly, and are
//      served as JSON (a missing file answers 200 text/html on Vercel, so the
//      content type is what proves it is the file).
// ============================================================================

const h = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  platform: 'web' as 'web' | 'ios' | 'android',
  listeners: [] as Array<(e: { url: string }) => void>,
  launchUrl: undefined as string | undefined,
}));
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: h.verifyOtp,
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => h.platform, isNativePlatform: () => h.platform !== 'web' },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (_ev: string, fn: (e: { url: string }) => void) => {
      h.listeners.push(fn);
      return Promise.resolve({ remove: () => {} });
    },
    getLaunchUrl: () => Promise.resolve(h.launchUrl ? { url: h.launchUrl } : undefined),
  },
}));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { AuthConfirmScreen } from '../src/screens/AuthConfirmScreen';
import { NativeAuthLinks, resetAuthLinkLaunchForTests } from '../src/native/NativeAuthLinks';
import { inAppPathForAuthLink, readAuthLinkParams } from '../src/lib/authLinks';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];
const CWD = process.cwd();
const HASH = 'pkce_0123456789abcdef';

let container: HTMLDivElement;
let root: Root;
let where = '';
const Where = () => {
  where = useLocation().pathname + useLocation().search;
  return null;
};

function mount(entry: string, lang: Lang = 'en', node: React.ReactNode = <AuthConfirmScreen />) {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <StrictMode>
        <LanguageProvider>
          <MemoryRouter initialEntries={[entry]}>
            <Where />
            <Routes>
              <Route path="/auth/confirm" element={node} />
              <Route path="/dashboard" element={<p data-at="dashboard" />} />
              <Route path="/login" element={<p data-at="login" />} />
              <Route path="*" element={<>{node}</>} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </StrictMode>,
    );
  });
}
const q = (sel: string) => container.querySelector<HTMLElement>(sel);
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  h.verifyOtp.mockReset();
  h.platform = 'web';
  h.listeners = [];
  h.launchUrl = undefined;
  where = '';
  resetAuthLinkLaunchForTests();
});
afterEach(() => {
  root?.unmount();
  container?.remove();
});

describe('1. the one link shape', () => {
  const ok = `https://www.scan-action.com/auth/confirm?token_hash=${HASH}&type=email`;
  it('accepts the template link and maps it to the in-app route', () => {
    expect(inAppPathForAuthLink(ok)).toBe(`/auth/confirm?token_hash=${HASH}&type=email`);
    expect(inAppPathForAuthLink(ok.replace('type=email', 'type=recovery'))).toBe(`/auth/confirm?token_hash=${HASH}&type=recovery`);
    expect(inAppPathForAuthLink(ok.replace('type=email', 'type=signup'))).toBe(`/auth/confirm?token_hash=${HASH}&type=signup`);
  });
  it.each([
    ['another host', `https://evil.example/auth/confirm?token_hash=${HASH}&type=email`],
    ['the apex host', `https://scan-action.com/auth/confirm?token_hash=${HASH}&type=email`],
    ['plain http', `http://www.scan-action.com/auth/confirm?token_hash=${HASH}&type=email`],
    ['another path', `https://www.scan-action.com/settings?token_hash=${HASH}&type=email`],
    ['no token', 'https://www.scan-action.com/auth/confirm?type=email'],
    ['an unknown type', `https://www.scan-action.com/auth/confirm?token_hash=${HASH}&type=magiclink`],
    ['a custom scheme', `com.scanaction.app://auth/confirm?token_hash=${HASH}&type=email`],
    ['garbage', 'not a url'],
  ])('rejects %s', (_label, url) => {
    expect(inAppPathForAuthLink(url)).toBeNull();
  });
  it('drops any extra query parameter instead of passing it on', () => {
    expect(inAppPathForAuthLink(`${ok}&next=/settings`)).toBe(`/auth/confirm?token_hash=${HASH}&type=email`);
  });
  it('reads params the same way the screen does', () => {
    expect(readAuthLinkParams(new URLSearchParams(`token_hash=${HASH}&type=recovery`))).toEqual({ tokenHash: HASH, type: 'recovery' });
    expect(readAuthLinkParams(new URLSearchParams('token_hash=&type=recovery'))).toBeNull();
  });
});

describe('2. /auth/confirm spends the token once and lands in the right place', () => {
  it('email: one verifyOtp call (StrictMode runs the effect twice), then the home', async () => {
    h.verifyOtp.mockResolvedValue({ data: {}, error: null });
    mount(`/auth/confirm?token_hash=${HASH}&type=email`);
    await vi.waitFor(() => expect(where).toBe('/dashboard'));
    expect(h.verifyOtp).toHaveBeenCalledTimes(1);
    expect(h.verifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: 'email' });
  });

  it('recovery: verifies and stays put, so the recovery branch (PASSWORD_RECOVERY) takes over', async () => {
    h.verifyOtp.mockResolvedValue({ data: {}, error: null });
    mount(`/auth/confirm?token_hash=${HASH}&type=recovery`);
    await vi.waitFor(() => expect(h.verifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: 'recovery' }));
    await settle();
    expect(where).toBe(`/auth/confirm?token_hash=${HASH}&type=recovery`);
  });

  it('missing or unknown params: no call, the failed state, a way back to sign in', async () => {
    mount('/auth/confirm?type=email');
    expect(h.verifyOtp).not.toHaveBeenCalled();
    expect(q('[data-auth-confirm="failed"]')).not.toBeNull();
    flushSync(() => q('[data-auth-confirm] button')!.click());
    await vi.waitFor(() => expect(where).toBe('/login'));
  });

  for (const lang of LANGS) {
    it(`${lang}: working, spent and offline each say their own catalog sentence, laid out by logical side`, async () => {
      let resolve!: (v: unknown) => void;
      h.verifyOtp.mockReturnValue(new Promise((r) => (resolve = r)));
      mount(`/auth/confirm?token_hash=${HASH}&type=email`, lang);
      const s = strings[lang];
      expect(container.textContent).toContain(s.authConfirmWorkingTitle);
      expect(container.textContent).toContain(s.authConfirmWorkingBody);
      resolve({ data: {}, error: { status: 403, code: 'otp_expired', message: 'Email link is invalid or has expired' } });
      await vi.waitFor(() => expect(q('[data-auth-confirm="failed"]')).not.toBeNull());
      expect(container.textContent).toContain(s.authConfirmFailedTitle);
      expect(container.textContent).toContain(s.authConfirmFailedBody);
      expect(container.textContent).not.toContain('Email link is invalid');
      expect(container.textContent).toContain(s.authBackToSignIn);
      for (const el of Array.from(container.querySelectorAll('[data-auth-confirm] *'))) {
        expect(el.getAttribute('class') ?? '').not.toMatch(/\b(text-left|text-right|ml-|mr-|pl-|pr-|left-|right-)/);
      }
      expect(document.documentElement.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
      root.unmount();
      container.remove();

      h.verifyOtp.mockResolvedValue({ data: {}, error: { message: 'Failed to fetch' } });
      mount(`/auth/confirm?token_hash=${HASH}&type=email`, lang);
      await vi.waitFor(() => expect(q('[data-auth-confirm="network"]')).not.toBeNull());
      expect(container.textContent).toContain(s.authNetworkError);
    });
  }

  it('the four new strings exist in all three catalogs, and the Arabic ones are Arabic', () => {
    for (const key of ['authConfirmWorkingTitle', 'authConfirmWorkingBody', 'authConfirmFailedTitle', 'authConfirmFailedBody'] as const) {
      for (const lang of LANGS) expect(strings[lang][key].length).toBeGreaterThan(5);
      expect(strings.ar[key]).toMatch(/[؀-ۿ]/);
      expect(strings.ar[key]).not.toMatch(/[A-Za-z]/);
      expect(strings.fr[key]).not.toBe(strings.en[key]);
    }
  });
});

describe('3. the native listener follows only that link', () => {
  it('web: registers nothing', async () => {
    mount('/start', 'en', <NativeAuthLinks />);
    await settle();
    expect(h.listeners).toHaveLength(0);
  });

  it('ios: a template link opens /auth/confirm; any other URL is ignored', async () => {
    h.platform = 'ios';
    mount('/start', 'en', <NativeAuthLinks />);
    await vi.waitFor(() => expect(h.listeners.length).toBeGreaterThan(0));
    flushSync(() => h.listeners.forEach((fn) => fn({ url: 'https://evil.example/auth/confirm?token_hash=x&type=email' })));
    await settle();
    expect(where).toBe('/start');
    flushSync(() => h.listeners.forEach((fn) => fn({ url: `https://www.scan-action.com/auth/confirm?token_hash=${HASH}&type=recovery` })));
    await vi.waitFor(() => expect(where).toBe(`/auth/confirm?token_hash=${HASH}&type=recovery`));
  });

  it('android cold start: the launch URL is followed', async () => {
    h.platform = 'android';
    h.launchUrl = `https://www.scan-action.com/auth/confirm?token_hash=${HASH}&type=email`;
    mount('/start', 'en', <NativeAuthLinks />);
    await vi.waitFor(() => expect(where).toBe(`/auth/confirm?token_hash=${HASH}&type=email`));
  });

  // Found on the Android emulator 2026-10-09: in a BrowserRouter, navigate()
  // changes identity on every navigation, the effect re-ran, getLaunchUrl()
  // returned the cold-start link again, and "Back to sign in" bounced the
  // person straight back to /auth/confirm (spending the token a second time).
  it('the launch URL is followed once: navigating away does not bounce back', async () => {
    h.platform = 'android';
    h.launchUrl = `https://www.scan-action.com/auth/confirm?token_hash=${HASH}&type=email`;
    let go!: (to: string) => void;
    const Go = () => {
      const nav = useNavigate();
      go = nav;
      return null;
    };
    mount('/start', 'en', <><Go /><NativeAuthLinks /></>);
    await vi.waitFor(() => expect(where).toBe(`/auth/confirm?token_hash=${HASH}&type=email`));
    flushSync(() => go('/elsewhere'));
    await settle();
    await settle();
    expect(where).toBe('/elsewhere');
  });

  it('App.tsx mounts the listener and the public route', () => {
    const app = readFileSync(join(CWD, 'src/App.tsx'), 'utf8');
    expect(app).toMatch(/<NativeAuthLinks \/>/);
    expect(app).toMatch(/<Route path="\/auth\/confirm" element={<AuthConfirmScreen \/>} \/>/);
    // Public: declared before the signed-in / guest split, like /support.
    expect(app.indexOf('path="/auth/confirm"')).toBeLessThan(app.indexOf('{user ? ('));
  });
});

describe('4. the well-known files', () => {
  const read = (rel: string) => JSON.parse(readFileSync(join(CWD, 'public/.well-known', rel), 'utf8'));

  it('apple-app-site-association names team NQ23SMHXJV and com.scanaction.app, for /auth/confirm only', () => {
    const aasa = read('apple-app-site-association');
    expect(aasa.applinks.details).toHaveLength(1);
    expect(aasa.applinks.details[0].appIDs).toEqual(['NQ23SMHXJV.com.scanaction.app']);
    const comps = aasa.applinks.details[0].components;
    expect(comps.map((c: { '/': string }) => c['/'])).toEqual(['/auth/confirm']);
    expect(aasa.webcredentials).toBeUndefined();
  });

  it('assetlinks.json names com.scanaction.app and the Play app-signing key read 2026-10-09', () => {
    const links = read('assetlinks.json');
    expect(links).toHaveLength(1);
    expect(links[0].relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(links[0].target.package_name).toBe('com.scanaction.app');
    expect(links[0].target.sha256_cert_fingerprints).toEqual([
      'B6:EA:0E:B6:75:AE:D7:C4:79:48:4B:FB:3B:5B:E4:C5:78:7C:D5:BC:35:D0:64:3B:9D:86:C7:F0:FB:A8:BB:58',
    ]);
  });

  it('vercel.json serves both as application/json and keeps the SPA rewrite', () => {
    const v = JSON.parse(readFileSync(join(CWD, 'vercel.json'), 'utf8'));
    for (const src of ['/.well-known/apple-app-site-association', '/.well-known/assetlinks.json']) {
      const rule = v.headers.find((r: { source: string }) => r.source === src);
      expect(rule.headers).toContainEqual({ key: 'Content-Type', value: 'application/json' });
    }
    expect(v.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }]);
  });
});
