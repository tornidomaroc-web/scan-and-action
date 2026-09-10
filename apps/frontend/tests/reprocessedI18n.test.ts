import { describe, it, expect } from 'vitest';
import { strings } from '../src/i18n/strings';

// ============================================================================
// "Re-processed" copy — three locales, and the Arabic asserted by CODE POINT.
// ============================================================================
// A document recovered by the re-extraction endpoint gains its amounts, and
// `sum_expenses` (queryExecutor.ts:58-70) groups TOTAL_AMOUNT facts with NO
// status filter — so those amounts enter the user's expense total the moment
// they are written. On 2026-09-09 that moved one organisation's summable total
// by 20,644.74 with nothing in the product explaining it.
//
// This copy is the explanation. It has one obligation per locale: say that the
// document PREVIOUSLY FAILED and say WHEN it was re-processed. A string that
// only says "re-processed" leaves a user reconciling against an old total no
// better off than silence.
//
// THE ARABIC IS ASSERTED BY CODE POINT, NOT BY EYE — same discipline as
// tests/reextractErrorI18n.test.ts. A terminal, a diff viewer and a review pane
// each apply their own bidi reordering, so *reading* an Arabic string tells you
// nothing reliable about the order actually stored. It reordered output once
// already in this session's work. The expected values below are composed from
// word tokens, which no renderer can reorder, and compared against what
// strings.ts actually holds.
// ============================================================================

const LOCALES = ['en', 'fr', 'ar'] as const;
const KEYS = ['reprocessedBadge', 'reprocessedNotice'] as const;

// "أُعيدت معالجته"  ->  re-processed
const AR_BADGE =
  'أُعيدت' + // أُعيدت   (was re-done)
  ' ' +
  'معالجته'; // معالجته  (its processing)

// "فشل استخراج هذا المستند سابقًا. تمت إعادة معالجته في {date}. تظهر مبالغه الآن ضمن إجمالياتك."
const AR_NOTICE =
  'فشل' + // فشل       (failed)
  ' ' +
  'استخراج' + // استخراج   (extraction of)
  ' ' +
  'هذا' + // هذا       (this)
  ' ' +
  'المستند' + // المستند   (the document)
  ' ' +
  'سابقًا' + // سابقًا    (previously)
  '.' +
  ' ' +
  'تمت' + // تمت       (was completed)
  ' ' +
  'إعادة' + // إعادة     (re-)
  ' ' +
  'معالجته' + // معالجته   (its processing)
  ' ' +
  'في' + // في        (on)
  ' ' +
  '{date}' +
  '.' +
  ' ' +
  'تظهر' + // تظهر      (appear)
  ' ' +
  'مبالغه' + // مبالغه    (its amounts)
  ' ' +
  'الآن' + // الآن      (now)
  ' ' +
  'ضمن' + // ضمن       (within)
  ' ' +
  'إجمالياتك' + // إجمالياتك (your totals)
  '.';

const cp = (s: string) => Array.from(s).map((c) => c.codePointAt(0)!);

describe('re-processed copy exists in every locale', () => {
  it.each(LOCALES)('%s defines both keys, non-empty', (locale) => {
    for (const key of KEYS) {
      const value = (strings[locale] as Record<string, string>)[key];
      expect(typeof value, `${locale}.${key}`).toBe('string');
      expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
    }
  });

  it.each(LOCALES)('%s carries the {date} slot in the notice', (locale) => {
    // Without the slot the copy cannot say WHEN, which is half its obligation.
    expect((strings[locale] as Record<string, string>).reprocessedNotice).toContain('{date}');
  });

  it.each(LOCALES)('%s does NOT put a date slot in the badge', (locale) => {
    // The badge is a list marker with no room for a date; an unreplaced {date}
    // would render literally.
    expect((strings[locale] as Record<string, string>).reprocessedBadge).not.toContain('{date}');
  });

  it.each(LOCALES)('%s says the extraction previously FAILED, in its own words', (locale) => {
    // Per-locale verb so this cannot pass on an English word leaking into a
    // translated string — the defect class from docs/AR_ENGLISH_LEAKS_RECON.
    const failed = { en: 'failed', fr: 'échoué', ar: 'فشل' }[locale];
    expect(
      (strings[locale] as Record<string, string>).reprocessedNotice.toLowerCase()
    ).toContain(failed.toLowerCase());
  });

  it.each(LOCALES)('%s notice differs from the badge', (locale) => {
    const table = strings[locale] as Record<string, string>;
    expect(table.reprocessedNotice).not.toBe(table.reprocessedBadge);
  });
});

describe('the Arabic is what we think it is — by code point', () => {
  it('reprocessedBadge matches token-by-token', () => {
    const actual = (strings.ar as Record<string, string>).reprocessedBadge;
    expect(cp(actual)).toEqual(cp(AR_BADGE));
  });

  it('reprocessedNotice matches token-by-token', () => {
    const actual = (strings.ar as Record<string, string>).reprocessedNotice;
    expect(cp(actual)).toEqual(cp(AR_NOTICE));
  });

  it('contains no Latin letters outside the {date} slot', () => {
    // An English word surviving in the Arabic table is the exact defect
    // docs/AR_ENGLISH_LEAKS_RECON_2026-07-23.md was written about.
    for (const key of KEYS) {
      const withoutSlot = (strings.ar as Record<string, string>)[key].replace('{date}', '');
      expect(withoutSlot, `ar.${key}`).not.toMatch(/[A-Za-z]/);
    }
  });
});
