import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// PASSWORD-RECOVERY LOCALIZATION — audit #8 Part 1.
// ============================================================================
// Same discipline as #122 (edgeLeakLocalization.test.tsx), for the same reason:
// the terminal renders Arabic right-to-left and will happily display a wrong
// letter, a smuggled bidi control, or a silent English fallback as something
// that LOOKS correct. Glyphs are never the contract. The code-point arrays
// below are — they are what Abo Jad approves, as numbers.
//
// TWO LAYERS, because either alone is insufficient:
//   1. CATALOG, by code point. Proves strings.ar holds exactly the approved
//      text, independent of what strings.ts looks like in an editor.
//   2. RENDER. A catalog assertion is blind to a call site that never reads the
//      catalog. So the REAL screen is mounted under lang=ar and the DISPLAYED
//      heading is compared with toBe() — EQUALITY, never toContain(), which
//      would still pass if English were concatenated on.
// ============================================================================

// ── Approved Arabic, as CODE POINTS (independent of strings.ts). ────────────
// Every fragment here is either byte-identical to an already-approved catalog
// entry or built from one; the reuse is asserted at the bottom of this file so
// the claim is checked, not just written down:
//   كلمة المرور  (1603,1604,1605,1577,32,1575,1604,1605,1585,1608,1585) = authPasswordLabel
//   جارٍ         (1580,1575,1585,1613)                                   = authSigningIn opener
//   تعذّر        (1578,1593,1584,1617,1585, with SHADDA 1617)            = dashboardConnectionError opener
//   المتابعة إلى لوحة القيادة                                            = authContinueCta, whole string
const AR_EXPECTED: Record<string, number[]> = {
  // "تعيين كلمة مرور جديدة"
  resetPasswordTitle: [
    1578, 1593, 1610, 1610, 1606, 32, 1603, 1604, 1605, 1577, 32, 1605, 1585, 1608, 1585, 32, 1580,
    1583, 1610, 1583, 1577,
  ],
  // "اختر كلمة مرور قوية لحسابك."
  resetPasswordSubtitle: [
    1575, 1582, 1578, 1585, 32, 1603, 1604, 1605, 1577, 32, 1605, 1585, 1608, 1585, 32, 1602, 1608,
    1610, 1577, 32, 1604, 1581, 1587, 1575, 1576, 1603, 46,
  ],
  // "كلمة المرور الجديدة"
  resetPasswordNewLabel: [
    1603, 1604, 1605, 1577, 32, 1575, 1604, 1605, 1585, 1608, 1585, 32, 1575, 1604, 1580, 1583,
    1610, 1583, 1577,
  ],
  // "تأكيد كلمة المرور"
  resetPasswordConfirmLabel: [
    1578, 1571, 1603, 1610, 1583, 32, 1603, 1604, 1605, 1577, 32, 1575, 1604, 1605, 1585, 1608,
    1585,
  ],
  // "تحديث كلمة المرور"
  resetPasswordSubmit: [
    1578, 1581, 1583, 1610, 1579, 32, 1603, 1604, 1605, 1577, 32, 1575, 1604, 1605, 1585, 1608,
    1585,
  ],
  // "جارٍ التحديث..." — جارٍ carries the KASRATAN (1613), as in authSigningIn.
  resetPasswordSubmitting: [
    1580, 1575, 1585, 1613, 32, 1575, 1604, 1578, 1581, 1583, 1610, 1579, 46, 46, 46,
  ],
  // "يجب ألا تقل كلمة المرور عن 8 أحرف."
  // 56 is the ASCII digit 8 — the same convention the catalog already uses for
  // numbers inside Arabic copy (freeLimit "10", dailyLimitReached "24").
  resetPasswordTooShort: [
    1610, 1580, 1576, 32, 1571, 1604, 1575, 32, 1578, 1602, 1604, 32, 1603, 1604, 1605, 1577, 32,
    1575, 1604, 1605, 1585, 1608, 1585, 32, 1593, 1606, 32, 56, 32, 1571, 1581, 1585, 1601, 46,
  ],
  // "كلمتا المرور غير متطابقتين."
  resetPasswordMismatch: [
    1603, 1604, 1605, 1578, 1575, 32, 1575, 1604, 1605, 1585, 1608, 1585, 32, 1594, 1610, 1585, 32,
    1605, 1578, 1591, 1575, 1576, 1602, 1578, 1610, 1606, 46,
  ],
  // "تم تحديث كلمة المرور"
  resetPasswordSuccessTitle: [
    1578, 1605, 32, 1578, 1581, 1583, 1610, 1579, 32, 1603, 1604, 1605, 1577, 32, 1575, 1604, 1605,
    1585, 1608, 1585,
  ],
  // "يمكنك الآن استخدام كلمة المرور الجديدة لتسجيل الدخول."
  // 1570 is ALEF WITH MADDA ABOVE (آ) — a single code point, NOT alef+madda.
  resetPasswordSuccessBody: [
    1610, 1605, 1603, 1606, 1603, 32, 1575, 1604, 1570, 1606, 32, 1575, 1587, 1578, 1582, 1583,
    1575, 1605, 32, 1603, 1604, 1605, 1577, 32, 1575, 1604, 1605, 1585, 1608, 1585, 32, 1575, 1604,
    1580, 1583, 1610, 1583, 1577, 32, 1604, 1578, 1587, 1580, 1610, 1604, 32, 1575, 1604, 1583,
    1582, 1608, 1604, 46,
  ],
  // "المتابعة إلى لوحة القيادة" — byte-identical to authContinueCta, so the
  // recovery flow ends with the exact wording the login flow already uses.
  resetPasswordContinueCta: [
    1575, 1604, 1605, 1578, 1575, 1576, 1593, 1577, 32, 1573, 1604, 1609, 32, 1604, 1608, 1581,
    1577, 32, 1575, 1604, 1602, 1610, 1575, 1583, 1577,
  ],
  // "تعذّر تحديث كلمة المرور. أعد المحاولة."
  resetPasswordGenericError: [
    1578, 1593, 1584, 1617, 1585, 32, 1578, 1581, 1583, 1610, 1579, 32, 1603, 1604, 1605, 1577, 32,
    1575, 1604, 1605, 1585, 1608, 1585, 46, 32, 1571, 1593, 1583, 32, 1575, 1604, 1605, 1581, 1575,
    1608, 1604, 1577, 46,
  ],
};

vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { updateUser: vi.fn() } },
}));
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'c0ffee00-0000-4000-8000-000000000002', email: 'ar-check@example.com' },
    session: null,
    loading: false,
    isRecovering: true,
    clearRecovery: () => {},
    signOut: async () => {},
  }),
}));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ResetPasswordScreen, MIN_PASSWORD_LENGTH } from '../src/screens/ResetPasswordScreen';

const cps = (s: string) => [...s].map((c) => c.codePointAt(0)!);
type Key = keyof typeof strings.en;
const NEW_KEYS = Object.keys(AR_EXPECTED) as Key[];
const LANGS = ['en', 'fr', 'ar'] as const;

// ────────────────────────────────────────────────────────────────────────────
// 1. AR catalog — code-point exact for every NEW key.
// ────────────────────────────────────────────────────────────────────────────
describe('AR password-recovery catalog — code-point exact (never trust the terminal)', () => {
  for (const [key, expected] of Object.entries(AR_EXPECTED)) {
    it(`strings.ar.${key} matches the approved code points exactly`, () => {
      const value = strings.ar[key as keyof typeof strings.ar];
      expect(value).toBeTypeOf('string');
      expect(cps(value as string)).toEqual(expected);
    });
  }

  it('carries NO hidden bidi / zero-width control characters (RLM, LRM, isolates, BOM)', () => {
    const isCtrl = (p: number) =>
      (p >= 0x200b && p <= 0x200f) || (p >= 0x202a && p <= 0x202e) || (p >= 0x2066 && p <= 0x2069) || p === 0xfeff;
    for (const key of NEW_KEYS) {
      const bad = cps(strings.ar[key] as string).filter(isCtrl);
      expect(bad, `${key} smuggled a hidden control char`).toEqual([]);
    }
  });

  it('every NEW key exists in all three locales (no missing-locale renders-empty)', () => {
    for (const key of NEW_KEYS) {
      for (const lang of LANGS) {
        const v = strings[lang][key];
        expect(typeof v === 'string' && (v as string).length > 0, `${lang}.${key} missing`).toBe(true);
      }
    }
  });

  it('no NEW key carries an interpolation placeholder (D1)', () => {
    for (const key of NEW_KEYS) {
      for (const lang of LANGS) {
        expect(strings[lang][key] as string, `${lang}.${key} has a slot`).not.toContain('{');
      }
    }
  });

  // The length rule is stated in prose in three languages and enforced by one
  // constant. Interpolating the number would splice a digit into Arabic at
  // render time (D1), so instead the two are pinned together here: change the
  // constant without rewording all three strings and this fails.
  it('the stated minimum length agrees with MIN_PASSWORD_LENGTH in all three locales', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    for (const lang of LANGS) {
      expect(
        strings[lang].resetPasswordTooShort,
        `${lang}.resetPasswordTooShort no longer states ${MIN_PASSWORD_LENGTH}`
      ).toContain(String(MIN_PASSWORD_LENGTH));
    }
  });

  // The reuse claimed in the header comment, asserted rather than trusted.
  it('reuses already-approved Arabic verbatim (no second spelling of the same words)', () => {
    expect(strings.ar.resetPasswordContinueCta).toBe(strings.ar.authContinueCta);
    expect(strings.ar.resetPasswordNewLabel.startsWith(strings.ar.authPasswordLabel)).toBe(true);
    expect(strings.ar.resetPasswordConfirmLabel.endsWith(strings.ar.authPasswordLabel)).toBe(true);
    // جارٍ — the catalog's established opener for an in-progress action.
    expect(cps(strings.ar.resetPasswordSubmitting).slice(0, 4)).toEqual(cps(strings.ar.authSigningIn).slice(0, 4));
    // تعذّر — including the SHADDA, exactly as dashboardConnectionError spells it.
    expect(cps(strings.ar.resetPasswordGenericError).slice(0, 5)).toEqual(
      cps(strings.ar.dashboardConnectionError).slice(0, 5)
    );
  });

  it('EN and FR are distinct from each other and from AR (nothing was copy-pasted across locales)', () => {
    for (const key of NEW_KEYS) {
      expect(strings.en[key], `en/fr.${key} identical`).not.toBe(strings.fr[key]);
      expect(strings.en[key], `en/ar.${key} identical`).not.toBe(strings.ar[key]);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. RENDER — the real screen under lang=ar.
// ────────────────────────────────────────────────────────────────────────────
let container: HTMLDivElement;
let root: Root;

function mount(lang: 'en' | 'fr' | 'ar') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/reset-password']}>
          <ResetPasswordScreen />
        </MemoryRouter>
      </LanguageProvider>
    );
  });
}

