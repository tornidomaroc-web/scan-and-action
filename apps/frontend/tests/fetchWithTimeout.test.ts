import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// A request that never settles becomes an error after 20 s.
// ============================================================================
// Against 8f4052b this file fails: `getMonth`, `getReviewQueue` and `getStats`
// with a fetch that never resolves never reject, and there is no helper. The
// owner saw the consequence on his iPhone on 2026-09-25: grey blocks with no
// way out. The screen half is tests/requestTimeout.test.tsx.
// ============================================================================

const sb = vi.hoisted(() => ({ getSession: vi.fn(async () => ({ data: { session: null } })) }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: sb } }));

import { fetchWithTimeout, isRequestTimeout, RequestTimeoutError, REQUEST_TIMEOUT_MS, withTimeout } from '../src/lib/fetchWithTimeout';
import { ledgerService } from '../src/services/ledgerService';
import { documentService } from '../src/services/documentService';
import { getAuthHeaders, SESSION_TIMEOUT_MS } from '../src/services/apiConfig';

/** A fetch double that ignores its abort signal, as a hung connection effectively does. */
const never = () => new Promise<Response>(() => {});

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('fetchWithTimeout', () => {
  it('rejects with a RequestTimeoutError once the timer expires and nothing has answered, even if fetch ignores the abort', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(never as any);
    const p = fetchWithTimeout('https://api.example/ledger', {}, 20_000);
    const settled = vi.fn();
    p.then(settled, settled);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const err = await p.catch(e => e);
    expect(err).toBeInstanceOf(RequestTimeoutError);
    expect(err).toMatchObject({ code: 'REQUEST_TIMEOUT', url: 'https://api.example/ledger', ms: 20_000 });
    expect(isRequestTimeout(err)).toBe(true);
  });

  it('passes the abort signal to fetch and aborts it on expiry, so a live request is really cancelled', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(never as any);
    const p = fetchWithTimeout('https://api.example/x', { headers: { Authorization: 'Bearer t' } }, 1_000);
    p.catch(() => {});
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toEqual({ Authorization: 'Bearer t' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect((init.signal as AbortSignal).aborted).toBe(true);
  });

  it('a response in time is returned unchanged and clears the timer; a real network error keeps its identity (controls)', async () => {
    const res = new Response('{"ok":true}', { status: 200 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(res);
    await expect(fetchWithTimeout('https://api.example/y', {}, 1_000)).resolves.toBe(res);
    expect(vi.getTimerCount()).toBe(0);
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const err = await fetchWithTimeout('https://api.example/z', {}, 1_000).catch(e => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(isRequestTimeout(err)).toBe(false);
  });

  it('the default is 20 s', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(20_000);
  });
});

describe('the session read in front of every request is bounded too', () => {
  it(`getAuthHeaders rejects as a timeout after ${SESSION_TIMEOUT_MS} ms when getSession never settles`, async () => {
    sb.getSession.mockImplementationOnce(() => new Promise(() => {}) as any);
    const p = getAuthHeaders();
    const settled = vi.fn();
    p.then(settled, settled);
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const err = await p.catch(e => e);
    expect(isRequestTimeout(err)).toBe(true);
    expect(err).toMatchObject({ url: 'auth session', ms: SESSION_TIMEOUT_MS });
  });

  it('a session that arrives in time yields the bearer header (control), and withTimeout keeps a fast value', async () => {
    sb.getSession.mockResolvedValueOnce({ data: { session: { access_token: 'tok' } } } as any);
    await expect(getAuthHeaders()).resolves.toEqual({ Authorization: 'Bearer tok' });
    await expect(withTimeout(Promise.resolve(42), 1_000, 'x')).resolves.toBe(42);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the ledger, queue and stats reads carry the timeout', () => {
  for (const [name, call] of [
    ['ledgerService.getMonth', () => ledgerService.getMonth('2026-09', 'UTC')],
    ['documentService.getReviewQueue', () => documentService.getReviewQueue()],
    ['documentService.getStats', () => documentService.getStats()],
  ] as const) {
    it(`${name}: a fetch that never settles rejects as a timeout after ${REQUEST_TIMEOUT_MS} ms`, async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(never as any);
      const p = call();
      const settled = vi.fn();
      p.then(settled, settled);
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      const err = await p.catch(e => e);
      expect(isRequestTimeout(err)).toBe(true);
    });
  }
});
