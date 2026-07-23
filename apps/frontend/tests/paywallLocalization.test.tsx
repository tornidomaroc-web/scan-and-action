import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';

// ============================================================================
// PAYWALL LOCALIZATION (AR + FR) — correctness locked by CODEPOINT, not by sight.
// ============================================================================
// An Arabic string looks right in a terminal that reverses it and looks right in
// a browser that fixes it, while carrying a wrong letter, a smuggled bidi control
// char, or an English fallback. So the Arabic contract here is asserted on the
// exact code points, never on how the glyphs render. The layout mirroring (RTL)
// and the bidi price flow are explicitly NOT covered here — those are the live
// iPhone sign-off; see the PR description.
//
// Four contracts:
//   1. Every AR paywall key equals its approved code points, exactly.
//   2. formatPercent shapes the savings percent (Intl), it is not hand-built.
//   3. Under lang=ar, NO hardcoded English paywall copy renders, and the AR copy
//      that should be there IS there (a missing key renders empty, not English —
//      so this asserts BOTH directions).
//   4. Paddle's formattedTotals passes through VERBATIM in every locale — the
//      amount is never re-formatted here (that reintroduces the #115 drift).
// ============================================================================

const h = vi.hoisted(() => ({
  checkoutOpen: vi.fn(),
  pricePreview: vi.fn(),
}));

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'buyer@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));
vi.mock('../src/lib/paddle', () => ({
  getPaddle: vi.fn().mockResolvedValue({
    Checkout: { open: h.checkoutOpen },
    PricePreview: h.pricePreview,
  }),
  PaddleNotConfiguredError: class PaddleNotConfiguredError extends Error {},
}));
// WEB paywall path (the native branch has no price/checkout — it is covered by
// nativeAntiSteering.test.tsx).
vi.mock('../src/native/shell', () => ({ isNativePlatform: () => false }));
vi.mock('../src/native/useBackDismiss', () => ({ useBackDismiss: () => {} }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { PLAN_CATALOG } from '../src/lib/pricing';
import { formatPercent } from '../src/lib/formatNumber';

type Lang = 'en' | 'fr' | 'ar';

// ── The approved Arabic, as CODE POINTS. Deliberately independent of strings.ts:
// derived from Abo Jad's finals, not read back from the file (reading the file
// would make the test tautological). A single wrong letter, a dropped shadda, or
// a smuggled bidi mark fails the exact-equality check below.
const AR_EXPECTED: Record<string, number[]> = {
  paywallTitle: [0x0627,0x0644,0x062a,0x0631,0x0642,0x064a,0x0629,0x0020,0x0625,0x0644,0x0649,0x0020,0x0050,0x0052,0x004f],
  paywallBody: [0x0623,0x0637,0x0644,0x0642,0x0020,0x0627,0x0644,0x0639,0x0646,0x0627,0x0646,0x0020,0x0644,0x0643,0x0627,0x0645,0x0644,0x0020,0x0642,0x0648,0x0629,0x0020,0x0053,0x0063,0x0061,0x006e,0x0020,0x0026,0x0020,0x0041,0x0063,0x0074,0x0069,0x006f,0x006e,0x002e,0x0020,0x062a,0x0645,0x0646,0x062d,0x0643,0x0020,0x0050,0x0052,0x004f,0x0020,0x0623,0x0641,0x0636,0x0644,0x0020,0x0633,0x064a,0x0631,0x0020,0x0639,0x0645,0x0644,0x0020,0x0644,0x0625,0x0646,0x062a,0x0627,0x062c,0x064a,0x0629,0x0020,0x0623,0x0639,0x0644,0x0649,0x002e],
  paywallChoosePlan: [0x0627,0x062e,0x062a,0x0631,0x0020,0x062e,0x0637,0x062a,0x0643],
  paywallMonthly: [0x0634,0x0647,0x0631,0x064a],
  paywallYearly: [0x0633,0x0646,0x0648,0x064a],
  paywallSave: [0x0648,0x0641,0x0651,0x0631,0x0020,0x007b,0x0070,0x007d],
  paywallBestValue: [0x0623,0x0641,0x0636,0x0644,0x0020,0x0642,0x064a,0x0645,0x0629],
  paywallFeatureUnlimited: [0x0645,0x0633,0x062d,0x0020,0x063a,0x064a,0x0631,0x0020,0x0645,0x062d,0x062f,0x0648,0x062f,0x0020,0x0644,0x0644,0x0645,0x0633,0x062a,0x0646,0x062f,0x0627,0x062a],
  paywallFeatureBatch: [0x0631,0x0641,0x0639,0x0020,0x0639,0x062f,0x0651,0x0629,0x0020,0x0645,0x0644,0x0641,0x0627,0x062a,0x0020,0x062f,0x0641,0x0639,0x0629,0x0020,0x0648,0x0627,0x062d,0x062f,0x0629],
  paywallFeatureFaster: [0x0645,0x0639,0x0627,0x0644,0x062c,0x0629,0x0020,0x0623,0x0633,0x0631,0x0639],
  paywallFeatureExport: [0x062a,0x0635,0x062f,0x064a,0x0631,0x0020,0x0628,0x064a,0x0627,0x0646,0x0627,0x062a,0x0643,0x0020,0x0028,0x0043,0x0053,0x0056,0x0029],
  paywallOpening: [0x062c,0x0627,0x0631,0x064d,0x0020,0x0641,0x062a,0x062d,0x0020,0x0627,0x0644,0x062f,0x0641,0x0639,0x2026],
  // Separator note: Abo Jad's draft had an em dash before {price}; dropped (banned
  // house rule + bidi hazard) for a plain space — the price is <bdi>-isolated instead.
  paywallCta: [0x0627,0x0644,0x062a,0x0631,0x0642,0x064a,0x0629,0x0020,0x0627,0x0644,0x0622,0x0646,0x0020,0x007b,0x0070,0x0072,0x0069,0x0063,0x0065,0x007d],
  paywallMaybeLater: [0x0631,0x0628,0x0645,0x0627,0x0020,0x0644,0x0627,0x062d,0x0642,0x0627,0x064b],
  paywallErrorSignIn: [0x064a,0x0631,0x062c,0x0649,0x0020,0x062a,0x0633,0x062c,0x064a,0x0644,0x0020,0x0627,0x0644,0x062f,0x062e,0x0648,0x0644,0x0020,0x0645,0x062c,0x062f,0x062f,0x0627,0x064b,0x0020,0x0644,0x0644,0x062a,0x0631,0x0642,0x064a,0x0629,0x002e],
  paywallErrorUnavailable: [0x0627,0x0644,0x062f,0x0641,0x0639,0x0020,0x063a,0x064a,0x0631,0x0020,0x0645,0x062a,0x0627,0x062d,0x0020,0x062d,0x0627,0x0644,0x064a,0x0627,0x064b,0x002e,0x0020,0x064a,0x0631,0x062c,0x0649,0x0020,0x0627,0x0644,0x062a,0x0648,0x0627,0x0635,0x0644,0x0020,0x0645,0x0639,0x0020,0x0627,0x0644,0x062f,0x0639,0x0645,0x002e],
  paywallErrorEnv: [0x0627,0x0644,0x062f,0x0641,0x0639,0x0020,0x063a,0x064a,0x0631,0x0020,0x0645,0x062a,0x0627,0x062d,0x0020,0x0641,0x064a,0x0020,0x0647,0x0630,0x0647,0x0020,0x0627,0x0644,0x0628,0x064a,0x0626,0x0629,0x002e],
  paywallErrorOpen: [0x062a,0x0639,0x0630,0x0651,0x0631,0x0020,0x0641,0x062a,0x062d,0x0020,0x0627,0x0644,0x062f,0x0641,0x0639,0x002e,0x0020,0x062a,0x062d,0x0642,0x0651,0x0642,0x0020,0x0645,0x0646,0x0020,0x0627,0x062a,0x0635,0x0627,0x0644,0x0643,0x0020,0x0648,0x062d,0x0627,0x0648,0x0644,0x0020,0x0645,0x0631,0x0629,0x0020,0x0623,0x062e,0x0631,0x0649,0x002e],
  paywallPerMonth: [0x0020,0x0634,0x0647,0x0631,0x064a,0x0627,0x064b],
  paywallPerYear: [0x0020,0x0633,0x0646,0x0648,0x064a,0x0627,0x064b],
};

const cps = (s: string) => [...s].map((c) => c.codePointAt(0)!);

// ────────────────────────────────────────────────────────────────────────────
// 1. AR catalog — code-point exact.
// ────────────────────────────────────────────────────────────────────────────
describe('AR paywall catalog — code-point exact (never trust the terminal)', () => {
  for (const [key, expected] of Object.entries(AR_EXPECTED)) {
    it(`strings.ar.${key} matches the approved code points exactly`, () => {
      expect(strings.ar[key as keyof typeof strings.ar]).toBeTypeOf('string');
      expect(cps(strings.ar[key as keyof typeof strings.ar] as string)).toEqual(expected);
    });
  }

  it('carries NO hidden bidi / zero-width control characters (RLM, LRM, isolates, BOM)', () => {
    const isCtrl = (p: number) =>
      (p >= 0x200b && p <= 0x200f) || (p >= 0x202a && p <= 0x202e) || (p >= 0x2066 && p <= 0x2069) || p === 0xfeff;
    for (const key of Object.keys(AR_EXPECTED)) {
      const bad = cps(strings.ar[key as keyof typeof strings.ar] as string).filter(isCtrl);
      expect(bad, `${key} smuggled a hidden control char`).toEqual([]);
    }
  });

  it('placeholders survive translation: {p} in Save, {price} in the CTA', () => {
    expect(strings.ar.paywallSave).toContain('{p}');
    expect(strings.ar.paywallCta).toContain('{price}');
    expect(strings.fr.paywallSave).toContain('{p}');
    expect(strings.fr.paywallCta).toContain('{price}');
    expect(strings.en.paywallSave).toContain('{p}');
    expect(strings.en.paywallCta).toContain('{price}');
  });

  it('AR period suffix is the adverbial form (leading space + word), NOT a slash', () => {
    // The slash glued to a Latin numeral is the single worst direction-breaker on
    // an RTL line — Abo Jad chose شهرياً / سنوياً precisely to avoid it.
    expect(strings.ar.paywallPerMonth).not.toContain('/');
    expect(strings.ar.paywallPerYear).not.toContain('/');
    expect(strings.ar.paywallPerMonth.startsWith(' ')).toBe(true);
    expect(strings.ar.paywallPerYear.startsWith(' ')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. formatPercent shapes the savings %, exact code points (FR), house rule (AR).
// ────────────────────────────────────────────────────────────────────────────
describe('savings percent — formatted by Intl, not hand-built', () => {
  it('FR: exactly [4][5][no-break space][%] — never a plain space, never "45%"', () => {
    const out = formatPercent(0.45, 'fr');
    const p = cps(out);
    expect(p.length).toBe(4);
    expect(p[0]).toBe(0x34); // '4'
    expect(p[1]).toBe(0x35); // '5'
    // The exact no-break space is ICU-version dependent (U+00A0 vs U+202F across
    // Node/ICU releases). BOTH are correct French typography; a plain U+0020 or a
    // missing space is the actual regression. So we pin the shape, accept either
    // no-break variant, and explicitly reject the wrong ones. Pinning one exact
    // code point here would make the test flaky between local Node and CI Node.
    expect([0x00a0, 0x202f]).toContain(p[2]);
    expect(p[3]).toBe(0x25); // '%'
    expect(out).not.toBe('45%'); // no space at all
    expect(out).not.toBe('45 %'); // plain ASCII space
  });

  it('AR: Latin digits per the house rule, never Arabic-Indic ٠-٩', () => {
    const out = formatPercent(0.45, 'ar');
    expect(out).toContain('45'); // Latin 4,5
    expect(out).not.toMatch(/[٠-٩]/); // no Eastern-Arabic digits
    // NOTE: Intl wraps the AR percent in U+200E LRM marks — that is Intl doing
    // correct bidi isolation, so we do NOT assert "no control chars" on Intl
    // output (only on the authored catalog strings, in group 1).
  });

  it('EN: "45%" plain (the value the existing #115 pricing test asserts)', () => {
    expect(formatPercent(0.45, 'en')).toBe('45%');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Render harness for the web paywall.
// ────────────────────────────────────────────────────────────────────────────
let container: HTMLDivElement;
let root: Root;

function pricePreviewResponse() {
  // Reverse request order + non-USD currency, exactly like paywallCheckoutGuard:
  // the component must match by price id, and must render Paddle's own string.
  return {
    data: {
      currencyCode: 'MAD',
      details: {
        lineItems: [
          { price: { id: PLAN_CATALOG.yearly.priceId }, formattedTotals: { total: 'MAD 590.00' }, totals: { total: '59000' } },
          { price: { id: PLAN_CATALOG.monthly.priceId }, formattedTotals: { total: 'MAD 90.00' }, totals: { total: '9000' } },
        ],
      },
    },
    meta: { requestId: 'req_test' },
  };
}

async function mountPaywall(lang: Lang) {
  localStorage.setItem('lang', lang);
  const { PaywallModal } = await import('../src/components/PaywallModal');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <PaywallModal isOpen onClose={() => {}} />
      </LanguageProvider>
    );
  });
}

async function settlePreview() {
  await vi.waitFor(() => expect(document.body.textContent).toContain('MAD 90.00'));
}

function cleanup() {
  root.unmount();
  container.remove();
  document.body.innerHTML = ''; // the modal portals into document.body
}

// ────────────────────────────────────────────────────────────────────────────
// 3. No hardcoded English under lang=ar — and the AR copy IS present.
// ────────────────────────────────────────────────────────────────────────────
describe('under lang=ar, the web paywall renders NO hardcoded English', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    h.pricePreview.mockResolvedValue(pricePreviewResponse());
  });
  afterEach(cleanup);

  it('none of the English paywall literals leak, and none of the AR strings are missing', async () => {
    await mountPaywall('ar');
    await settlePreview();
    const text = document.body.textContent ?? '';

    // (a) English absent. These are the exact EN catalog values (mirrors
    // nativeAntiSteering's forbidden-copy approach). A hardcoded-English
    // regression, or a key wired to the wrong locale, trips here.
    const FORBIDDEN_EN = [
      strings.en.paywallTitle,           // 'Upgrade to PRO'
      strings.en.paywallChoosePlan,      // 'Choose your plan'
      strings.en.paywallMonthly,         // 'Monthly'
      strings.en.paywallYearly,          // 'Yearly'
      strings.en.paywallBestValue,       // 'Best Value'
      strings.en.paywallMaybeLater,      // 'Maybe later'
      strings.en.paywallFeatureUnlimited,
      strings.en.paywallFeatureBatch,
      strings.en.paywallFeatureFaster,
      strings.en.paywallFeatureExport,
      'Upgrade Now',                     // CTA prefix
    ];
    for (const en of FORBIDDEN_EN) {
      expect(text, `English leaked under lang=ar: "${en}"`).not.toContain(en);
    }
    // The English slash-suffix must not leak — AR uses the adverbial form. This is
    // the assertion that bites if periodSuffix fell back to the catalog '/mo'.
    expect(text, 'English "/mo" or "/yr" suffix leaked under lang=ar').not.toMatch(/\/(mo|yr)\b/);

    // (b) AR present. A MISSING key renders empty (not English), so (a) alone
    // would pass vacuously — this half makes the guard bite both ways.
    const MUST_APPEAR = [
      'paywallTitle', 'paywallChoosePlan', 'paywallMonthly', 'paywallYearly',
      'paywallBestValue', 'paywallMaybeLater', 'paywallFeatureUnlimited',
      'paywallFeatureBatch', 'paywallFeatureFaster', 'paywallFeatureExport',
    ] as const;
    for (const key of MUST_APPEAR) {
      expect(text, `AR string missing from render: ${key}`).toContain(strings.ar[key]);
    }
    // The CTA prefix (before the price) is Arabic on screen.
    expect(text).toContain(strings.ar.paywallCta.split('{price}')[0].trim());
  });

  it('the savings badge renders the Arabic word + an Intl percent (وفّر …%)', async () => {
    await mountPaywall('ar');
    await settlePreview();
    const text = document.body.textContent ?? '';
    // 9000×12=108000 vs 59000 ⇒ 45%. The word is ours (translated), the % is Intl's.
    expect(text).toContain('وفّر');
    expect(text).toContain('45');
    expect(text).not.toContain('Save');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Paddle formattedTotals — rendered VERBATIM in every locale (no #115 drift).
// ────────────────────────────────────────────────────────────────────────────
describe('Paddle price passthrough — formattedTotals is rendered verbatim, never re-formatted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    h.pricePreview.mockResolvedValue(pricePreviewResponse());
  });
  afterEach(cleanup);

  for (const lang of ['en', 'fr', 'ar'] as const) {
    it(`${lang.toUpperCase()}: both totals appear exactly as Paddle formatted them, bound to the right tile`, async () => {
      await mountPaywall(lang);
      await settlePreview();

      const text = document.body.textContent ?? '';
      // Verbatim: the exact strings Paddle returned, in a currency the app never
      // chose. Re-formatting (localizing the amount ourselves) is what #115 killed.
      expect(text).toContain('MAD 90.00');
      expect(text).toContain('MAD 590.00');
      // Not touched by our number formatter: no digit substitution, even in AR.
      expect(text).not.toMatch(/[٠-٩]/); // Eastern-Arabic digits
      expect(text).not.toContain('MAD 9,0'); // no re-grouping of the amount

      // Per-tile, locale-agnostically: the two plan buttons live in the price grid,
      // in DOM order [monthly, yearly]. A component that matched Paddle line items
      // by array position (they come back reversed) would swap these.
      const tiles = [...document.body.querySelectorAll('.grid-cols-2 button')];
      expect(tiles).toHaveLength(2);
      expect(tiles[0].textContent).toContain('MAD 90.00'); // monthly
      expect(tiles[0].textContent).not.toContain('MAD 590.00');
      expect(tiles[1].textContent).toContain('MAD 590.00'); // yearly
      expect(tiles[1].textContent).not.toContain('MAD 90.00');
    });
  }
});
