import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// The landing page, redrawn on 2026-09-26 in the app's visual language, on
// the catalog in three languages, and rebuilt the same day on the structure
// of the Vantro landing (a floating pill nav, a centred hero with a badge, a
// large product mockup, three "why" cards with previews, a tab list beside a
// live preview with dots). It replaced six suites that pinned the old page's
// specifics (its light pin, its literal copy, its grid and its contrast
// figures). This file holds what the redraw must keep and what the owner
// asked of it:
//
//   - every route and anchor the old page had, and no Paddle reach;
//   - the price copy is PLAN_CATALOG's own, so the page and the checkout
//     cannot drift (nativeAntiSteering.test.tsx guards the native side);
//   - every claim is a catalog string, in en, fr and ar, with Western digits,
//     and the page invents no count, rating, testimonial or logo;
//   - the header's contract: a sticky floating pill on the chrome layer, the
//     mark linking home, both actions to /login, anchors hidden below sm;
//   - the price written once each, and the mockups marked as an example;
//   - tokens only: no raw palette, and no light pin.
// ============================================================================

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { LandingScreen } from '../src/screens/LandingScreen';
import { PLAN_CATALOG } from '../src/lib/pricing';
import { fullDayLabel } from '../src/lib/ledgerView';

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

  it('the price copy is the catalog\'s own, unchanged, and each price is written once', () => {
    mount();
    const pro = container.querySelector('[data-landing-plan="pro"]')!;
    const monthly = `${PLAN_CATALOG.monthly.fallbackFormatted}${PLAN_CATALOG.monthly.periodSuffix}`;
    const yearlyPrice = `${PLAN_CATALOG.yearly.fallbackFormatted}${PLAN_CATALOG.yearly.periodSuffix}`;
    expect(pro.querySelector('[data-landing-price]')!.textContent).toBe(monthly);
    // "$9/mo per month" and "$59/yr per year" said each period twice (the
    // owner, 2026-09-26): the suffix is the period, so nothing follows it.
    const yearlyLine = pro.querySelector('[data-landing-price-yearly]')!.textContent!.trim();
    expect(yearlyLine).toBe(`${strings.en.landingOrYearly} ${yearlyPrice}`);
    expect(pro.textContent).not.toMatch(/\/mo\s*per month|\/yr\s*per year/);
    expect(pro.textContent!.split(monthly).length - 1).toBe(1);
    expect(pro.textContent!.split(yearlyPrice).length - 1).toBe(1);
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

  it('the only digits are the witnessed ones: the 10 free scans, the catalog prices, and the labelled example', () => {
    mount();
    const digits = (text().match(/\d[\d,.]*/g) ?? []).map((d) => d.replace(/[.,]$/, ''));
    // 7 and 2026: the example receipt's date; 5 and 3: its receipt counts.
    const allowed = new Set(['10', '0', '9', '59', '3', '5', '7', '2026', '750.00', '2,989.92', '1,263.85']);
    expect([...new Set(digits)].filter((d) => !allowed.has(d))).toEqual([]);
  });

  it('the mockups are the app\'s screens and say they are an example', () => {
    mount();
    for (const m of ['ledger', 'queue', 'search']) {
      if (m !== 'ledger') flushSync(() => { container.querySelector<HTMLButtonElement>(`[data-landing-tab="${m}"]`)!.click(); });
      const panel = container.querySelector(`[data-landing-tool-panel="${m}"]`)!;
      expect(panel.querySelector(`[data-landing-mock="${m}"]`), m).not.toBeNull();
      expect(panel.textContent, m).toContain(strings.en.landingSample);
    }
    expect(container.querySelector('[data-landing-showcase] [data-landing-mock="ledger"]')!.textContent).toContain(strings.en.landingSample);
    // The example receipt reads the date the app reads for it (2026-09-07).
    expect(text()).toContain(fullDayLabel('2026-09-07T00:00:00Z', 'en'));
    expect(text()).not.toContain(fullDayLabel('2026-09-12T00:00:00Z', 'en'));
  });

  for (const lang of LANGS) {
    it(`${lang}: every line is the catalog's, the direction is right, and the digits are Western`, () => {
      mount(lang);
      const s = strings[lang];
      expect(document.documentElement.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
      for (const key of ['landingBadge', 'landingHero1', 'landingHero2', 'landingHeroSub', 'landingHeroCta', 'landingHeroNote', 'landingWhyTitle', 'landingScanTitle', 'landingReadTitle', 'landingReviewTitle', 'landingToolsTitle', 'landingToolLedger', 'landingToolQueue', 'landingToolSearch', 'landingMoneyTitle', 'landingMoneyBody', 'landingPricingTitle', 'landingFreeName', 'landingProName', 'landingClosingTitle', 'landingFooterTerms', 'landingFooterPrivacy', 'landingFooterRefund', 'landingLogIn', 'landingStartFree', 'landingSample'] as const) {
        expect(text(), key).toContain(s[key]);
      }
      expect(text()).not.toMatch(/[٠-٩]/);
      if (lang !== 'en') expect(text()).not.toContain(strings.en.landingHeroSub);
    });
  }
});

describe('the header keeps its contract', () => {
  it('a sticky floating pill on the chrome layer, the mark linking home, both actions to /login, anchors hidden below sm', () => {
    mount();
    const header = container.querySelector('header')!;
    for (const c of ['sticky', 'top-0', 'z-chrome']) expect(header.className).toContain(c);
    expect(header.firstElementChild!.className).toContain('rounded-pill');
    expect(header.firstElementChild!.className).toContain('shadow-raised');
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

describe('the screens section', () => {
  it('a tab list beside one live preview, with a dot per screen, and the ledger first', () => {
    mount();
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.getAttribute('data-landing-tab'))).toEqual(['ledger', 'queue', 'search']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-landing-dots] button')).toHaveLength(3);
    flushSync(() => { (tabs[1] as HTMLButtonElement).click(); });
    expect(container.querySelector('[role="tabpanel"]')!.getAttribute('data-landing-tool-panel')).toBe('queue');
    expect(container.querySelector('[data-landing-mock="queue"]')!.textContent).toContain(strings.en.approve);
    expect(container.querySelector('[data-landing-mock="queue"]')!.textContent).toContain(strings.en.searchReasonDuplicate);
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
