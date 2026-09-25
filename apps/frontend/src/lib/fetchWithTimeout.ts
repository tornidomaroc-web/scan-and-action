// ============================================================================
// A request that never settles leaves a screen on its skeleton forever.
// ============================================================================
// `fetch` has no timeout of its own. A suspended mobile tab, a carrier
// connection that drops without a reset, a proxy that holds the socket: each
// leaves the promise pending, and a screen whose loading state is "no data
// and no error yet" shows grey blocks until the user gives up. Seen by the
// owner on his iPhone on 2026-09-25 (ledger home and review queue), while the
// same requests completed in 2.8 s from a desktop.
//
// This races the fetch against a timer. On expiry the request is aborted AND
// the promise rejects with RequestTimeoutError on the timer's own authority:
// it does not wait for fetch to honour the abort, because a fetch that has
// already stopped answering is the case this exists for. `isRequestTimeout`
// lets a screen say "the server did not answer" and offer a retry instead of
// the generic failure copy. `AbortSignal.timeout` would be shorter, but it is
// missing from the WebKit versions still on phones, and the phone is exactly
// where this matters.
//
// Pure module: no import, so services and tests can load it without the
// Supabase client behind apiConfig.
// ============================================================================

/** Long enough for a slow backend (2.8 s measured), short enough that a person still waits. */
export const REQUEST_TIMEOUT_MS = 20_000;

export class RequestTimeoutError extends Error {
  readonly code = 'REQUEST_TIMEOUT';
  constructor(public readonly url: string, public readonly ms: number) {
    super(`REQUEST_TIMEOUT: no response from ${url} within ${ms}ms`);
    this.name = 'RequestTimeoutError';
  }
}

export const isRequestTimeout = (err: unknown): err is RequestTimeoutError =>
  err instanceof RequestTimeoutError || (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'REQUEST_TIMEOUT');

/**
 * `fetch(url, init)` that rejects with RequestTimeoutError when no response
 * headers have arrived within `ms`. The body read is the caller's, as before.
 */
export function fetchWithTimeout(url: string, init: RequestInit = {}, ms: number = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RequestTimeoutError(url, ms));
    }, ms);
  });
  const request = fetch(url, { ...init, signal: controller.signal });
  // Once the timer has won, the aborted fetch rejects on its own later; that
  // rejection is expected and must not surface as an unhandled one.
  request.catch(() => {});
  return Promise.race([request, expiry]).finally(() => clearTimeout(timer));
}
