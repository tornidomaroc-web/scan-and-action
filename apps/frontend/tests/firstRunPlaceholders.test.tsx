import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// Design step 5, the code half of "First run" (board, DESIGN TRACK).
//
// Apple 2.1(a): "placeholder text, empty websites, and other temporary
// content should be scrubbed before submission." Three things are held here:
//
//   1. No catalog string, in any language, promises a feature later, and no
//      screen carries such a sentence as a literal. The last two were the
//      native plan sheet ("Pro is coming soon", "coming in a future update")
//      and ProfileScreen's "More settings coming soon".
//   2. ProfileScreen.tsx is gone, and nothing names it.
//   3. The Login screen links the privacy policy and the terms in both modes
//      and on native, in en, fr and ar, before any account exists (Apple
//      5.1.1(i)); the Settings Legal panel (#271) stays the signed-in place.
// ============================================================================

const h = vi.hoisted(() => ({ platform: 'ios' as 'web' | 'ios' | 'android' }));
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
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'first-run@example.com' } }),
}));
vi.mock('../src/lib/googleClientIds', () => ({ GOOGLE_WEB_CLIENT_ID: '', GOOGLE_IOS_CLIENT_ID: '' }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { AuthScreen } from '../src/screens/AuthScreen';
import { PaywallModal } from '../src/components/PaywallModal';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];
const SRC = join(process.cwd(), 'src');

// A sentence that says a feature is not there yet, per language. Each one
// matched a string that shipped before this change.
const LATER: Record<Lang, RegExp> = {
  en: /coming soon|under development|future update|(?:not|n[’']t) available yet/i,
  fr: /bientôt|prochaine mise à jour|pas encore disponibles?/i,
  ar: /قريب|تحديث قادم|غير متوفرة بعد/,
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}
// Comments may name the rule they keep ("never coming soon, 2.1(a)"); only
// code and copy count.
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('1. no copy promises a feature later', () => {
  for (const lang of LANGS) {
    it(`${lang}: no catalog string matches ${LATER[lang]}`, () => {
      const hits = Object.entries(strings[lang]).filter(([, v]) => typeof v === 'string' && LATER[lang].test(v));
      expect(hits).toEqual([]);
    });
  }

  it('the keys that carried it are gone from all three catalogs', () => {
    for (const lang of LANGS) {
      for (const key of ['moreSettingsSoon', 'proComingSoonTitle', 'proComingSoonBody', 'proComingSoonDismiss']) {
        expect(Object.keys(strings[lang])).not.toContain(key);
      }
    }
  });

  it('no source file carries such a sentence as a literal', () => {
    const hits = sourceFiles(SRC)
      .filter((f) => !f.endsWith(join('i18n', 'strings.ts')))
      .filter((f) => LATER.en.test(stripComments(readFileSync(f, 'utf8'))));
    expect(hits).toEqual([]);
  });
});

describe('2. ProfileScreen.tsx is deleted, and nothing names it', () => {
  it('the file does not exist', () => {
    expect(existsSync(join(SRC, 'screens', 'ProfileScreen.tsx'))).toBe(false);
  });

  it('no source file imports, routes or names it', () => {
    const hits = sourceFiles(SRC).filter((f) => /ProfileScreen/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});

let container: HTMLDivElement;
let root: Root;
function mount(node: React.ReactNode, lang: Lang) {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/login']}>{node}</MemoryRouter>
        </ToastProvider>
      </LanguageProvider>,
    );
  });
}
const qa = (sel: string) => Array.from(container.querySelectorAll<HTMLElement>(sel));

beforeEach(() => {
  localStorage.clear();
  h.platform = 'ios';
});
afterEach(() => {
  root?.unmount();
  container?.remove();
  document.body.innerHTML = '';
});

describe('3. the Login screen links the privacy policy, on native, in both modes', () => {
  for (const platform of ['ios', 'android'] as const) {
    for (const lang of LANGS) {
      it(`${platform} ${lang}: sign-in and create-account each carry the two links, in the catalog's words`, () => {
        h.platform = platform;
        mount(<AuthScreen />, lang);
        const s = strings[lang];
        for (const label of [s.authSignInCta, s.authCreateAccountCta]) {
          flushSync(() => qa('[data-auth-mode-switch] button').find((b) => b.textContent === label)!.click());
          const legal = container.querySelector<HTMLElement>('[data-auth-legal]');
          expect(legal, `${label}: no legal line`).not.toBeNull();
          expect(legal!.textContent).toContain(s.authLegalNotice);
          const links = qa('[data-auth-legal] a').map((a) => [a.getAttribute('href'), a.textContent]);
          expect(links).toEqual([
            ['/terms', s.authTermsLink],
            ['/privacy', s.authPrivacyLink],
          ]);
          // RTL: the line aligns by logical side, so Arabic starts at the right.
          expect(legal!.className).toContain('text-start');
          expect(legal!.className).not.toMatch(/\btext-(left|right)\b/);
          // A link name never breaks across lines ("سياسة / الخصوصية" did).
          for (const a of qa('[data-auth-legal] a')) expect(a.className).toContain('whitespace-nowrap');
        }
        expect(document.documentElement.getAttribute('dir')).toBe(lang === 'ar' ? 'rtl' : 'ltr');
      });
    }
  }

  it('the notice is true under every button: it says "continuing", not "creating an account"', () => {
    expect(strings.en.authLegalNotice).toMatch(/^By continuing/);
    expect(strings.fr.authLegalNotice).toMatch(/^En continuant/);
    expect(strings.ar.authLegalNotice).toMatch(/^بالمتابعة/);
  });
});

describe('the native plan sheet states the rule, and promises nothing', () => {
  for (const lang of LANGS) {
    it(`${lang}: its three catalog strings render, no price, no "later"`, () => {
      mount(<PaywallModal isOpen onClose={() => {}} />, lang);
      const s = strings[lang];
      const text = document.body.textContent ?? '';
      expect(text).toContain(s.nativePlanTitle);
      expect(text).toContain(s.nativePlanBody);
      expect(text).toContain(s.nativePlanDismiss);
      expect(text).not.toMatch(LATER[lang]);
      expect(text).not.toMatch(/\$|€|USD|checkout|paddle/i);
    });
  }
});

describe('the pages the Login links open read left to right where they are English', () => {
  it('ar: the privacy body is LTR English; its sign-in section follows the reader (RTL Arabic)', async () => {
    const { PrivacyPolicy } = await import('../src/screens/PrivacyPolicy');
    mount(<PrivacyPolicy />, 'ar');
    const body = container.querySelector<HTMLElement>('[lang="en"]')!;
    expect(body.getAttribute('dir')).toBe('ltr');
    expect(body.textContent).toContain('Data Collected');
    const signIn = container.querySelector<HTMLElement>('[data-privacy-sign-in]')!;
    expect([signIn.getAttribute('dir'), signIn.getAttribute('lang')]).toEqual(['rtl', 'ar']);
    expect(signIn.textContent).toContain(strings.ar.privacySignInBody);
  });

  it('en: the sign-in section is LTR too', async () => {
    const { PrivacyPolicy } = await import('../src/screens/PrivacyPolicy');
    mount(<PrivacyPolicy />, 'en');
    expect(container.querySelector('[data-privacy-sign-in]')!.getAttribute('dir')).toBe('ltr');
  });

  it('ar: the terms body is LTR English', async () => {
    const { TermsOfService } = await import('../src/screens/TermsOfService');
    mount(<TermsOfService />, 'ar');
    const body = container.querySelector<HTMLElement>('[lang="en"]')!;
    expect(body.getAttribute('dir')).toBe('ltr');
    expect(body.querySelector('h1')).not.toBeNull();
  });
});
