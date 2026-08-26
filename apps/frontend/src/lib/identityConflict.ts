// ============================================================================
// IDENTITY_EMAIL_CONFLICT — the one server code that is TERMINAL for the client.
// ============================================================================
// The backend raises it from two guarded refusals, never from a recoverable
// state:
//
//   authMiddleware.ts:119-126   provisioning found User.email held by a
//                               different id, and REFUSES to adopt that row.
//                               Reaches the client as 409 via errorHandler.ts:74-75.
//   accountController.ts:79-90  delete-account found no User row for the caller
//                               but the address is held by someone else, so it
//                               refuses rather than report a deletion that would
//                               not happen. Returns 409 directly.
//
// Both are decisions, not failures. Neither self-heals: clearing the condition
// is an operator action against the orphaned row. That is what makes a retry
// provably futile here, and it is why the UI may treat this ONE code as final
// while leaving every other failure exactly as retryable as it is today.
//
// The discrimination is by EXACT code, never by status. A bare 409 with no code
// — a proxy's own conflict page, a future unrelated 409 — is NOT this condition
// and must keep the ordinary retryable treatment.
// ============================================================================

export const IDENTITY_EMAIL_CONFLICT = 'IDENTITY_EMAIL_CONFLICT';

/**
 * Is this thrown value the identity-conflict lockout?
 *
 * Services in this app throw `new Error(<server code>)` (documentService.ts,
 * accountService.ts:31), so the code arrives as the Error's message. The
 * argument is `unknown` because a catch block can receive anything; the value is
 * read only to compare, and never reaches any return.
 */
export const isIdentityConflict = (error: unknown): boolean => {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message: unknown }).message
      : error;
  return typeof message === 'string' && message.trim().toUpperCase() === IDENTITY_EMAIL_CONFLICT;
};
