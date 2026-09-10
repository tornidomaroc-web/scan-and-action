import { describe, it, expect } from 'vitest';
import { strings } from '../src/i18n/strings';

// ============================================================================
// Re-extraction 409 copy — two codes, two different meanings, three locales.
// ============================================================================
// POST /api/documents/:id/reextract has exactly two 409 codes and they must NOT
// share wording, because they ask the user for opposite things:
//
//   SOURCE_FILE_UNAVAILABLE   the stored object is gone. Re-extraction can
//                             never succeed for this row. Re-uploading is the
//                             ONLY path, and the copy has to say so.
//   REEXTRACTION_IN_PROGRESS  another run already holds the row. The user does
//                             nothing and waits. Telling them to re-upload here
//                             would be actively wrong — it would create a
//                             second row and charge a scan.
//
// THE ARABIC IS ASSERTED BY CODE POINT, NOT BY EYE.
// -----------------------------------------------------------------------------
// A terminal, a diff viewer and a code-review pane each apply their own bidi
// reordering to Arabic, so *reading* a string tells you nothing reliable about
// the order actually stored. This project has been burned by that class of
// defect before (#118; docs/AR_ENGLISH_LEAKS_RECON_2026-07-23.md, ruling D1).
//
// So the expected Arabic below is written as explicit \uXXXX escapes — which no
// renderer can reorder — and compared against what strings.ts actually holds. If
// the literal in strings.ts is ever reversed, re-typed from a mangled paste, or
// silently normalised, this test fails on the exact index.
// ============================================================================

// "الملف الأصلي غير متاح. يرجى رفع المستند من جديد."
// word by word: الملف / الأصلي / غير / متاح . / يرجى / رفع / المستند / من / جديد .
const AR_SOURCE_FILE_UNAVAILABLE =
  'الملف' + // الملف   (the file)
  ' ' +
  'الأصلي' + // الأصلي  (the original)
  ' ' +
  'غير' + // غير     (not)
  ' ' +
  'متاح' + // متاح    (available)
  '.' +
  ' ' +
  'يرجى' + // يرجى    (please)
  ' ' +
  'رفع' + // رفع     (upload)
  ' ' +
  'المستند' + // المستند (the document)
  ' ' +
  'من' + // من      (from)
  ' ' +
  'جديد' + // جديد    (new)  -> "من جديد" = again
  '.';

// "تجري إعادة معالجة هذا المستند بالفعل. يرجى الانتظار."
const AR_REEXTRACTION_IN_PROGRESS =
  'تجري' + // تجري     (is underway)
  ' ' +
  'إعادة' + // إعادة    (re-)
  ' ' +
  'معالجة' + // معالجة   (processing)
  ' ' +
  'هذا' + // هذا      (this)
  ' ' +
  'المستند' + // المستند  (the document)
  ' ' +
  'بالفعل' + // بالفعل   (already)
  '.' +
  ' ' +
  'يرجى' + // يرجى     (please)
  ' ' +
  'الانتظار' + // الانتظار (wait)
  '.';

// "يحتوي هذا المستند على معلومات بالفعل، فلا شيء لإعادة معالجته."
const AR_HAS_CONTENT =
  'يحتوي' + // يحتوي   (contains)
  ' ' +
  'هذا' + // هذا     (this)
  ' ' +
  'المستند' + // المستند (the document)
  ' ' +
  'على' + // على     (on/already has)
  ' ' +
  'معلومات' + // معلومات (information)
  ' ' +
  'بالفعل' + // بالفعل  (already)
  '،' + // ،       ARABIC COMMA, not U+002C
  ' ' +
  'فلا' + // فلا     (so there is no)
  ' ' +
  'شيء' + // شيء     (thing)
  ' ' +
  'لإعادة' + // لإعادة  (to re-)
  ' ' +
  'معالجته' + // معالجته (process it)
  '.';

