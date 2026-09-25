import { describe, it, expect } from 'vitest';
import { strings } from '../src/i18n/strings';
import { plural, pluralForms } from '../src/lib/ledgerView';

// ============================================================================
// Plurals read naturally in all three languages.
// ============================================================================
// The ledger home first shipped a one/other switch, which is English's rule.
// Arabic has six plural categories, so every Arabic count read as a label and
// a number ("الإيصالات: 1", "إيصالات تنتظر مراجعتك: 1"). A plural message now
// carries one form per category the language's CLDR rules can pick, and this
// file checks two things: that no message lacks a form its language can
// select (derived from Intl.PluralRules, not a list typed here), and what the
// forms actually read as for the counts that pick each one.
// ============================================================================

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];
const PLURAL_MESSAGE = /^(zero|one|two|few|many|other)=/;

const categories = (lang: Lang) => new Intl.PluralRules(lang).resolvedOptions().pluralCategories as string[];

/** Missing and stray categories of one message for one language. */
function audit(message: string, lang: Lang) {
  const have = Object.keys(pluralForms(message));
  const need = categories(lang);
  return {
    missing: need.filter(c => !have.includes(c)),
    stray: have.filter(c => !need.includes(c)),
  };
}

const pluralKeys = Object.keys(strings.en).filter(k => PLURAL_MESSAGE.test((strings.en as Record<string, string>)[k]));

describe('every plural message has every form its language can select', () => {
  it('the audit can fail (control): the old two-form Arabic message is missing four categories', () => {
    expect(audit('one={n}|other={n}', 'ar').missing.sort()).toEqual(['few', 'many', 'two', 'zero']);
    expect(audit('one=a|few=b|other=c', 'en').stray).toEqual(['few']);
  });

  it('finds the plural messages it is meant to check', () => {
    expect(pluralKeys.sort()).toEqual([
      'ledgerExcludedDuplicate', 'ledgerExcludedNoAmount', 'ledgerExcludedStatus', 'ledgerNeedsReview',
      'ledgerNotYetSorted', 'ledgerQueueAll', 'ledgerQueueWaiting', 'ledgerReceiptCount',
    ]);
  });

  for (const lang of LANGS) {
    for (const key of pluralKeys) {
      it(`${lang}.${key}`, () => {
        const message = (strings[lang] as Record<string, string>)[key];
        expect(message, 'is a plural message in every language').toMatch(PLURAL_MESSAGE);
        expect(audit(message, lang)).toEqual({ missing: [], stray: [] });
      });
    }
  }
});

const r = (lang: Lang, n: number, key = 'ledgerReceiptCount') =>
  plural(n, lang, (strings[lang] as Record<string, string>)[key]);

describe('what the forms read as', () => {
  it('Arabic: singular, dual, few, many and hundreds, each as Arabic writes it', () => {
    expect(r('ar', 0)).toBe('لا إيصالات');
    expect(r('ar', 1)).toBe('إيصال واحد');
    expect(r('ar', 2)).toBe('إيصالان');
    expect(r('ar', 3)).toBe('3 إيصالات');
    expect(r('ar', 10)).toBe('10 إيصالات');
    expect(r('ar', 11)).toBe('11 إيصالًا');
    expect(r('ar', 99)).toBe('99 إيصالًا');
    expect(r('ar', 100)).toBe('100 إيصال');
    expect(r('ar', 103)).toBe('103 إيصالات');
    expect(r('ar', 1, 'ledgerNeedsReview').replace('{month}', 'سبتمبر')).toBe('إيصال واحد من سبتمبر بانتظار مراجعتك');
    expect(r('ar', 2, 'ledgerNeedsReview').replace('{month}', 'سبتمبر')).toBe('إيصالان من سبتمبر بانتظار مراجعتك');
    expect(r('ar', 8, 'ledgerQueueAll')).toBe('8 مستندات في المراجعة من كل الأشهر');
    expect(r('ar', 2, 'ledgerExcludedDuplicate')).toBe('نسختان مكررتان محتملتان');
  });

  it('French: 0 and 1 are singular, the million takes "de"', () => {
    expect(r('fr', 0)).toBe('0 reçu');
    expect(r('fr', 1)).toBe('1 reçu');
    expect(r('fr', 2)).toBe('2 reçus');
    expect(r('fr', 1_000_000).replace(/[  ]/g, ' ')).toBe('1 000 000 de reçus');
    expect(r('fr', 1, 'ledgerNotYetSorted')).toBe('1 pas encore classé');
    expect(r('fr', 3, 'ledgerNotYetSorted')).toBe('3 pas encore classés');
  });

  it('English: one and other', () => {
    expect(r('en', 1)).toBe('1 receipt');
    expect(r('en', 2)).toBe('2 receipts');
    expect(r('en', 1, 'ledgerNeedsReview').replace('{month}', 'September')).toBe('1 receipt from September needs your review');
  });

  it('no form in any language writes a "label: n" count or an Arabic-Indic digit', () => {
    // Western digits even where the engine would default Arabic to Arabic-Indic.
    const RealNF = Intl.NumberFormat;
    (Intl as any).NumberFormat = function (l: any, o: any) { return new RealNF(l === 'ar' ? 'ar-u-nu-arab' : l, o); };
    try {
      expect(new Intl.NumberFormat('ar').format(11)).toMatch(/[٠-٩]/); // control: the override bites
      for (const n of [0, 1, 2, 3, 11, 100, 1234]) expect(r('ar', n)).not.toMatch(/[٠-٩۰-۹]/);
      expect(r('ar', 1234)).toContain('1,234');
    } finally {
      (Intl as any).NumberFormat = RealNF;
    }
    for (const lang of LANGS) for (const key of pluralKeys) {
      for (const form of Object.values(pluralForms((strings[lang] as Record<string, string>)[key]))) {
        expect(form, `${lang}.${key}`).not.toMatch(/:\s*\{n\}$/);
      }
    }
  });
});
