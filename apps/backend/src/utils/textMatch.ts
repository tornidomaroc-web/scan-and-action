// ============================================================================
// Accent-insensitive, word-boundary-aware keyword matching for the rules engine
// and expense categorization.
// ============================================================================
// Two bugs motivated this shared helper (deferred item C):
//   1. Diacritics: merchant names / summaries were only `.toLowerCase()`'d, so a
//      merchant literally named "Café" never matched the ASCII keyword "cafe".
//   2. Unbounded substrings: naive `.includes()` let short keywords match inside
//      unrelated words — 'bar' in "Barber", 'pub' in "Publix" (a grocery),
//      'deli' in "Delivery". Those are false positives.
//
// SCOPE BOUNDARY (deliberate, do NOT treat as an oversight): NFD folding handles
// LATIN diacritics only (é→e, ê→e, à→a, ñ→n, …). It does NOT transliterate other
// scripts — an Arabic-script merchant name will not match the English keyword
// lists regardless of this helper. Cross-script matching is out of scope here.
//
// TRADE-OFF (word-boundary matching): matching is whole-token / whole-phrase, so
// a keyword fused into a single token is intentionally NOT matched — e.g. the
// keyword 'pizza' matches "corner pizza place" but not the single OCR token
// "PIZZAHUT". This is the only rule that consistently rejects the prefix false
// positives above (there is no lexical way to accept "pizzahut" while rejecting
// "barber" — both are keyword-as-prefix). Prefer spaced/punctuated occurrences,
// which real OCR text and merchant names overwhelmingly provide.

/**
 * Fold a string for accent-insensitive, case-insensitive matching: decompose to
 * NFD, strip combining diacritical marks (U+0300–U+036F), lowercase, and trim.
 * Null/undefined/empty are safe and return ''.
 */
export const foldForMatch = (s: string | null | undefined): string => {
  if (!s) return '';
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
};

/** Split already-folded text into alphanumeric word tokens (drops punctuation). */
const tokenize = (folded: string): string[] => folded.split(/[^a-z0-9]+/).filter(Boolean);

/**
 * True when `text` contains `keyword` as a whole word (single-token keyword) or a
 * contiguous whole-word phrase (multi-word keyword such as 'uber eats' /
 * 'fast food' / 'booking.com'). Both sides are folded, so accents and case never
 * cause a miss, and word boundaries prevent 'bar' matching "barber".
 */
export const matchesKeyword = (text: string | null | undefined, keyword: string): boolean => {
  const tokens = tokenize(foldForMatch(text));
  const kw = tokenize(foldForMatch(keyword));
  if (tokens.length === 0 || kw.length === 0) return false;

  if (kw.length === 1) return tokens.includes(kw[0]);

  // Multi-word keyword: find its token sequence as a contiguous run in `tokens`.
  for (let i = 0; i + kw.length <= tokens.length; i++) {
    let matched = true;
    for (let j = 0; j < kw.length; j++) {
      if (tokens[i + j] !== kw[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
};

/** True when `text` matches ANY of `keywords` (accent- and boundary-aware). */
export const matchesAnyKeyword = (text: string | null | undefined, keywords: string[]): boolean =>
  keywords.some((keyword) => matchesKeyword(text, keyword));
