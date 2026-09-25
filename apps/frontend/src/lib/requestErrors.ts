// ============================================================================
// What failed: the connection, or the server's answer.
// ============================================================================
// "Connection interrupted" is a claim about the phone's connection. It is true
// when no response arrived at all: `fetch` rejected (Safari says "Load failed",
// Chrome "Failed to fetch", both a TypeError) or the timer in
// fetchWithTimeout.ts won. It is FALSE for any response with a status: a 404
// from a route the backend does not serve yet, a 401, a 500. Those arrived over
// a working connection, and telling the user to check it sends them to fix the
// one thing that is not broken. Seen by the owner on 2026-09-25: the #250
// preview's Search showed "Connection interrupted" for a 404
// "Cannot GET /api/search".
//
// A service wraps its fetch in `fetchOrNetworkError` and throws
// `HttpStatusError` for a response that is not ok; a screen asks
// `isConnectionFailure` and picks its copy. HttpStatusError keeps the server's
// code as its message, so isIdentityConflict (lib/identityConflict.ts) reads
// it exactly as it read the plain Error before.
//
// Pure module: no import, so tests can load it without the Supabase client.
// ============================================================================

/** No response arrived: the request never reached the server, or its answer never came back. */
export class NetworkError extends Error {
  readonly code = 'NETWORK_ERROR';
  constructor(public readonly url: string, cause: unknown) {
    super(`NETWORK_ERROR: no response from ${url}`);
    this.name = 'NetworkError';
    (this as { cause?: unknown }).cause = cause;
  }
}

/** A response arrived, with a status that is not ok. The message is the server's code when it sent one. */
export class HttpStatusError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpStatusError';
  }
}

const hasCode = (err: unknown, code: string) =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === code;

/**
 * `fetch(...)` whose rejection becomes a NetworkError, except a timeout, which
 * keeps its own RequestTimeoutError so a screen can still say "20 seconds".
 */
export async function fetchOrNetworkError(url: string, request: () => Promise<Response>): Promise<Response> {
  try {
    return await request();
  } catch (err) {
    if (hasCode(err, 'REQUEST_TIMEOUT')) throw err;
    throw new NetworkError(url, err);
  }
}

/** True only when no response arrived: a network failure or a timeout. Never for a status. */
export const isConnectionFailure = (err: unknown): boolean =>
  err instanceof NetworkError || hasCode(err, 'NETWORK_ERROR') || hasCode(err, 'REQUEST_TIMEOUT');
