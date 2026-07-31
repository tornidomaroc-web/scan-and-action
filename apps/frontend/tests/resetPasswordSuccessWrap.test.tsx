import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strings } from '../src/i18n/strings';

// ============================================================================
// RESET-PASSWORD SUCCESS BODY — wrapping fixed WITHOUT touching the copy.
// ============================================================================
// The success line wrapped badly in the narrow card (max-w-[440px] with p-10,
// so ~360px of text width), splitting the phrase across lines. The fix is
// `text-balance` on the paragraph: TYPOGRAPHY ONLY.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE CAN AND CANNOT PROVE.
// ---------------------------------------------------------------------------
// It CANNOT prove the visual wrapping improved. jsdom performs no layout: it
// has no font metrics, no line boxes, and does not implement `text-wrap`, so
// any assertion about where the line breaks would be theatre. Confirming the
// improvement is a human check on a real device — see the PR body.
//
// What it DOES pin is the half that can regress silently and that a human
// glance would never catch: the approved copy must stay byte-identical in all
// three locales. Widening a card is cheap to undo; a "helpful" copy tweak that
// slips a non-breaking space or shortens a sentence to make it fit would defeat
// the whole point, and would need Abo Jad's code-point sign-off again.
// ============================================================================

/** Read a source file relative to this test. Called inside describe (not at
 *  module top level), matching the sibling suites: import.meta.url is not a
 *  file:// URL during module evaluation here. */
const readSrc = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const cps = (s: string) => [...s].map((c) => c.codePointAt(0)!);

describe('reset-password success body — the copy is untouched', () => {
  it('EN and FR are byte-identical to the approved strings', () => {
    expect(strings.en.resetPasswordSuccessBody).toBe('You can now use your new password to sign in.');
    expect(strings.fr.resetPasswordSuccessBody).toBe(
      'Vous pouvez maintenant utiliser votre nouveau mot de passe pour vous connecter.'
    );
  });

  it('AR matches the approved code points exactly', () => {
    // "يمكنك الآن استخدام كلمة المرور الجديدة لتسجيل الدخول."
    expect(cps(strings.ar.resetPasswordSuccessBody)).toEqual([
      1610, 1605, 1603, 1606, 1603, 32, 1575, 1604, 1570, 1606, 32, 1575, 1587, 1578, 1582, 1583, 1575, 1605, 32,
      1603, 1604, 1605, 1577, 32, 1575, 1604, 1605, 1585, 1608, 1585, 32, 1575, 1604, 1580, 1583, 1610, 1583, 1577,
      32, 1604, 1578, 1587, 1580, 1610, 1604, 32, 1575, 1604, 1583, 1582, 1608, 1604, 46,
    ]);
  });

  it('carries no non-breaking space or hidden control smuggled in to force a break', () => {
    // The tempting "fix" is a U+00A0 between the last two words. That is a COPY
    // change wearing a typography costume, and it must not appear.
    for (const lang of ['en', 'fr', 'ar'] as const) {
      const points = cps(strings[lang].resetPasswordSuccessBody);
      expect(points, `${lang} smuggled a no-break space`).not.toContain(0x00a0);
      expect(points, `${lang} smuggled a narrow no-break space`).not.toContain(0x202f);
      expect(points, `${lang} smuggled a word joiner`).not.toContain(0x2060);
      expect(points.filter((p) => p === 0x200b || p === 0xfeff), `${lang} smuggled a zero-width char`).toEqual([]);
    }
  });

  it('exists and is non-empty in all three locales', () => {
    for (const lang of ['en', 'fr', 'ar'] as const) {
      const v = strings[lang].resetPasswordSuccessBody;
      expect(typeof v === 'string' && v.length > 0, `${lang} missing`).toBe(true);
    }
  });
});

describe('reset-password success body — the typography fix is present', () => {
  const SRC = readSrc('../src/screens/ResetPasswordScreen.tsx');

  it('the success paragraph carries text-balance', () => {
    // Source-level, deliberately: jsdom cannot evaluate `text-wrap`, so the
    // honest assertion is that the class reaches the element, not that the
    // browser did something with it.
    expect(SRC).toMatch(/className="text-balance [^"]*"[\s\S]{0,80}resetPasswordSuccessBody/);
  });

  it('the fix is typography, not a rewritten string: no literal copy in the JSX', () => {
    expect(SRC).not.toContain('You can now use your new password');
  });
});
