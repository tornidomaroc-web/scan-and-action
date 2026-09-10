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

//   DOCUMENT_HAS_CONTENT      the row already holds extracted content, so
//                             re-extracting would overwrite it. Nothing is
//                             wrong and there is nothing to retry.
//   DOCUMENT_HAS_USER_EDITS   the row carries the user's OWN corrections. Same
//                             shape, and the one the user most needs told
//                             apart: the refusal is protecting their work.
//   DOCUMENT_NOT_SINGLE       the image was set aside as more than one
//                             document. Re-processing cannot help — the fix is
//                             to upload the pages separately — so this copy,
//                             like SOURCE_FILE_UNAVAILABLE, points at an upload.
//
// These three were reachable from the server before the button was, and each
// fell through to the generic "something went wrong" toast: a user refused for
// holding their own edits was told nothing they could act on. Widening the
// render gate is what makes them reachable from a tap, so the copy lands in the
// same change rather than after it.

export const SOURCE_FILE_UNAVAILABLE = 'SOURCE_FILE_UNAVAILABLE';
export const REEXTRACTION_IN_PROGRESS = 'REEXTRACTION_IN_PROGRESS';
export const DOCUMENT_HAS_CONTENT = 'DOCUMENT_HAS_CONTENT';
export const DOCUMENT_HAS_USER_EDITS = 'DOCUMENT_HAS_USER_EDITS';
export const DOCUMENT_NOT_SINGLE = 'DOCUMENT_NOT_SINGLE';

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

/** The row already holds extracted content — nothing to recover. */
export const isDocumentHasContent = (error: unknown): boolean =>
  codeOf(error) === DOCUMENT_HAS_CONTENT;

/** The row carries the user's own edits — the refusal is protecting them. */
export const isDocumentHasUserEdits = (error: unknown): boolean =>
  codeOf(error) === DOCUMENT_HAS_USER_EDITS;

/** Set aside as more than one document — upload the pages separately. */
export const isDocumentNotSingle = (error: unknown): boolean =>
  codeOf(error) === DOCUMENT_NOT_SINGLE;
