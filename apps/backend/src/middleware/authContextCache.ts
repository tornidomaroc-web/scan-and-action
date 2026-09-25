import { createHash } from 'crypto';

// ============================================================================
// The request context, remembered for a minute per access token.
// ============================================================================
// Measured on 2026-09-25 against production from a signed-in browser: every
// authenticated request answered in 1.75 to 2.5 s to first byte whatever it
// returned (stats, 420 bytes: 1.75 s), while the unauthenticated /api/version
// answered in 0.15 to 0.2 s. A database statement costs ~126 ms of network
// round trip and under 1 ms of execution (EXPLAIN ANALYZE), and before any
// handler runs the middleware spends one Supabase Auth call plus a User
// upsert with nested includes, i.e. several sequential statements, on EVERY
// request. Repeat requests within a minute, which is what a person tapping
// through the app produces, resolve here instead.
//
// What a hit skips: supabase.auth.getUser, ensureUser, ensureOrganization.
// What it cannot skip: the first request per token per minute, which still
// provisions and updates the email as before.
//
// Bound on staleness: an entry lives at most TTL_MS, and never past the
// token's own `exp`. A token revoked by sign-out is therefore honoured within
// a minute, and account deletion clears the user's entries at once
// (invalidateUser, called by AccountController.deleteAccount).
//
// Keyed by a SHA-256 of the token, so no bearer token sits in process memory.
// Per process, unshared: a second instance starts cold, which only costs it
// the first request per token.
// ============================================================================

export interface AuthContext {
  id: string;
  email: string;
  organizationId: string;
}

export const AUTH_CACHE_TTL_MS = 60_000;
export const AUTH_CACHE_MAX_ENTRIES = 2_000;

const entries = new Map<string, { ctx: AuthContext; expiresAt: number }>();

const keyOf = (token: string) => createHash('sha256').update(token).digest('hex');

/** The token's `exp` in ms, read without verification: it only bounds the cache, never grants access. */
export function tokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function getCachedAuthContext(token: string, now: number = Date.now()): AuthContext | null {
  const key = keyOf(token);
  const entry = entries.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    entries.delete(key);
    return null;
  }
  return entry.ctx;
}

export function cacheAuthContext(token: string, ctx: AuthContext, now: number = Date.now()): void {
  const exp = tokenExpiryMs(token);
  const expiresAt = Math.min(now + AUTH_CACHE_TTL_MS, exp ?? Number.POSITIVE_INFINITY);
  if (expiresAt <= now) return;
  if (entries.size >= AUTH_CACHE_MAX_ENTRIES) {
    // Map iterates in insertion order: the oldest entry goes first.
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
  entries.set(keyOf(token), { ctx, expiresAt });
}

export function invalidateUser(userId: string): number {
  let removed = 0;
  for (const [key, entry] of entries) {
    if (entry.ctx.id === userId) {
      entries.delete(key);
      removed++;
    }
  }
  return removed;
}

export function clearAuthContextCache(): void {
  entries.clear();
}

export const authContextCacheSize = () => entries.size;