const heading = () => container.querySelector('h1')?.textContent ?? '';

describe('ResetPasswordScreen RENDERS the catalog exactly', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });

  // The assertion the task names: EQUALITY against the AR catalog key.
  it('under lang=ar the heading is exactly strings.ar.resetPasswordTitle', () => {
    mount('ar');
    expect(
      heading(),
      'The reset screen heading must be the AR catalog string ALONE. Anything else ' +
        'means the screen does not read the catalog, or English was concatenated on.'
    ).toBe(strings.ar.resetPasswordTitle);
  });

  // Belt and braces: the rendered heading is also checked as code points, so a
  // catalog that had been corrupted in the SAME way as the render would still
  // be caught by layer 1 above and this stays honest.
  it('the rendered AR heading matches the approved code points', () => {
    mount('ar');
    expect(cps(heading())).toEqual(AR_EXPECTED.resetPasswordTitle);
  });

  it('under lang=ar every visible label comes from the AR catalog, with no English left', () => {
    mount('ar');
    const text = container.textContent ?? '';
    for (const key of ['resetPasswordSubtitle', 'resetPasswordNewLabel', 'resetPasswordConfirmLabel', 'resetPasswordSubmit'] as const) {
      expect(text, `${key} did not render in AR`).toContain(strings.ar[key]);
    }
    for (const literal of ['Set a new password', 'New password', 'Confirm password', 'Update password']) {
      expect(text, `English leaked into the AR screen: ${literal}`).not.toContain(literal);
    }
  });

  it('under lang=fr the heading is exactly strings.fr.resetPasswordTitle (no English fallback)', () => {
    mount('fr');
    expect(heading()).toBe(strings.fr.resetPasswordTitle);
    expect(container.textContent ?? '').not.toContain('Set a new password');
  });

  it('under lang=en the heading is exactly strings.en.resetPasswordTitle', () => {
    mount('en');
    expect(heading()).toBe(strings.en.resetPasswordTitle);
  });

  it('renders in all three locales without crashing, and the three differ', () => {
    const seen: string[] = [];
    for (const lang of LANGS) {
      mount(lang);
      seen.push(container.innerHTML);
      root.unmount();
      container.remove();
    }
    // Remount one so the shared afterEach has something to tear down.
    mount('en');
    expect(new Set(seen).size, 'two locales rendered identical markup').toBe(3);
  });
});
