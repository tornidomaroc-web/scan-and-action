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
