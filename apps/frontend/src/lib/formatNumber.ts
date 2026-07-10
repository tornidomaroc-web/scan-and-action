// ============================================================================
// Locale-aware integer grouping for plain counts (KPI numbers, breakdown counts).
// ============================================================================
// Follows the item-D convention: the BARE language subtag ('en' | 'fr' | 'ar')
// from useLanguage() is passed straight to Intl — never a region qualifier, never
// a numberingSystem. On the bare 'ar' subtag Intl emits LATIN digits (matching how
// amounts already render via searchResultCard's formatCurrency), so this localizes
// the GROUP SEPARATOR only (e.g. fr "1 234" with a narrow no-break space), not the
// digits. Values under 1000 are unchanged in every language (no separator).
//
// Honesty rule: a non-finite value (NaN / Infinity / null / undefined) returns ''
// rather than a fabricated "NaN" — the caller renders nothing instead of garbage.
export const formatCount = (value: number, language: string): string => {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat(language || 'en').format(value);
};

// ============================================================================
// Locale-aware percent rendering (KPI confidence, trend chip, breakdown rows).
// ============================================================================
// Takes a RATIO (0.98), never a percentage number (98) — the same contract as
// Intl's own `style: 'percent'`, which multiplies by 100. A caller holding an
// integer percentage must divide by 100 at the call site; that division is
// deliberately explicit, because silently accepting both shapes is how a 80
// becomes "8,000%".
//
// Localizes the decimal separator AND the locale's percent-sign spacing
// (fr renders "96,4 %" with a narrow no-break space before the sign). Same
// bare-subtag convention as formatCount: on 'ar' Intl emits LATIN digits, so
// this changes separators and sign placement only, never the digits.
//
// `signDisplay: 'exceptZero'` makes the FORMATTER emit the leading "+", so the
// sign localizes with the number instead of being concatenated by hand.
//
// Honesty rule (matches formatCount): a non-finite value returns '' rather than
// a fabricated "NaN%" — the caller renders nothing instead of garbage.
export const formatPercent = (
  ratio: number,
  language: string,
  opts?: { fractionDigits?: number; signDisplay?: 'auto' | 'exceptZero' },
): string => {
  if (!Number.isFinite(ratio)) return '';
  const digits = opts?.fractionDigits ?? 0;
  return new Intl.NumberFormat(language || 'en', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    ...(opts?.signDisplay ? { signDisplay: opts.signDisplay } : {}),
  }).format(ratio);
};
