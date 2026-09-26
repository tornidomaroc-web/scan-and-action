import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// The landing page, redrawn on 2026-09-26 in the app's visual language, on
// the catalog in three languages. It replaced six suites that pinned the old
// page's specifics (its light pin, its literal copy, its grid and its
// contrast figures). This file holds what the redraw must keep and what the
// owner asked of it:
//
//   - every route and anchor the old page had, and no Paddle reach;
//   - the price copy is PLAN_CATALOG's own, so the page and the checkout
//     cannot drift (nativeAntiSteering.test.tsx guards the native side);
//   - every claim is a catalog string, in en, fr and ar, with Western digits,
//     and the page invents no count, rating, testimonial or logo;
//   - the header's contract: sticky on the chrome layer, the mark linking
//     home, both actions to /login, anchors hidden below sm;
//   - tokens only: no raw palette, and no light pin.
// ============================================================================

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { LandingScreen } from '../src/screens/LandingScreen';
import { PLAN_CATALOG } from '../src/lib/pricing';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];
const CWD = process.cwd();
const src = (rel: string) => readFileSync(join(CWD, 'src', rel), 'utf8');
/** Source with its comments removed: the comments NAME the things the code must not do. */
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const LANDING = code('screens/LandingScreen.tsx');
const HEADER = code('components/LandingHeader.tsx');

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
        <MemoryRouter initialEntries={['/']}>
          <LandingScreen />
        </MemoryRouter>
      </LanguageProvider>,
    );
  });
}
/** Every text node, space-separated: `textContent` glues adjacent elements
 *  ("12 Sep 2026" + "750.00" read as one number). */
const text = () => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push((n.textContent ?? '').trim());
  return parts.filter(Boolean).join(' ');
};
const hrefs = () => [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  root?.unmount();
  container?.remove();
  vi.restoreAllMocks();
});

describe('routes, anchors and the checkout', () => {
  it('keeps every link the old page had: /login four times, the three legal routes, the two anchors', () => {
    mount();
    const h = hrefs();
    expect(h.filter((x) => x === '/login').length).toBeGreaterThanOrEqual(4);
    for (const r of ['/terms', '/privacy', '/refund', '#how-it-works', '#pricing', '/']) expect(h, r).toContain(r);
    expect(container.querySelector('#how-it-works')).not.toBeNull();
    expect(container.querySelector('#pricing')).not.toBeNull();
    for (const id of ['how-it-works', 'pricing']) expect(container.querySelector(`#${id}`)!.className).toMatch(/scroll-mt-/);
  });

  it('never reaches Paddle or a checkout: the page links to /login, as before', () => {
    expect(LANDING).not.toMatch(/paddle|checkout|PaywallModal|PricePreview/i);
    expect(LANDING).not.toContain('signInWithOAuth');
  });

  it('the price copy is the catalog\'s own, unchanged', () => {
    mount();
    const pro = container.querySelector('[data-landing-plan="pro"]')!;
    expect(pro.querySelector('[data-landing-price]')!.textContent).toBe(`${PLAN_CATALOG.monthly.fallbackFormatted}${PLAN_CATALOG.monthly.periodSuffix}`);
    expect(pro.textContent).toContain(`${PLAN_CATALOG.yearly.fallbackFormatted}${PLAN_CATALOG.yearly.periodSuffix}`);
    expect(PLAN_CATALOG.monthly.fallbackFormatted).toBe('$9');
    expect(PLAN_CATALOG.yearly.fallbackFormatted).toBe('$59');
    expect(LANDING).not.toMatch(/\$\s*\d/);
  });
});

describe('the claims', () => {
  it('invents no count, rating, testimonial or logo', () => {
    mount();
    expect(text()).not.toMatch(/\d[\d,]*\+/);
    const proof = text().match(/\b(users|customers|businesses|reviews|rating|stars|trusted by|award)\b/i);
    expect(proof, `social-proof vocabulary on the page: ${proof?.[0]}`).toBeNull();
    expect(LANDING).not.toMatch(/(testimonial|quote|logo-?wall)/i);
  });

  it('the only digits are the witnessed ones: the 10 free scans, the catalog prices, the step numbers, and the owner\'s two figures', () => {
    mount();
    const digits = (text().match(/\d[\d,.]*/g) ?? []).map((d) => d.replace(/[.,]$/, ''));
    const allowed = new Set(['10', '0', '9', '59', '1', '2', '3', '5', '12', '2026', '750.00', '2,989.92', '1,263.85']);
    expect([...new Set(digits)].filter((d) => !allowed.has(d))).toEqual([]);
  });

  for (const lang of LANGS) {
    it(`${lang}: every line is the catalog's, the direction is right, and the digits are Western`, () => {
      mount(lang);
      const s = strings[lang];
      expect(document.documentElement.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
      for (const key of ['landingHero1', 'landingHero2', 'landingHeroSub', 'landingHeroCta', 'landingDoesTitle', 'landingHowTitle', 'landingMoneyTitle', 'landingMoneyBody', 'landingPricingTitle', 'landingFreeName', 'landingProName', 'landingClosingTitle', 'landingFooterTerms', 'landingFooterPrivacy', 'landingFooterRefund', 'landingLogIn', 'landingStartFree'] as const) {
        expect(text(), key).toContain(s[key]);
      }
      expect(text()).not.toMatch(/[٠-٩]/);
      if (lang !== 'en') expect(text()).not.toContain(strings.en.landingHeroSub);
    });
  }
});

describe('the header keeps its contract', () => {
  it('a sticky header on the chrome layer, the mark linking home, both actions to /login, anchors hidden below sm', () => {
    mount();
    const header = container.querySelector('header')!;
    for (const c of ['sticky', 'top-0', 'z-chrome']) expect(header.className).toContain(c);
    const logo = header.querySelector('a')!;
    expect(logo.getAttribute('href')).toBe('/');
    expect(logo.getAttribute('aria-label')).toMatch(/home/i);
    expect(logo.querySelector('svg')).not.toBeNull();
    const actions = [...header.querySelectorAll('a[href="/login"]')];
    expect(actions).toHaveLength(2);
    expect(actions[1].className).toContain('bg-ink');
    expect(actions[1].className).toContain('text-surface-raised');
    expect(header.querySelector('nav')!.className).toContain('hidden');
    expect(header.querySelector('nav')!.className).toContain('sm:flex');
  });
});

describe('tokens only, both themes, no pin', () => {
  const PALETTE = /\b(?:bg|text|border|ring|shadow)-(?:white|black|slate|gray|zinc|blue|indigo|emerald|green|amber|yellow|red|rose)(?:-\d{2,3}|\b)/;
  it('the page and the header carry no raw palette utility and no light pin', () => {
    for (const [name, body] of [['LandingScreen', LANDING], ['LandingHeader', HEADER]] as const) {
      expect(body.match(new RegExp(PALETTE.source, 'g')) ?? [], name).toEqual([]);
      expect(body, name).not.toContain('sa-pin-light');
      expect(body, name).not.toContain('dark:');
    }
    expect(src('styles/tokens.css')).not.toContain('.sa-pin-light {');
  });
  it('the control: the palette scan sees a literal', () => {
    expect(PALETTE.test('className="bg-slate-50 text-white"')).toBe(true);
    expect(PALETTE.test('className="bg-surface text-ink"')).toBe(false);
  });
});
