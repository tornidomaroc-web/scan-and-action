import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// The Legal panel in Settings (Apple 5.1.1(i): a privacy policy link "within
// the app in an easily accessible manner"), and the overview's empty states
// in place of "Data coming soon" (Apple 2.1(a): no placeholder copy).
// Rendered in all three languages; the plan panel's money rules untouched.
// ============================================================================

vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'legal@example.com' }, signOut: vi.fn() }),
  AuthProvider: ({ children }: any) => children,
}));
const native = vi.hoisted(() => ({ on: false }));
vi.mock('../src/native/shell', () => ({ isNativePlatform: () => native.on }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { SettingsScreen } from '../src/screens/SettingsScreen';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];
const SRC = join(process.cwd(), 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

let container: HTMLDivElement;
let root: Root;
function mount(lang: Lang, plan: 'FREE' | 'PRO' = 'FREE') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/settings']}>
            <Routes>
              <Route element={<Outlet context={{ onSuccess: () => {}, refreshCount: 0, plan }} />}>
                <Route path="/settings" element={<SettingsScreen />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}
const text = () => container.textContent ?? '';
const q = (sel: string) => container.querySelector<HTMLElement>(sel);
const unmount = () => {
  root?.unmount();
  container?.remove();
};

beforeEach(() => {
  localStorage.clear();
  native.on = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(unmount);

describe('the Legal panel', () => {
  for (const lang of LANGS) {
    it(`${lang}: two rows, each a link to the public page, between preferences and the plan`, () => {
      mount(lang);
      const panel = q('[data-legal-panel]')!;
      expect(panel).not.toBeNull();
      expect(panel.textContent).toContain(strings[lang].legal);
      expect(panel.textContent).toContain(strings[lang].legalDesc);
      const privacy = panel.querySelector<HTMLAnchorElement>('a[data-legal-link="privacy"]')!;
      const terms = panel.querySelector<HTMLAnchorElement>('a[data-legal-link="terms"]')!;
      expect(privacy.getAttribute('href')).toBe('/privacy');
      expect(terms.getAttribute('href')).toBe('/terms');
      expect(privacy.textContent).toContain(strings[lang].privacyPolicy);
      expect(terms.textContent).toContain(strings[lang].termsOfService);
      // both rows carry an icon tile, like every other settings row (plus the heading's)
      expect(panel.querySelectorAll('[data-icon-tile]').length).toBeGreaterThanOrEqual(3);
      // order on the screen: preferences, legal, plan
      const order = [strings[lang].preferences, strings[lang].legal, strings[lang].subscriptionBilling].map((t) => text().indexOf(t));
      expect(order[0]).toBeGreaterThanOrEqual(0);
      expect(order[0]).toBeLessThan(order[1]);
      expect(order[1]).toBeLessThan(order[2]);
    });
  }

  it('names no price and no plan; the Go PRO button still appears on web FREE only (the native invariant is untouched)', () => {
    for (const on of [false, true]) {
      for (const plan of ['FREE', 'PRO'] as const) {
        native.on = on;
        mount('en', plan);
        const panel = q('[data-legal-panel]')!.textContent ?? '';
        expect(panel).not.toMatch(/\d|\$|€|MAD|PRO|Pro\b|upgrade/i);
        expect(text().includes(strings.en.goPro), `native=${on} plan=${plan}`).toBe(!on && plan === 'FREE');
        unmount();
      }
    }
  });

  it('the strings exist in every catalogue, parity kept, and the copy contains no dash', () => {
    for (const lang of LANGS) {
      for (const k of ['legal', 'legalDesc', 'privacyPolicy', 'termsOfService', 'overviewChartEmpty', 'overviewStatusEmpty'] as const) {
        expect(strings[lang][k], `${lang}.${k}`).toBeTruthy();
        expect(strings[lang][k]).not.toMatch(/[-–—]/);
      }
    }
    expect(Object.keys(strings.fr).sort()).toEqual(Object.keys(strings.en).sort());
    expect(Object.keys(strings.ar).sort()).toEqual(Object.keys(strings.en).sort());
  });
});

describe('the overview no longer says "coming soon"', () => {
  it('dataComingSoon is gone from every catalogue and from the source', () => {
    for (const lang of LANGS) expect((strings[lang] as Record<string, string>).dataComingSoon, lang).toBeUndefined();
    const dash = read('screens/DashboardScreen.tsx');
    const chart = read('components/AreaChart.tsx');
    expect(dash).not.toContain('dataComingSoon');
    expect(chart).not.toContain('dataComingSoon');
    expect(dash).toContain('s.overviewChartEmpty');
    expect(dash).toContain('s.overviewStatusEmpty');
    // the words survive only inside the comments that explain the rule
    for (const m of (dash + chart).matchAll(/coming soon/gi)) {
      const line = (dash + chart).slice(0, m.index).split('\n').length;
      const src = (dash + chart).split('\n')[line - 1];
      expect(src, `line ${line}: ${src}`).toMatch(/2\.1\(a\)/);
    }
  });
  it('the empty-state copy is not the words "coming soon" in any language', () => {
    for (const lang of LANGS) {
      for (const k of ['overviewChartEmpty', 'overviewStatusEmpty'] as const) {
        expect(strings[lang][k]).not.toMatch(/coming soon|bientôt|à venir|قريب/i);
      }
    }
  });
});
