import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// The Apple and Google buttons on the sign-in screen (2026-09-26), through the
// real AuthScreen with the platform and the sign-in module mocked.
//
// What is held: which platform shows which buttons and in which order; the
// three languages; that a provider failure lands in the form's own error
// panel as catalog copy and a dismissed sheet shows nothing; that the two
// buttons are one size (each vendor forbids being the smaller one); that the
// buttons are the same in both modes; and that nothing about the native
// no-sell surface changed (no price, no Pro on this screen).
// ============================================================================

const h = vi.hoisted(() => ({
  platform: 'web',
  signInWithSocial: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => h.platform,
    isNativePlatform: () => h.platform !== 'web',
  },
}));
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { setStyle: async () => {} }, Style: { Dark: 'DARK', Light: 'LIGHT' } }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: async () => {} } }));
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: h.signInWithPassword,
      signUp: h.signUp,
      resetPasswordForEmail: vi.fn(),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));
vi.mock('../src/lib/socialAuth', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/socialAuth')>();
  return { ...real, signInWithSocial: h.signInWithSocial };
});

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { AuthScreen } from '../src/screens/AuthScreen';
import { SocialSignInCancelled } from '../src/lib/socialAuth';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];
let container: HTMLDivElement;
let root: Root;

function mount(lang: Lang = 'en') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/login']}>
            <AuthScreen />
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>,
    );
  });
}

