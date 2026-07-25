import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// SCAN / UPLOAD COMPLETION SURFACE (AR + FR) — item #7 PR 1.
// ============================================================================
// Same discipline as paywallLocalization.test.tsx: the Arabic contract is
// asserted on exact CODE POINTS, never on how a terminal renders the glyphs
// (it reverses them and can hide a wrong letter, a smuggled bidi control, or an
// English fallback). The expected arrays below are derived independently from
// Abo Jad's approved finals — NOT read back from strings.ts, which would make
// the check tautological.
//
// Scope locked here: ProcessingContext per-scan toasts, CaptureSheet +
// UploadModal upload copy, and the SettingsScreen FREE-card bullets (reused
// from the #118 paywall keys). Recon: docs/AR_ENGLISH_LEAKS_RECON_2026-07-23.md.
// ============================================================================

// ── Approved Arabic, as CODE POINTS (independent of strings.ts). ────────────
const AR_EXPECTED: Record<string, number[]> = {
  scanProcessed: [1578,1605,1578,32,1605,1593,1575,1604,1580,1577,32,1575,1604,1605,1587,1578,1606,1583,32,1576,1606,1580,1575,1581],
  scanNeedsReview: [1575,1604,1605,1587,1578,1606,1583,32,1576,1581,1575,1580,1577,32,1573,1604,1609,32,1605,1585,1575,1580,1593,1577],
  scanFailed: [1578,1593,1584,1617,1585,1578,32,1605,1593,1575,1604,1580,1577,32,1575,1604,1605,1587,1578,1606,1583],
  uploadedProcessing: [1578,1605,32,1575,1604,1585,1601,1593,46,32,1575,1604,1605,1593,1575,1604,1580,1577,32,1580,1575,1585,1610,1577,32,1601,1610,32,1575,1604,1582,1604,1601,1610,1577,8230],
  uploadedPartialResult: [1575,1603,1578,1605,1604,32,1585,1601,1593,32,1576,1593,1590,32,1575,1604,1605,1587,1578,1606,1583,1575,1578,32,1608,1601,1588,1604,32,1576,1593,1590,1607,1575,46],
  batchInterrupted: [1578,1608,1602,1601,1578,32,1605,1593,1575,1604,1580,1577,32,1575,1604,1583,1601,1593,1577,46],
  verifyingAccount: [1580,1575,1585,1613,32,1575,1604,1578,1581,1602,1602,32,1605,1606,32,1581,1575,1604,1577,32,1575,1604,1581,1587,1575,1576,8230],
  duplicatesIgnored: [1578,1605,32,1578,1580,1575,1607,1604,32,1575,1604,1605,1604,1601,1575,1578,32,1575,1604,1605,1603,1585,1585,1577],
  uploadPartial: [1606,1580,1575,1581,32,1580,1586,1574,1610],
  uploadSubtitleIdle: [1575,1582,1578,1585,32,1605,1604,1601,1617,1575,1611,32,1571,1608,32,1571,1603,1579,1585,32,1604,1604,1575,1587,1578,1582,1585,1575,1580],
  uploadSubtitleSuccess: [1578,1605,32,1575,1604,1585,1601,1593,46,32,1610,1587,1578,1605,1585,32,1575,1604,1575,1587,1578,1582,1585,1575,1580,32,1601,1610,32,1575,1604,1582,1604,1601,1610,1577,46,32,1610,1605,1603,1606,1603,32,1573,1594,1604,1575,1602,32,1607,1584,1607,32,1575,1604,1606,1575,1601,1584,1577,46],
  uploadSubtitleReview: [1610,1585,1580,1609,32,1605,1585,1575,1580,1593,1577,32,1581,1575,1604,1577,32,1593,1606,1575,1589,1585,1603,32,1571,1583,1606,1575,1607,46],
  uploadedTitle: [1578,1605,32,1575,1604,1585,1601,1593],
  uploadBackgroundNote: [1578,1605,32,1575,1604,1585,1601,1593,46,32,1610,1587,1578,1605,1585,32,1575,1604,1575,1587,1578,1582,1585,1575,1580,32,1601,1610,32,1575,1604,1582,1604,1601,1610,1577,46,32,1578,1575,1576,1593,1607,32,1605,1606,32,1605,1572,1588,1617,1585,32,1575,1604,1605,1593,1575,1604,1580,1577,46],
  done: [1578,1605],
  manageFiles: [1573,1583,1575,1585,1577,32,1575,1604,1605,1604,1601,1575,1578],
  close: [1573,1594,1604,1575,1602],
  cancel: [1573,1604,1594,1575,1569],
  startExtraction: [1576,1583,1569,32,1575,1604,1575,1587,1578,1582,1585,1575,1580,32,40,123,110,125,41],
};