// "يحتوي هذا المستند على تعديلاتك الخاصة. إعادة المعالجة ستستبدلها، لذلك لم تبدأ."
const AR_HAS_USER_EDITS =
  'يحتوي' + // يحتوي     (contains)
  ' ' +
  'هذا' + // هذا       (this)
  ' ' +
  'المستند' + // المستند   (the document)
  ' ' +
  'على' + // على       (has)
  ' ' +
  'تعديلاتك' + // تعديلاتك  (your edits)
  ' ' +
  'الخاصة' + // الخاصة    (own)
  '.' +
  ' ' +
  'إعادة' + // إعادة     (re-)
  ' ' +
  'المعالجة' + // المعالجة  (the processing)
  ' ' +
  'ستستبدلها' + // ستستبدلها (will replace them)
  '،' + // ،         ARABIC COMMA
  ' ' +
  'لذلك' + // لذلك      (therefore)
  ' ' +
  'لم' + // لم        (did not)
  ' ' +
  'تبدأ' + // تبدأ      (start)
  '.';

// "يبدو أن هذه الصورة تحتوي على أكثر من مستند. يرجى رفع كل مستند على حدة."
const AR_NOT_SINGLE =
  'يبدو' + // يبدو    (it appears)
  ' ' +
  'أن' + // أن      (that)
  ' ' +
  'هذه' + // هذه     (this)
  ' ' +
  'الصورة' + // الصورة  (the image)
  ' ' +
  'تحتوي' + // تحتوي   (contains)
  ' ' +
  'على' + // على     (on)
  ' ' +
  'أكثر' + // أكثر    (more)
  ' ' +
  'من' + // من      (than)
  ' ' +
  'مستند' + // مستند   (one document)
  '.' +
  ' ' +
  'يرجى' + // يرجى    (please)
  ' ' +
  'رفع' + // رفع     (upload)
  ' ' +
  'كل' + // كل      (each)
  ' ' +
  'مستند' + // مستند   (document)
  ' ' +
  'على' + // على     (on)
  ' ' +
  'حدة' + // حدة     (its own) -> "على حدة" = separately
  '.';

const LOCALES = ['en', 'fr', 'ar'] as const;
// All FIVE codes the endpoint can answer with. The last three were reachable
// from the server long before the button was, and each fell through to the
// generic "something went wrong" toast — a user refused for holding their own
// edits was told nothing they could act on. Widening the render gate is what
// makes them reachable from a tap, so their copy is pinned here in the same
// change.
const KEYS = [
  'reextractSourceUnavailable',
  'reextractInProgress',
  'reextractHasContent',
  'reextractHasUserEdits',
  'reextractNotSingle',
] as const;

// Which codes must send the user to an UPLOAD, and which must not. The split is
// the point of having separate copy at all: two of these are dead ends where
// re-uploading is the only way forward, and three are not — telling a user to
// re-upload when another run holds the row, or when their own edits are being
// protected, would be actively wrong and would cost them a scan.
const MUST_SAY_UPLOAD = ['reextractSourceUnavailable', 'reextractNotSingle'] as const;
const MUST_NOT_SAY_UPLOAD = ['reextractInProgress', 'reextractHasContent', 'reextractHasUserEdits'] as const;

const cp = (s: string) => Array.from(s).map(c => c.codePointAt(0)!);

