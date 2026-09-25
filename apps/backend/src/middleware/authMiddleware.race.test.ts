import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Concurrency tests for the just-in-time provisioning path in authMiddleware.
// The REAL authMiddleware runs; only its boundaries (Supabase auth, Prisma,
// the mailer) are faked. The Prisma mock models an interactive $transaction by
// passing the same mock client through as the `tx` handle, so a nested
// organization.create inside prisma.$transaction(...) routes to h.orgCreate.
const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsert: vi.fn(),
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
    user: { upsert: h.upsert, updateMany: h.updateMany },
    organization: { create: h.orgCreate },
    membership: { findMany: h.membershipFindMany },
  };
  // Interactive transaction: hand the same client back as the tx handle.
  prisma.$transaction = (fn: any) => fn(prisma);
  return { prisma };
});

vi.mock('../services/email/mailer', () => ({
  sendTransactionalEmail: h.sendMail,
}));

import { authMiddleware } from './authMiddleware';

const USER_ID = '7f1e2d3c-4b5a-4678-9abc-def012345678';
const EMAIL = 'new.user@example.com';
const WINNER_ORG_ID = 'winner-org-1234';

const flush = () => new Promise((r) => setImmediate(r));

// A P2002 unique-constraint error shaped like Prisma's
// PrismaClientKnownRequestError (the middleware keys off `.code`).
function p2002(target: string) {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target: [target] },
  });
}

function makeReqRes() {
  const req: any = { headers: { authorization: 'Bearer token-abc' } };
  const res: any = {
    statusCode: 0,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
  const next = vi.fn();
  return { req, res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: EMAIL } }, error: null });
  h.updateMany.mockResolvedValue({ count: 1 });
  h.sendMail.mockResolvedValue({ status: 'sent', id: 'resend-id' });
  // Enable the welcome path so that any WRONG send on the race-loser path would
  // be caught by the "no send" assertions below.
  process.env.WELCOME_EMAIL_ENABLED = 'true';
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WELCOME_EMAIL_ENABLED;
});

describe('authMiddleware — provisioning race recovery', () => {
  it('org race loser (organization.create → P2002): recovers winner org, succeeds, no 401/409, no welcome', async () => {
    // Brand-new user, zero memberships → enters provisioning branch.
    h.upsert.mockResolvedValue({ id: USER_ID, email: EMAIL, memberships: [] });
    // We lose the race: the org slug already exists.
    h.orgCreate.mockRejectedValue(p2002('slug'));
    // Re-fetch finds the membership the winner already created.
    h.membershipFindMany.mockResolvedValue([
      { organizationId: WINNER_ORG_ID, organization: { id: WINNER_ORG_ID } },
    ]);
    const { req, res, next } = makeReqRes();

    await authMiddleware(req, res, next);
    await flush();

    // Request proceeds with the winner's org — NOT a 401 and NOT a 409.
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0].length).toBe(0); // next() with no error arg
    expect(res.statusCode).toBe(0);
    expect(req.user).toEqual({ id: USER_ID, email: EMAIL, organizationId: WINNER_ORG_ID });
    // The loser must NOT send the welcome email (the winner provisions + sends).
    expect(h.sendMail).not.toHaveBeenCalled();
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it('org race: P2002 but re-fetch keeps returning empty → bounded retry then next(error), not 401', async () => {
    h.upsert.mockResolvedValue({ id: USER_ID, email: EMAIL, memberships: [] });
    h.orgCreate.mockRejectedValue(p2002('slug'));
    h.membershipFindMany.mockResolvedValue([]); // winner's tx never becomes visible
    const { req, res, next } = makeReqRes();

    await authMiddleware(req, res, next);
    await flush();

    // Fails cleanly via the error handler, NOT a misleading 401.
    expect(res.statusCode).toBe(0);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toMatch(/invalid or expired token/i);
    // Bounded: a finite number of create attempts (no infinite loop).
    expect(h.orgCreate.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(h.orgCreate.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('user.upsert race loser (P2002 once) recovers by retry, then succeeds', async () => {
    // First upsert loses the insert race; retry sees the row and returns it.
    h.upsert
      .mockRejectedValueOnce(p2002('id'))
      .mockResolvedValue({
        id: USER_ID,
        email: EMAIL,
        memberships: [{ organizationId: WINNER_ORG_ID, organization: { id: WINNER_ORG_ID } }],
      });
    const { req, res, next } = makeReqRes();

    await authMiddleware(req, res, next);
    await flush();

    expect(h.upsert).toHaveBeenCalledTimes(2);
    expect(h.orgCreate).not.toHaveBeenCalled(); // already has a membership after recovery
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0].length).toBe(0);
    expect(res.statusCode).toBe(0);
    expect(req.user.organizationId).toBe(WINNER_ORG_ID);
  });

  it('generic/transient error in the try block → next(error), NOT a blanket 401', async () => {
    const transient = new Error('ECONNRESET: connection reset by peer'); // no Prisma code
    h.upsert.mockRejectedValue(transient);
    const { req, res, next } = makeReqRes();

    await authMiddleware(req, res, next);
    await flush();

    // Honest error propagation to the global errorHandler — not "invalid token".
    expect(res.statusCode).toBe(0);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(transient);
  });

  it('still returns a real 401 for a genuinely invalid/expired token (no next(error))', async () => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } });
    const { req, res, next } = makeReqRes();

    await authMiddleware(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized: Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });
});
