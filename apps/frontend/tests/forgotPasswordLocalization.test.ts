import { describe, it, expect } from 'vitest';
import { strings } from '../src/i18n/strings';

// ============================================================================
// FORGOT-PASSWORD LOCALIZATION — audit #8 Part 2.
// ============================================================================
// #122 discipline, unchanged: the terminal renders Arabic right-to-left and
// will happily display a wrong letter, a smuggled bidi control, or a silent
// English fallback as something that LOOKS correct. Glyphs are never the
// contract. The code-point arrays below are — they are what Abo Jad approves,
// as numbers.
//
// The RENDER half of the #122 pairing lives in forgotPasswordWiring.test.tsx,
// which mounts the real AuthScreen under lang=ar and compares the displayed
// notice with toBe(). A catalog assertion alone is blind to a call site that
// never reads the catalog; that file closes the gap.
// ============================================================================

// ── Approved Arabic, as CODE POINTS (independent of strings.ts). ────────────
// Fragments reused from already-approved entries, asserted at the bottom:
//   البريد الإلكتروني (authEmailLabel) · كلمة المرور (authPasswordLabel)
//   جارٍ (authSigningIn opener, KASRATAN 1613) · تعذّر (SHADDA 1617)
// Diacritics that must survive intact: 1611 FATHATAN in أولاً / جدًا / قليلاً.
// 1548 is the ARABIC COMMA (،), not an ASCII comma.
const AR_EXPECTED: Record<string, number[]> = {
  // "أدخل بريدك الإلكتروني أولاً."
  forgotPasswordEmailRequired: [
    1571, 1583, 1582, 1604, 32, 1576, 1585, 1610, 1583, 1603, 32, 1575, 1604, 1573, 1604, 1603,
    1578, 1585, 1608, 1606, 1610, 32, 1571, 1608, 1604, 1575, 1611, 46,
  ],
  // "جارٍ إرسال الرابط..."
  forgotPasswordSending: [
    1580, 1575, 1585, 1613, 32, 1573, 1585, 1587, 1575, 1604, 32, 1575, 1604, 1585, 1575, 1576,
    1591, 46, 46, 46,
  ],
  // "إذا كان هناك حساب بهذا البريد الإلكتروني، فسيصلك رابط إعادة تعيين كلمة المرور."
  // CONDITIONAL by design — see the enumeration test in forgotPasswordWiring.
  forgotPasswordSent: [
    1573, 1584, 1575, 32, 1603, 1575, 1606, 32, 1607, 1606, 1575, 1603, 32, 1581, 1587, 1575, 1576,
    32, 1576, 1607, 1584, 1575, 32, 1575, 1604, 1576, 1585, 1610, 1583, 32, 1575, 1604, 1573, 1604,
    1603, 1578, 1585, 1608, 1606, 1610, 1548, 32, 1601, 1587, 1610, 1589, 1604, 1603, 32, 1585,
    1575, 1576, 1591, 32, 1573, 1593, 1575, 1583, 1577, 32, 1578, 1593, 1610, 1610, 1606, 32, 1603,
    1604, 1605, 1577, 32, 1575, 1604, 1605, 1585, 1608, 1585, 46,
  ],
  // "طلبات كثيرة جدًا. انتظر قليلاً قبل المحاولة مرة أخرى."
  forgotPasswordRateLimited: [
    1591, 1604, 1576, 1575, 1578, 32, 1603, 1579, 1610, 1585, 1577, 32, 1580, 1583, 1611, 1575, 46,
    32, 1575, 1606, 1578, 1592, 1585, 32, 1602, 1604, 1610, 1604, 1575, 1611, 32, 1602, 1576, 1604,
    32, 1575, 1604, 1605, 1581, 1575, 1608, 1604, 1577, 32, 1605, 1585, 1577, 32, 1571, 1582, 1585,
    1609, 46,
  ],
  // "تعذّر إرسال رابط إعادة التعيين. أعد المحاولة."
  forgotPasswordError: [
    1578, 1593, 1584, 1617, 1585, 32, 1573, 1585, 1587, 1575, 1604, 32, 1585, 1575, 1576, 1591, 32,
    1573, 1593, 1575, 1583, 1577, 32, 1575, 1604, 1578, 1593, 1610, 1610, 1606, 46, 32, 1571, 1593,
    1583, 32, 1575, 1604, 1605, 1581, 1575, 1608, 1604, 1577, 46,
  ],
};

const cps = (s: string) => [...s].map((c) => c.codePointAt(0)!);
type Key = keyof typeof strings.en;
const NEW_KEYS = Object.keys(AR_EXPECTED) as Key[];
const LANGS = ['en', 'fr', 'ar'] as const;

describe('AR forgot-password catalog — code-point exact (never trust the terminal)', () => {
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
      expect(cps(strings.ar[key] as string).filter(isCtrl), `${key} smuggled a hidden control char`).toEqual([]);
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

  it('EN, FR and AR are all distinct (nothing was copy-pasted across locales)', () => {
    for (const key of NEW_KEYS) {
      expect(strings.en[key], `en/fr.${key} identical`).not.toBe(strings.fr[key]);
      expect(strings.en[key], `en/ar.${key} identical`).not.toBe(strings.ar[key]);
    }
  });

  it('reuses already-approved Arabic verbatim (no second spelling of the same words)', () => {
    // جارٍ — the catalog's established opener for an in-progress action.
    expect(cps(strings.ar.forgotPasswordSending).slice(0, 4)).toEqual(cps(strings.ar.authSigningIn).slice(0, 4));
    // تعذّر — including the SHADDA, exactly as resetPasswordGenericError spells it.
    expect(cps(strings.ar.forgotPasswordError).slice(0, 5)).toEqual(
      cps(strings.ar.resetPasswordGenericError).slice(0, 5)
    );
    // The nouns the user already reads elsewhere on this very screen.
    expect(strings.ar.forgotPasswordSent).toContain(strings.ar.authEmailLabel);
    expect(strings.ar.forgotPasswordSent).toContain(strings.ar.authPasswordLabel);
  });

  // The FATHATAN and the Arabic comma are the characters most easily lost to a
  // copy-paste through a tool that "normalises" text. Pinned individually so a
  // silent strip is reported as itself rather than as an opaque array diff.
  it('keeps its diacritics and its ARABIC comma (not an ASCII one)', () => {
    expect(cps(strings.ar.forgotPasswordEmailRequired), 'FATHATAN 1611 lost from أولاً').toContain(1611);
    expect(cps(strings.ar.forgotPasswordRateLimited), 'FATHATAN 1611 lost').toContain(1611);
    expect(cps(strings.ar.forgotPasswordSending), 'KASRATAN 1613 lost from جارٍ').toContain(1613);
    expect(cps(strings.ar.forgotPasswordError), 'SHADDA 1617 lost from تعذّر').toContain(1617);
    expect(cps(strings.ar.forgotPasswordSent), 'ARABIC COMMA 1548 replaced').toContain(1548);
    expect(cps(strings.ar.forgotPasswordSent), 'an ASCII comma leaked into Arabic copy').not.toContain(44);
  });
});
