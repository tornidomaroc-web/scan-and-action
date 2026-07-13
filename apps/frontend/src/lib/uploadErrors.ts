// Same local shape the other shared helpers use (see lib/searchResultCard.ts):
// strings.ts exports the values, not a type.
type Strings = Record<string, string>;

// ============================================================================
// Upload errors: raw API code -> translated, user-facing copy.
// ============================================================================
// The upload endpoint fails with a machine code in `data.error`
// (`LIMIT_REACHED`, `DAILY_LIMIT_REACHED`, ...), which `uploadService` throws as
// the Error message. Components keep that RAW CODE in state (the gating logic
// keys off it); this helper is the single place it becomes words.
//
// ---------------------------------------------------------------------------
// DO NOT render the backend's `message` field. Ever.
// ---------------------------------------------------------------------------
// The API's LIMIT_REACHED response also carries:
//     message: 'Free plan limit reached (10 scans). Please upgrade to PRO.'
// `uploadService` ignores it only because `data.error` takes precedence. That
// precedence is load-bearing: "Please upgrade to PRO" is upsell copy, and this
// text renders inside the NATIVE app, where steering users to a non-Play payment
// flow is grounds for removal from Google Play. Swapping the code for the
// backend `message` would look like a friendlier error and would be a policy
// breach — and the anti-steering tests, which assert on prices and CTAs, would
// NOT catch that sentence. Map codes to OUR strings, or fall back to a
// translated generic. Never pass the server's prose through.
// ---------------------------------------------------------------------------

const CODE_TO_KEY: Record<string, string> = {
  // FREE plan, 10-scan lifetime cap.
  LIMIT_REACHED: 'freePlanLimitReached',
  // PRO plan, rolling 200/day safety cap. Neutral copy, no upsell: a PRO user has
  // nothing to upgrade to.
  DAILY_LIMIT_REACHED: 'dailyLimitReached',
};

/**
 * Translate a raw upload-error code into user-facing copy.
 *
 * Unknown codes (including bare HTTP failures and any future server enum) fall
 * back to a TRANSLATED generic message — never the raw code, never the server's
 * `message` field.
 */
export const translateUploadError = (code: string | null | undefined, s: Strings): string => {
  const key = code ? CODE_TO_KEY[code.trim().toUpperCase()] : undefined;
  const translated = key ? s[key] : undefined;
  return typeof translated === 'string' && translated ? translated : s.uploadFailedGeneric;
};
