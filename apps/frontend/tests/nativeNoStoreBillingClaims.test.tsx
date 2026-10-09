import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// Two things the native app showed that it should not (2026-10-09):
//
// 1. "Start free" in the header of the legal pages, one tap from Login and
//    Settings. Apple 3.1.3(f) lets a free companion app unlock what was bought
//    on the web "provided there is no purchasing inside the app, or calls to
//    action for purchase outside of the app". The button led to /login, not to
//    a price, but it is marketing for a paid tier with no job inside the app.
//
// 2. A cancellation route that does not exist. The delete-account dialog,
//    the privacy policy and the deletion page told people to cancel "via the
//    App Store or Google Play" or "the billing portal". The database held 3
//    subscriptions, all PADDLE, and 0 REVENUECAT; the app has never shipped a
//    purchase SDK; and there is no billing portal in the app. The one route
//    that is true everywhere is the one the Refund Policy already names:
//    writing to support.
// ============================================================================

const h = vi.hoisted(() => ({ platform: 'ios' as 'web' | 'ios' }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => h.platform, isNativePlatform: () => h.platform !== 'web' },
}));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { LandingHeader } from '../src/components/LandingHeader';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];
const SRC = join(process.cwd(), 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

// Store and portal routes, per language, as they were written before.
const NO_SUCH_ROUTE: Record<Lang, RegExp> = {
  en: /billing portal|App Store|Google Play/i,
  fr: /portail de facturation|App Store|Google Play/i,
  ar: /بوابة الفوترة|App Store|Google Play/,
};
const SUPPORT = 'support@scan-action.com';

let container: HTMLDivElement;
let root: Root;
function mount(lang: Lang) {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <MemoryRouter>
          <LandingHeader showAnchors={false} />
        </MemoryRouter>
      </LanguageProvider>,
    );
  });
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  root?.unmount();
  container?.remove();
});

describe('1. the legal-page header carries no "Start free" in the native app', () => {
  for (const lang of LANGS) {
    it(`ios ${lang}: no Start free; Log in and the way home remain`, () => {
      h.platform = 'ios';
      mount(lang);
      const text = container.textContent ?? '';
      expect(text).not.toContain(strings[lang].landingStartFree);
      expect(text).toContain(strings[lang].landingLogIn);
      expect(container.querySelector('a[href="/"]')).not.toBeNull();
    });
  }

  it('web en: Start free is still there (the landing sells on the web)', () => {
    h.platform = 'web';
    mount('en');
    expect(container.textContent).toContain(strings.en.landingStartFree);
  });
});

describe('2. the cancellation route named is one that exists', () => {
  for (const lang of LANGS) {
    it(`${lang}: the delete-account warning names support, and no store or portal`, () => {
      const copy = strings[lang].deleteAccountSubscriptionWarning;
      expect(copy).not.toMatch(NO_SUCH_ROUTE[lang]);
      expect(copy).toContain(SUPPORT);
    });
  }

  for (const file of ['screens/PrivacyPolicy.tsx', 'screens/DeleteAccountInfo.tsx']) {
    it(`${file}: the subscription sentence names support, and no store or portal`, () => {
      const all = read(file);
      // The paragraph that holds the subscription sentence, not the comments
      // (DeleteAccountInfo's header rightly names Google Play's own policy).
      const at = all.indexOf('cancel an active subscription');
      expect(at).toBeGreaterThan(-1);
      const src = all.slice(at, all.indexOf('</p>', at));
      expect(src).not.toMatch(NO_SUCH_ROUTE.en);
      expect(src).toMatch(/cancel it (?:first )?by\s+writing to support@scan-action\.com/);
    });
  }
});
