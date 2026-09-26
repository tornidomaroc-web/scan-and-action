import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// THE BRAND IS NEVER TRANSLATED, AND THE PRICE READS IN THE PAGE'S LANGUAGE.
// ============================================================================
// Seen by the owner on 2026-09-26: the Arabic landing and the Login card
// named the app "المسح والإجراء", and the French catalog carried "Scanner et
// Agir". The brand is "Scan & Action" in every language: the catalog's
// `header` key is the brand, and no string anywhere may carry a translation
// of it.
//
// Same day: the Arabic landing's Pro card read "$9/mo" and "$59/yr" in
// English. The amount stays PLAN_CATALOG's own (the checkout's amount); the
// period is the paywall's localized suffix, so the landing reads as the
// checkout does: "$9/mois", "$9 شهرياً". Western digits throughout.
// ============================================================================

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { LandingScreen } from '../src/screens/LandingScreen';
import { PLAN_CATALOG } from '../src/lib/pricing';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];
const BRAND = 'Scan & Action';
// Every translation of the brand seen or plausible, so the scan fails on one
// coming back under any key.
const TRANSLATIONS = ['المسح والإجراء', 'المسح و الإجراء', 'امسح واعمل', 'Scanner et Agir', 'Scanner & Agir', 'Scan et Action', 'Numériser et Agir'];

let container: HTMLDivElement;
let root: Root;
function mount(lang: Lang) {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root.render(<LanguageProvider><MemoryRouter><LandingScreen /></MemoryRouter></LanguageProvider>));
}
beforeEach(() => { localStorage.clear(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { root?.unmount(); container?.remove(); vi.restoreAllMocks(); });

describe('the brand stays "Scan & Action"', () => {
  it('the brand key is the brand in every language', () => {
    for (const lang of LANGS) expect(strings[lang].header, lang).toBe(BRAND);
  });

  it('no string in any language carries a translation of the brand', () => {
    const offenders: string[] = [];
    for (const lang of LANGS) {
      for (const [k, v] of Object.entries(strings[lang] as Record<string, unknown>)) {
        if (typeof v === 'string' && TRANSLATIONS.some((t) => v.includes(t))) offenders.push(`${lang}.${k}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  for (const lang of LANGS) {
    it(`${lang}: the landing header and footer name the brand as it is`, () => {
      mount(lang);
      expect(container.querySelector('header a[href="/"]')!.textContent).toContain(BRAND);
      expect(container.querySelector('[data-landing-footer]')!.textContent).toContain(BRAND);
    });
  }

  it('the control: the scan sees a translation when one is there', () => {
    const planted = { header: 'المسح والإجراء' } as Record<string, string>;
    expect(Object.values(planted).some((v) => TRANSLATIONS.some((t) => v.includes(t)))).toBe(true);
  });
});

describe("the Pro price reads in the page's language, the amount unchanged", () => {
  for (const lang of LANGS) {
    it(`${lang}: the amount is the catalog's, the period is the paywall's own word, digits Western`, () => {
      mount(lang);
      const s = strings[lang];
      const pro = container.querySelector('[data-landing-plan="pro"]')!;
      const monthly = pro.querySelector('[data-landing-price]')!;
      expect(monthly.textContent).toBe(`${PLAN_CATALOG.monthly.fallbackFormatted}${s.paywallPerMonth}`);
      expect(monthly.querySelector('[dir="ltr"]')!.textContent).toBe(PLAN_CATALOG.monthly.fallbackFormatted);
      const yearly = pro.querySelector('[data-landing-price-yearly]')!;
      expect(yearly.textContent!.trim()).toBe(`${s.landingOrYearly} ${PLAN_CATALOG.yearly.fallbackFormatted}${s.paywallPerYear}`.trim());
      expect(pro.textContent).not.toMatch(/[٠-٩]/);
      if (lang !== 'en') {
        // The English periods are gone from a French or Arabic page.
        // Whole words: "/mois" contains "/mo" and is the French period.
        expect(pro.textContent).not.toMatch(/\/mo\b/);
        expect(pro.textContent).not.toMatch(/\/yr\b/);
      }
    });
  }

  it('the amounts did not move: $9 and $59, from the catalog', () => {
    expect(PLAN_CATALOG.monthly.fallbackFormatted).toBe('$9');
    expect(PLAN_CATALOG.yearly.fallbackFormatted).toBe('$59');
    for (const lang of LANGS) expect(strings[lang].landingFreePrice, lang).toBe('$0');
  });
});
