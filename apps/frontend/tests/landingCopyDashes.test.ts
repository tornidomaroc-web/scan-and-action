import { describe, it, expect } from 'vitest';
import { strings } from '../src/i18n/strings';

// ============================================================================
// THE OWNER'S WRITING RULE FOR THE LANDING COPY, IN ALL THREE LANGUAGES
// (2026-09-26): no em dash, no en dash, and no hyphen used as a dash between
// words or clauses. A sentence that wants one is rewritten instead.
//
// A hyphen INSIDE a word (right-to-left, e-mail) is not a dash and passes; a
// hyphen with a space on either side is a dash and fails. Every key that
// starts with `landing` is landing copy.
// ============================================================================

// Built from code points: figure dash, en dash, em dash, horizontal bar and
// the two-em and three-em dashes, so this file itself carries no dash.
const DASHES = new RegExp('[\\u2012\\u2013\\u2014\\u2015\\u2E3A\\u2E3B]');
const HYPHEN_AS_DASH = /\s-|-\s/;

describe('the landing copy carries no dash', () => {
  const langs = ['en', 'fr', 'ar'] as const;
  const keys = Object.keys(strings.en).filter((k) => k.startsWith('landing'));

  it('the scan sees landing keys (positive control on the corpus)', () => {
    expect(keys.length).toBeGreaterThanOrEqual(40);
    for (const lang of langs) for (const k of keys) expect(typeof (strings[lang] as any)[k], `${lang}.${k}`).toBe('string');
  });

  for (const lang of langs) {
    it(`${lang}: no em dash, en dash, or hyphen between words`, () => {
      const offenders = keys.filter((k) => {
        const v = (strings[lang] as any)[k] as string;
        return DASHES.test(v) || HYPHEN_AS_DASH.test(v);
      });
      expect(offenders).toEqual([]);
    });
  }

  it('the control: each forbidden shape is caught, and an in-word hyphen is not', () => {
    // Built from code points, so this file itself carries no dash character.
    const em = String.fromCharCode(0x2014);
    const en = String.fromCharCode(0x2013);
    expect(DASHES.test(`one ${em} two`)).toBe(true);
    expect(DASHES.test(`one ${en} two`)).toBe(true);
    expect(HYPHEN_AS_DASH.test('one - two')).toBe(true);
    expect(HYPHEN_AS_DASH.test('one -two')).toBe(true);
    expect(HYPHEN_AS_DASH.test('right-to-left')).toBe(false);
    expect(DASHES.test('right-to-left')).toBe(false);
  });
});
