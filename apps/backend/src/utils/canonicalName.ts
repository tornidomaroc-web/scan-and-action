// ============================================================================
// Canonical entity-name transform — the ONE normalizer for the Entity matching
// key. Shared so the resolution LOOKUP and the WRITE agree (item B), and so the
// rule engine's duplicate check compares like-vs-like.
// ============================================================================
// This is the matching KEY, not a display name: it UPPERCASES and DELETES every
// character outside [A-Z0-9] and whitespace (accents, punctuation), then trims.
// It deliberately does NOT fold accents (é -> É -> stripped, not é -> e) — that
// is a different transform (utils/textMatch foldForMatch). The output here MUST
// stay byte-identical to what entityResolution wrote historically, because the
// existing stored canonicalName values (and the 86 production rows) were produced
// by exactly `name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim()`. Changing
// this format would orphan every existing row. The fix for the lookup/write
// mismatch is to make BOTH sides call this function — not to change the format.
//
// The human-readable name (casing + accents) lives in Entity.displayName /
// aliases[0]; this value is only ever used for matching / dedup.
//
// A NAME WITH NO LATIN LETTER (added 2026-10-05). The historical transform
// turns "新宇科技服務(股)公司", "伊神切手社" and "مقهى الأمل" into '' — or into a
// bare branch number, "محل رقم 5" into "5" — so every merchant printed only in
// Arabic, Chinese or Japanese resolved to ONE entity per organisation. Measured
// 2026-10-04: 9 of 9 all-CJK merchants in the Step 3 run showed as the first one
// uploaded (WORK-QUEUE.md). For such a name the key is built from the letters
// it actually has: NFKC (folds OCR presentation forms and full-width digits),
// upper-cased (Cyrillic and Greek fold case; Arabic and CJK are unchanged),
// tatweel and Arabic harakat dropped (one shop, printed plain or styled, is one
// key), then everything that is not a letter, a digit, a combining mark or
// whitespace deleted, whitespace collapsed.
//
// The branch is taken ONLY when the historical key holds no Latin letter AND
// the name holds a letter or digit from another script. So every name with a
// Latin letter — including "7-Eleven 新宿店", "Café Central" and the 152 stored
// rows (read 2026-10-05: 0 keys of digits alone, 1 empty) — keeps its key byte
// for byte, and a name of ASCII digits or symbols alone keeps the historical
// result too.

const HISTORICAL = (name: string): string => name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();

// U+0640 tatweel; U+064B..U+065F and U+0670 the Arabic harakat (fatha, damma,
// kasra, shadda, sukun, tanwin, dagger alif).
const ARABIC_STYLING = /[ـً-ٰٟ]/g;
// A letter or digit of any script, once the ASCII ones are taken out.
const hasNonLatinAlnum = (name: string): boolean => /[\p{L}\p{N}]/u.test(name.replace(/[A-Za-z0-9]/g, ''));

export const canonicalizeEntityName = (name: string | null | undefined): string => {
  if (!name) return '';
  const historical = HISTORICAL(name);
  if (/[A-Z]/.test(historical) || !hasNonLatinAlnum(name)) return historical;
  return name
    .normalize('NFKC')
    .toUpperCase()
    .replace(ARABIC_STYLING, '')
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
};
