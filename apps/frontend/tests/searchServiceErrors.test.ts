import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// searchService: what kind of failure it throws, from what actually happened.
// ============================================================================
// The screen test mocks this service away, so the classification it depends
// on is pinned here, with only `fetch` stubbed: a rejected fetch is a
// NetworkError, a response with a bad status is an HttpStatusError carrying the
// server's code, and a timeout stays a timeout. The 404 case is the response
// production gave the #250 preview on 2026-09-25: an Express HTML page,
// "Cannot GET /api/search", with no JSON body.
// ============================================================================

vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

import { searchService } from '../src/services/searchService';
import { HttpStatusError, NetworkError, isConnectionFailure } from '../src/lib/requestErrors';
import { RequestTimeoutError, isRequestTimeout } from '../src/lib/fetchWithTimeout';
import { isIdentityConflict } from '../src/lib/identityConflict';

const params = { q: 'pizza', category: null, month: null };
const fail = () => searchService.searchReceipts(params, 'UTC').then(() => { throw new Error('resolved'); }, (e: unknown) => e);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('searchService failures', () => {
  it('the 404 production gave the preview is a status, not a connection failure', async () => {
    fetchMock.mockResolvedValue(new Response('<!DOCTYPE html><pre>Cannot GET /api/search</pre>', { status: 404, headers: { 'content-type': 'text/html' } }));
    const err = await fail();
    expect(err).toBeInstanceOf(HttpStatusError);
    expect((err as HttpStatusError).status).toBe(404);
    expect((err as Error).message).toBe('HTTP_404');
    expect(isConnectionFailure(err)).toBe(false);
  });

  it('a 500 with a JSON code keeps the code as the message', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'INTERNAL' }), { status: 500 }));
    const err = await fail();
    expect(err).toBeInstanceOf(HttpStatusError);
    expect((err as Error).message).toBe('INTERNAL');
    expect(isConnectionFailure(err)).toBe(false);
  });

  it('the lockout code still reads as the lockout', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'IDENTITY_EMAIL_CONFLICT' }), { status: 409 }));
    expect(isIdentityConflict(await fail())).toBe(true);
  });

  it('a rejected fetch (Safari "Load failed") is a connection failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Load failed'));
    const err = await fail();
    expect(err).toBeInstanceOf(NetworkError);
    expect(isConnectionFailure(err)).toBe(true);
  });

  it('a timeout stays a timeout, and is a connection failure', async () => {
    vi.useFakeTimers();
    fetchMock.mockReturnValue(new Promise(() => {}));
    const pending = fail();
    await vi.advanceTimersByTimeAsync(20_001);
    const err = await pending;
    expect(err).toBeInstanceOf(RequestTimeoutError);
    expect(isRequestTimeout(err)).toBe(true);
    expect(isConnectionFailure(err)).toBe(true);
  });

  it('control: a 200 resolves, so the stub reaches the service', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ mode: 'recent', receipts: [] }), { status: 200 }));
    await expect(searchService.searchReceipts(params, 'UTC')).resolves.toEqual({ mode: 'recent', receipts: [] });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/search?tz=UTC&q=pizza');
  });
});
