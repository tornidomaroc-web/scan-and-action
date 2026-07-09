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

export const canonicalizeEntityName = (name: string | null | undefined): string => {
  if (!name) return '';
  return name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
};
