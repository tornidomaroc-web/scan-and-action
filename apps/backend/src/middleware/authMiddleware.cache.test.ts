import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// A token seen within the last minute skips Supabase and the upsert.
// ============================================================================
// authContextCache.ts holds the measurement: every authenticated request
// paid the identity round trip and a User upsert with nested includes before
// its handler ran. This file pins what a hit skips, what a miss still does,
// and the two things that must end a hit early: the TTL and account deletion.
// Against the middleware without the cache, the first test fails (getUser is
// called twice).
// ============================================================================

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsert: vi.fn(),
  findUnique: vi.fn(),
  orgCreate: vi.fn(),
  membershipFindMany: vi.fn(),
  updateMany: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: h.getUser } }),
}));
vi.mock('../prismaClient', () => {
  const prisma: any = {
    user: { upsert: h.upsert, updateMany: h.updateMany, findUnique: h.findUnique },
    organization: { create: h.orgCreate },
    membership: { findMany: h.membershipFindMany },
  };
  prisma.$transaction = (fn: any) => fn(prisma);
  return { prisma };
});
vi.mock('../services/email/mailer', () => ({ sendTransactionalEmail: h.sendMail }));

import { authMiddleware } from './authMiddleware';
import { AUTH_CACHE_TTL_MS, clearAuthContextCache, invalidateUser } from './authContextCache';

const USER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const ORG = 'org-aaaa';
// A JWT-shaped token expiring far in the future, so only the TTL bounds the entry.
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `${b64({ alg: 'HS256' })}.${b64({ sub: USER, exp: 9_999_999_999 })}.sig`;

function run(token = TOKEN) {
  const req: any = { headers: { authorization: `Bearer ${token}` } };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  return authMiddleware(req, res, next).then(() => ({ req, res, next }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  clearAuthContextCache();
  h.getUser.mockResolvedValue({ data: { user: { id: USER, email: 'a@example.com' } }, error: null });
  h.upsert.mockResolvedValue({ id: USER, email: 'a@example.com', memberships: [{ organizationId: ORG }] });
});

describe('authMiddleware with the context cache', () => {
  it('the first request provisions as before; the second, same token, reaches the handler without Supabase or the upsert', async () => {
    const first = await run();
    expect(first.next).toHaveBeenCalledWith();
    expect(first.req.user).toEqual({ id: USER, email: 'a@example.com', organizationId: ORG });
    expect(h.getUser).toHaveBeenCalledTimes(1);
    expect(h.upsert).toHaveBeenCalledTimes(1);

    const second = await run();
    expect(second.next).toHaveBeenCalledWith();
    expect(second.req.user).toEqual({ id: USER, email: 'a@example.com', organizationId: ORG });
    expect(h.getUser).toHaveBeenCalledTimes(1);
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });

  it('a different token is a miss (control), and a rejected token is never cached', async () => {
    await run();
    await run(`${b64({ alg: 'HS256' })}.${b64({ sub: USER, exp: 9_999_999_999 })}.other`);
    expect(h.getUser).toHaveBeenCalledTimes(2);

    // A rejected token leaves nothing behind: the same bad token goes back to
    // Supabase every time (each call is answered by its own mock, so a cached
    // rejection or a cached acceptance would both change the count).
    h.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'invalid' } });
    const bad = await run('bad.token.here');
    expect(bad.res.status).toHaveBeenCalledWith(401);
    expect(bad.next).not.toHaveBeenCalled();
    h.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'invalid' } });
    const again = await run('bad.token.here');
    expect(again.res.status).toHaveBeenCalledWith(401);
    expect(again.next).not.toHaveBeenCalled();
    expect(h.getUser).toHaveBeenCalledTimes(4);
  });

  it('after the TTL the same token provisions again', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T00:00:00Z'));
    await run();
    vi.setSystemTime(new Date(Date.now() + AUTH_CACHE_TTL_MS));
    await run();
    expect(h.getUser).toHaveBeenCalledTimes(2);
    expect(h.upsert).toHaveBeenCalledTimes(2);
  });

  it('account deletion invalidates the user at once: the next request goes back to Supabase', async () => {
    await run();
    expect(invalidateUser(USER)).toBe(1);
    await run();
    expect(h.getUser).toHaveBeenCalledTimes(2);
  });
});