// Mock the native gate BEFORE importing anything that reads it: the FREE-card
// bullets live in the WEB (non-native) branch of SettingsScreen.
vi.mock('../src/native/shell', () => ({ isNativePlatform: () => false }));
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'buyer@example.com' }, signOut: async () => {} }),
}));
// Closed modals are irrelevant to this screen's copy; keep them inert so the
// test isolates SettingsScreen's own text (and never touches Paddle).
vi.mock('../src/components/PaywallModal', () => ({ PaywallModal: () => null }));
vi.mock('../src/components/DeleteAccountModal', () => ({ DeleteAccountModal: () => null }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const cps = (s: string) => [...s].map((c) => c.codePointAt(0)!);

// ────────────────────────────────────────────────────────────────────────────
// 1. AR catalog — code-point exact for every NEW key.
// ────────────────────────────────────────────────────────────────────────────
describe('AR scan/upload catalog — code-point exact (never trust the terminal)', () => {
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

  it('every NEW key exists in all three locales (no missing-locale renders-empty)', () => {
    for (const key of Object.keys(AR_EXPECTED)) {
      for (const lang of ['en', 'fr', 'ar'] as const) {
        const v = strings[lang][key as keyof (typeof strings)['en']];
        expect(typeof v === 'string' && (v as string).length > 0, `${lang}.${key} missing`).toBe(true);
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. No interpolated filename reaches the per-scan toasts (ruling D1).
// ────────────────────────────────────────────────────────────────────────────
describe('per-scan completion toasts are filename-free (D1 — no Latin spliced into Arabic)', () => {
  for (const key of ['scanProcessed', 'scanNeedsReview', 'scanFailed'] as const) {
    for (const lang of ['en', 'fr', 'ar'] as const) {
      it(`${lang}.${key} contains no interpolation placeholder`, () => {
        // A '{' would mean a slot like {name}/{n} survived — the exact bidi
        // hazard D1 removed. These toasts must be static, generic sentences.
        expect(strings[lang][key]).not.toContain('{');
      });
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Placeholder survives ONLY where a count is intended: Start Extraction ({n}).
// ────────────────────────────────────────────────────────────────────────────
describe('count placeholder survives translation: {n} in startExtraction', () => {
  for (const lang of ['en', 'fr', 'ar'] as const) {
    it(`${lang}.startExtraction keeps the {n} slot`, () => {
      expect(strings[lang].startExtraction).toContain('{n}');
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 4. SettingsScreen FREE card renders the REUSED AR keys, English literals gone.
// ────────────────────────────────────────────────────────────────────────────
let container: HTMLDivElement;
let root: Root;

async function mountSettings(lang: 'en' | 'fr' | 'ar') {
  localStorage.setItem('lang', lang);
  const { SettingsScreen } = await import('../src/screens/SettingsScreen');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <MemoryRouter>
          <SettingsScreen />
        </MemoryRouter>
      </LanguageProvider>
    );
  });
}

function cleanup() {
  root.unmount();
  container.remove();
  document.body.innerHTML = '';
}

describe('SettingsScreen FREE card — reused paywall bullets, no hardcoded English', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });
  afterEach(cleanup);

  it('under lang=ar, renders the reused AR feature strings and NONE of the old English literals', async () => {
    await mountSettings('ar');
    const text = document.body.textContent ?? '';

    // (a) The three old hardcoded English bullets are gone.
    for (const gone of [
      'Unlimited document scans',
      'High-volume batch uploads',
      'Faster processing workflow',
    ]) {
      expect(text, `old English bullet still present: "${gone}"`).not.toContain(gone);
    }

    // (b) The reused #118 keys render their approved Arabic (one canonical copy).
    expect(text).toContain(strings.ar.paywallFeatureUnlimited);
    expect(text).toContain(strings.ar.paywallFeatureBatch);
    expect(text).toContain(strings.ar.paywallFeatureFaster);
  });

  it('under lang=en, the bullets show the canonical paywall wording (not the old copy)', async () => {
    await mountSettings('en');
    const text = document.body.textContent ?? '';
    // Reuse means the EN card now reads the canonical phrasing; the pre-#7
    // "High-volume batch uploads" wording is intentionally retired.
    expect(text).toContain(strings.en.paywallFeatureUnlimited);
    expect(text).toContain(strings.en.paywallFeatureBatch);
    expect(text).toContain(strings.en.paywallFeatureFaster);
    expect(text).not.toContain('High-volume batch uploads');
  });
});