describe('re-extraction 409 copy', () => {
  it.each(LOCALES)('%s defines both keys, non-empty', locale => {
    for (const key of KEYS) {
      const value = (strings[locale] as Record<string, string>)[key];
      expect(typeof value, `${locale}.${key}`).toBe('string');
      expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
    }
  });

  it.each(LOCALES)('%s gives the two codes DIFFERENT wording', locale => {
    const table = strings[locale] as Record<string, string>;
    expect(table.reextractSourceUnavailable).not.toBe(table.reextractInProgress);
  });

  it.each(LOCALES)('%s tells every dead-end case to upload again', locale => {
    // The distinguishing obligation: this copy must point at a re-upload.
    // Checked per-locale by its own verb so it cannot pass on an English word
    // leaking into a translated string.
    const verb = { en: 'upload', fr: 'importer', ar: 'رفع' }[locale];
    for (const key of MUST_SAY_UPLOAD) {
      expect(
        (strings[locale] as Record<string, string>)[key].toLowerCase(),
        `${locale}.${key}`
      ).toContain(verb.toLowerCase());
    }
  });

  it.each(LOCALES)('%s does NOT tell the recoverable cases to upload again', locale => {
    // Re-uploading here would create a second row and charge a scan.
    const verb = { en: 'upload', fr: 'importer', ar: 'رفع' }[locale];
    for (const key of MUST_NOT_SAY_UPLOAD) {
      expect(
        (strings[locale] as Record<string, string>)[key].toLowerCase(),
        `${locale}.${key}`
      ).not.toContain(verb.toLowerCase());
    }
  });

  it.each(LOCALES)('%s gives all five codes DISTINCT wording', locale => {
    // A shared sentence across two codes is the same defect as no copy at all:
    // the user cannot tell which of two opposite things is being asked of them.
    const table = strings[locale] as Record<string, string>;
    const values = KEYS.map(k => table[k]);
    expect(new Set(values).size, `${locale} has duplicate re-extraction copy`).toBe(KEYS.length);
  });

  // ---- the bidi guard ----

  it.each(KEYS)('ar.%s contains no Latin letters (no bidi splice)', key => {
    const value = (strings.ar as Record<string, string>)[key];
    expect(value).not.toMatch(/[A-Za-z]/);
  });

  it.each(KEYS)('ar.%s contains no interpolation placeholder', key => {
    // No filename, no id. A Latin filename inside an Arabic sentence is the
    // exact bidi break ruled out in #118.
    const value = (strings.ar as Record<string, string>)[key];
    expect(value).not.toMatch(/\{|\}|\$\{/);
  });

  // ---- the code-point assertions ----

  it('ar.reextractSourceUnavailable matches the expected code points exactly', () => {
    const actual = (strings.ar as Record<string, string>).reextractSourceUnavailable;
    expect(cp(actual)).toEqual(cp(AR_SOURCE_FILE_UNAVAILABLE));
    expect(actual).toBe(AR_SOURCE_FILE_UNAVAILABLE);
  });

  it('ar.reextractInProgress matches the expected code points exactly', () => {
    const actual = (strings.ar as Record<string, string>).reextractInProgress;
    expect(cp(actual)).toEqual(cp(AR_REEXTRACTION_IN_PROGRESS));
    expect(actual).toBe(AR_REEXTRACTION_IN_PROGRESS);
  });

  it('ar.reextractHasContent matches the expected code points exactly', () => {
    const actual = (strings.ar as Record<string, string>).reextractHasContent;
    expect(cp(actual)).toEqual(cp(AR_HAS_CONTENT));
    expect(actual).toBe(AR_HAS_CONTENT);
  });

  it('ar.reextractHasUserEdits matches the expected code points exactly', () => {
    const actual = (strings.ar as Record<string, string>).reextractHasUserEdits;
    expect(cp(actual)).toEqual(cp(AR_HAS_USER_EDITS));
    expect(actual).toBe(AR_HAS_USER_EDITS);
  });

  it('ar.reextractNotSingle matches the expected code points exactly', () => {
    const actual = (strings.ar as Record<string, string>).reextractNotSingle;
    expect(cp(actual)).toEqual(cp(AR_NOT_SINGLE));
    expect(actual).toBe(AR_NOT_SINGLE);
  });

  it('every Arabic string starts with an Arabic-range code point, not a stray mark', () => {
    // A reversed paste typically ends up starting with the sentence-final '.'
    // (U+002E). Pin the first and last code points explicitly.
    for (const key of KEYS) {
      const points = cp((strings.ar as Record<string, string>)[key]);
      expect(points[0], `${key} first`).toBeGreaterThanOrEqual(0x0600);
      expect(points[0], `${key} first`).toBeLessThanOrEqual(0x06ff);
      expect(points[points.length - 1], `${key} last`).toBe(0x002e);
    }
  });
});
