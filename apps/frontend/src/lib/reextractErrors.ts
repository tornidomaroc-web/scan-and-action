// ============================================================================
// The two re-extraction 409 codes, matched by EXACT code.
// ============================================================================
// POST /api/documents/:id/reextract answers 409 for two conditions that ask the
// user for opposite things:
//
//   SOURCE_FILE_UNAVAILABLE   the stored object is gone (documentController's
//                             download probe threw). Re-extraction can never
//                             succeed for this row, so the copy has to send the
//                             user to a re-upload — the only remaining path.
//   REEXTRACTION_IN_PROGRESS  the conditional claim matched nothing, i.e. the
//                             row already left FAILED because another run holds
//                             it. The user waits and does nothing. Telling them
//                             to re-upload here would be actively wrong: it
//                             would create a SECOND row and charge a scan.
//
// Same convention as lib/identityConflict.ts: services in this app throw
// `new Error(<server code>)`, so the code arrives as the Error's message, and
// the discrimination is by EXACT code — never by HTTP status. A bare 409 from a
// proxy, a 429 from the rate limiter, or a dropped socket is none of these and
// must keep the ordinary generic treatment.
// ============================================================================

export const SOURCE_FILE_UNAVAILABLE = 'SOURCE_FILE_UNAVAILABLE';
export const REEXTRACTION_IN_PROGRESS = 'REEXTRACTION_IN_PROGRESS';

const codeOf = (error: unknown): string | null => {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message: unknown }).message
      : error;
  return typeof message === 'string' ? message.trim().toUpperCase() : null;
};

/** The stored file is gone — re-uploading is the only path forward. */
export const isSourceFileUnavailable = (error: unknown): boolean =>
  codeOf(error) === SOURCE_FILE_UNAVAILABLE;

/** Another run already holds this document — wait, do not re-upload. */
export const isReextractionInProgress = (error: unknown): boolean =>
  codeOf(error) === REEXTRACTION_IN_PROGRESS;