const q = (sel: string) => container.querySelector(sel);
const qa = (sel: string) => Array.from(container.querySelectorAll(sel));
const providers = () => qa('[data-social-provider]').map((b) => b.getAttribute('data-social-provider'));
const click = (el: Element) => flushSync(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const errorPanel = () => q('[role="alert"]');
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  h.platform = 'web';
  vi.stubEnv('VITE_GOOGLE_WEB_CLIENT_ID', '');
  vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', '');
  h.signInWithSocial.mockResolvedValue(undefined);
});
afterEach(() => {
  root?.unmount();
  container?.remove();
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe('which buttons, on which platform', () => {
  it('web: Google alone, with no client id configured', () => {
    mount();
    expect(providers()).toEqual(['google']);
  });
  it('ios with both Google ids: Apple first, then Google', () => {
    h.platform = 'ios';
    vi.stubEnv('VITE_GOOGLE_WEB_CLIENT_ID', 'web.apps.googleusercontent.com');
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', 'ios.apps.googleusercontent.com');
    mount();
    expect(providers()).toEqual(['apple', 'google']);
  });
  it('ios without Google ids: Apple alone (a Google button that cannot work is placeholder content)', () => {
    h.platform = 'ios';
    mount();
    expect(providers()).toEqual(['apple']);
  });
  it('android with the web id: Google alone; never Apple', () => {
    h.platform = 'android';
    vi.stubEnv('VITE_GOOGLE_WEB_CLIENT_ID', 'web.apps.googleusercontent.com');
    mount();
    expect(providers()).toEqual(['google']);
  });
  it('android without the web id: no social block at all, and no divider', () => {
    h.platform = 'android';
    mount();
    expect(providers()).toEqual([]);
    expect(q('[data-social-sign-in]')).toBeNull();
  });
});

describe('the buttons, in the three languages, in both modes', () => {
  for (const lang of LANGS) {
    it(`${lang}: the titles are the catalog's, the vendor names stay Latin, no digits`, () => {
      h.platform = 'ios';
      vi.stubEnv('VITE_GOOGLE_WEB_CLIENT_ID', 'w');
      vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', 'i');
      mount(lang);
      const [apple, google] = qa('[data-social-provider]');
      expect(apple.textContent).toBe(strings[lang].authContinueWithApple);
      expect(google.textContent).toBe(strings[lang].authContinueWithGoogle);
      expect(apple.textContent).toContain('Apple');
      expect(google.textContent).toContain('Google');
      expect(q('[data-social-sign-in]')!.textContent).toContain(strings[lang].authOrDivider);
      for (const el of [apple, google]) expect(el.textContent).not.toMatch(/[0-9٠-٩]/);
    });
  }

  it('the two buttons are one size and one shape (neither vendor may be the smaller)', () => {
    h.platform = 'ios';
    vi.stubEnv('VITE_GOOGLE_WEB_CLIENT_ID', 'w');
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', 'i');
    mount();
    const [apple, google] = qa('[data-social-provider]');
    expect(apple.className).toBe(google.className);
    expect(apple.className).toContain('min-h-[52px]');
    expect(apple.className).toContain('w-full');
  });

  it('the same buttons in Create account mode, below the form and above the legal line (web)', () => {
    mount();
    const signup = qa('[data-auth-mode-switch] button')[1];
    click(signup);
    expect(q('[data-auth-form="signup"]')).not.toBeNull();
    expect(providers()).toEqual(['google']);
    const form = q('form[data-auth-form]')!;
    const social = q('[data-social-sign-in]')!;
    const legal = q('[data-auth-legal]')!;
    // Document order: form, then the social block, then the legal line.
    expect(form.compareDocumentPosition(social) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(social.compareDocumentPosition(legal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // And the social buttons are NOT inside the form: pressing Enter in a
    // field submits the password form, never a provider.
    expect(form.contains(social)).toBe(false);
  });
});

describe('what a tap does', () => {
  it('calls the sign-in module with the provider, and only that', async () => {
    mount();
    click(q('[data-social-provider="google"]')!);
    await flush();
    expect(h.signInWithSocial).toHaveBeenCalledTimes(1);
    expect(h.signInWithSocial.mock.calls[0][0]).toBe('google');
    expect(h.signInWithPassword).not.toHaveBeenCalled();
    expect(h.signUp).not.toHaveBeenCalled();
  });

  for (const lang of LANGS) {
    it(`${lang}: a provider failure shows the catalog sentence in the form's error panel`, async () => {
      h.signInWithSocial.mockRejectedValue(new Error('provider is not enabled'));
      mount(lang);
      click(q('[data-social-provider="google"]')!);
      await vi.waitFor(() => expect(errorPanel()).not.toBeNull());
      expect(errorPanel()!.textContent).toBe(strings[lang].authSocialError);
      // The raw message never reaches the screen.
      expect(container.textContent).not.toContain('provider is not enabled');
    });
  }

  it('a dismissed sheet shows nothing', async () => {
    h.signInWithSocial.mockRejectedValue(new SocialSignInCancelled());
    mount();
    click(q('[data-social-provider="google"]')!);
    await flush();
    await flush();
    expect(errorPanel()).toBeNull();
  });

  it('a second tap while one is in flight is refused', async () => {
    let release!: () => void;
    h.signInWithSocial.mockImplementation(() => new Promise<void>((r) => { release = r; }));
    h.platform = 'ios';
    vi.stubEnv('VITE_GOOGLE_WEB_CLIENT_ID', 'w');
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', 'i');
    mount();
    click(q('[data-social-provider="apple"]')!);
    await flush();
    for (const b of qa('[data-social-provider]')) expect((b as HTMLButtonElement).disabled).toBe(true);
    release();
    await vi.waitFor(() => expect((q('[data-social-provider="apple"]') as HTMLButtonElement).disabled).toBe(false));
  });
});

describe('the native surface is unchanged by the buttons', () => {
  it('ios: no price, no Pro, no checkout on the sign-in screen', () => {
    h.platform = 'ios';
    vi.stubEnv('VITE_GOOGLE_WEB_CLIENT_ID', 'w');
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', 'i');
    mount();
    expect(container.textContent).not.toMatch(/\$|€|USD|Pro\b|Paddle|checkout/i);
    expect(q('[data-auth-legal]')).toBeNull();
  });
});

describe('source: the sign-in module is the only place a provider is named', () => {
  it('AuthScreen does not call Supabase OAuth or the plugin itself', () => {
    const src = readFileSync(join(__dirname, '../src/screens/AuthScreen.tsx'), 'utf8');
    expect(src).not.toContain('signInWithOAuth');
    expect(src).not.toContain('signInWithIdToken');
    expect(src).not.toContain('capacitor-social-login');
    expect(src).toContain("from '../components/auth/SocialSignIn'");
  });
  it('the landing page still has no OAuth call (the older guard, re-stated here)', () => {
    const src = readFileSync(join(__dirname, '../src/screens/LandingScreen.tsx'), 'utf8');
    expect(src).not.toContain('signInWithOAuth');
  });
});
