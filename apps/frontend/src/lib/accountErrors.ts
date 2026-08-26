import { IDENTITY_EMAIL_CONFLICT } from './identityConflict';

// Same local shape the other shared helpers use (see lib/uploadErrors.ts):
// strings.ts exports the values, not a type.
type Strings = Record<string, string>;

// ============================================================================
// Account-delete errors: raw API code -> translated, user-facing copy.
// ============================================================================
// DELETE /api/account fails in several shapes. Only THREE of them carry a machine
// code in `data.error`; the rest put English PROSE in that same field:
//
//   CONFIRMATION_REQUIRED  400  accountController.ts:38-41   <- code
//   SHARED_WORKSPACE       409  accountController.ts:69-73   <- code
//   IDENTITY_EMAIL_CONFLICT 409 accountController.ts:79-90   <- code
//   RATE_LIMITED           429  rateLimits.ts:8-11, :63-70   <- code
//   'Missing or malformed access token'      401  authMiddleware.ts:114  <- prose
//   'Unauthorized: Invalid or expired token' 401  authMiddleware.ts:130  <- prose
//   'Internal Server Error' / Prisma text    5xx  errorHandler.ts:16-48  <- prose
//
// Plus a seventh, non-HTTP shape: a dropped connection makes fetch reject with
// TypeError('Failed to fetch') — browser-generated, always English.
//
// ---------------------------------------------------------------------------
// DO NOT render the backend's prose. Ever. `data.error` is NOT always a code.
// ---------------------------------------------------------------------------
// This is a WHITELIST, and that is the whole point. Anything it does not
// recognise — an English sentence, a future enum, a network TypeError, an empty
// body — falls through to TRANSLATED generic copy. It never returns its input.
// That property is what closes the leak by construction, independently of what
// precedence accountService happens to use today (accountService.ts:19).
//
// The unmapped shapes get NO key deliberately: a 500 or an expired token has
// nothing useful and non-alarming to say to an end user, and errorHandler.ts
// already returns a correlation `errorId` for support to trace.
// ---------------------------------------------------------------------------

const CODE_TO_KEY: Record<string, string> = {
  // 409: the caller has no User row and this address is held by a different id,
  // so the controller refuses rather than report a deletion that would not
  // happen (accountController.ts:79-90). See lib/identityConflict.ts.
  //
  // MIS-SHAPED, DELIBERATELY, AND ONLY FOR NOW. accountLockedBody is written for
  // the lockout screen: every clause of it is TRUE here, and it is strictly
  // better than the deleteAccountError fallthrough it replaces ("Please try
  // again", which is the one thing that cannot work). But it never names the
  // deletion the user just asked for, and it sits above a still-enabled
  // "Permanently delete" button. The delete path should get its own string in
  // the deleteAccount* family; that needs approved Arabic and is not this PR.
  [IDENTITY_EMAIL_CONFLICT]: 'accountLockedBody',
  // 409: user shares an org with other members. Rare today — the product only
  // creates solo orgs — but the copy must still tell them what to do about it.
  SHARED_WORKSPACE: 'deleteAccountSharedWorkspace',
  // 429: 5 deletion attempts / hour, keyed per user.
  RATE_LIMITED: 'deleteAccountRateLimited',
  // 400: server-side defence-in-depth. Nearly unreachable from the UI, which
  // disables the button until the typed email matches (DeleteAccountModal.tsx:32).
  CONFIRMATION_REQUIRED: 'deleteAccountConfirmRequired',
};

/**
 * Translate a raw account-error code into user-facing copy.
 *
 * Unknown input (including the backend's English prose, bare HTTP failures, the
 * network TypeError and any future server enum) falls back to a TRANSLATED
 * generic message — never the raw code, never the server's words.
 */
export const translateAccountError = (code: string | null | undefined, s: Strings): string => {
  const key = code ? CODE_TO_KEY[code.trim().toUpperCase()] : undefined;
  const translated = key ? s[key] : undefined;
  return typeof translated === 'string' && translated ? translated : s.deleteAccountError;
};
