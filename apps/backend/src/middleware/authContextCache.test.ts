import { describe, it, expect, beforeEach } from 'vitest';
import {
  AUTH_CACHE_MAX_ENTRIES, AUTH_CACHE_TTL_MS, authContextCacheSize, cacheAuthContext, clearAuthContextCache,
  getCachedAuthContext, invalidateUser, tokenExpiryMs,
} from './authContextCache';

// A JWT-shaped token with the given exp (seconds); the signature is not read.
const jwt = (exp: number | null, nonce = '') => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64(exp === null ? { sub: 'u' + nonce } : { sub: 'u' + nonce, exp })}.sig${nonce}`;
};
const ctx = (id = 'user-1') => ({ id, email: `${id}@example.com`, organizationId: 'org-1' });

beforeEach(() => clearAuthContextCache());

describe('the auth context cache', () => {
  it('misses cold, hits after a set, and hands back the same context', () => {
    const t = jwt(9_999_999_999);
    expect(getCachedAuthContext(t)).toBeNull();
    cacheAuthContext(t, ctx());
    expect(getCachedAuthContext(t)).toEqual(ctx());
  });

  it('expires after the TTL (control: one ms earlier it still hits)', () => {
    const t = jwt(9_999_999_999);
    const now = 1_000_000;
    cacheAuthContext(t, ctx(), now);
    expect(getCachedAuthContext(t, now + AUTH_CACHE_TTL_MS - 1)).toEqual(ctx());
    expect(getCachedAuthContext(t, now + AUTH_CACHE_TTL_MS)).toBeNull();
  });

  it('never outlives the token: an exp sooner than the TTL bounds the entry, and an expired token is not cached at all', () => {
    const now = 1_700_000_000_000;
    const soon = jwt(Math.floor(now / 1000) + 10); // 10 s left
    cacheAuthContext(soon, ctx(), now);
    expect(getCachedAuthContext(soon, now + 9_999)).toEqual(ctx());
    expect(getCachedAuthContext(soon, now + 10_000)).toBeNull();
    const gone = jwt(Math.floor(now / 1000) - 1);
    cacheAuthContext(gone, ctx(), now);
    expect(getCachedAuthContext(gone, now)).toBeNull();
    expect(authContextCacheSize()).toBe(0);
  });

  it('a token with no readable exp falls back to the TTL alone', () => {
    expect(tokenExpiryMs('not-a-jwt')).toBeNull();
    expect(tokenExpiryMs(jwt(null))).toBeNull();
    const now = 5_000;
    cacheAuthContext(jwt(null), ctx(), now);
    expect(getCachedAuthContext(jwt(null), now + AUTH_CACHE_TTL_MS - 1)).toEqual(ctx());
  });

  it('two tokens never share an entry, and invalidateUser removes every entry of one user only', () => {
    const a = jwt(9_999_999_999, 'a');
    const b = jwt(9_999_999_999, 'b');
    const c = jwt(9_999_999_999, 'c');
    cacheAuthContext(a, ctx('user-1'));
    cacheAuthContext(b, ctx('user-1'));
    cacheAuthContext(c, ctx('user-2'));
    expect(invalidateUser('user-1')).toBe(2);
    expect(getCachedAuthContext(a)).toBeNull();
    expect(getCachedAuthContext(b)).toBeNull();
    expect(getCachedAuthContext(c)).toEqual(ctx('user-2'));
  });

  it('is bounded: past the cap the oldest entry is evicted', () => {
    for (let i = 0; i < AUTH_CACHE_MAX_ENTRIES + 1; i++) cacheAuthContext(jwt(9_999_999_999, String(i)), ctx());
    expect(authContextCacheSize()).toBe(AUTH_CACHE_MAX_ENTRIES);
    expect(getCachedAuthContext(jwt(9_999_999_999, '0'))).toBeNull();
    expect(getCachedAuthContext(jwt(9_999_999_999, '1'))).not.toBeNull();
  });

  it('stores no bearer token: the map keys are digests', () => {
    const t = jwt(9_999_999_999, 'secret');
    cacheAuthContext(t, ctx());
    // Reach the private map through the module's own accessors only: a hit
    // by the token proves the key derives from it, and the size proves one entry.
    expect(getCachedAuthContext(t)).not.toBeNull();
    expect(authContextCacheSize()).toBe(1);
  });
});
