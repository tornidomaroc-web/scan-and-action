import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// IDENTITY_EMAIL_CONFLICT — classifying WHICH unique constraint a P2002 hit
// ============================================================================
// Production, 2026-08-24, errorId d7ff1eba-967e-4ec8-a053-23c34790d790:
//
//   [API Error] [d7ff1eba-…] DELETE /api/account name=PrismaClientKnownRequestError
//   code=P2002 meta.modelName=User meta.target=email
//   message=Invalid `prisma.user.upsert()` invocation:
//   Unique constraint failed on the fields: (`email`)
//
// A live Supabase identity (c521aa92-…) authenticated while a DIFFERENT User row
// (1e1c8482-…) held its verified address. `ensureUser` keys on id, so the upsert
// missed forever and the create violated User.email forever: three attempts, then
// throw. Every authenticated route failed for that identity, for over an hour.
//
// The fixtures below are shaped from that observed line, not invented. Note the
// two spellings: `meta.target=email` renders identically for the string 'email'
// and the array ['email'] (redaction.ts:118-121 joins them the same way), so the
// log CANNOT tell us which the engine sent. Both are pinned here.
//
// THE ASSERTION THAT MATTERS MOST is not that an email collision is caught — it
// is that an `id` collision is STILL retried and still recovers. Conflating the
// two would silently break the provisioning race, which is what makes the
// dashboard render a full-screen connection error on brand-new accounts.
// authMiddleware.race.test.ts is the guard for that and must stay green.
// ============================================================================

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
  prisma.$transaction = (fn: any) => fn(prisma);
  return { prisma };
});

vi.mock('../services/email/mailer', () => ({ sendTransactionalEmail: h.sendMail }));

import { authMiddleware, IdentityEmailConflictError } from './authMiddleware';

const USER_ID = 'c521aa92-0f4d-4b82-821a-b9e8c0c6f7ae'; // the live identity
const EMAIL = 'someone@example.com';
const ORG_ID = 'org-1234';

/** A P2002 shaped like Prisma's PrismaClientKnownRequestError. */
function p2002(target: unknown, extraMeta: Record<string, unknown> = {}) {
  return Object.assign(new Error(''), {
    code: 'P2002',
    meta: { modelName: 'User', target, ...extraMeta },
  });
}
/** A P2002 with no meta at all — the shape the log could not rule out. */
function p2002NoMeta() {
  return Object.assign(new Error(''), { code: 'P2002' });
}

function makeReqRes() {
  const req: any = { headers: { authorization: 'Bearer token-abc' } };
  const res: any = {
    statusCode: 0,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  const next = vi.fn();
  return { req, res, next };
}

const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: EMAIL } }, error: null });
});
afterEach(() => vi.restoreAllMocks());

describe('ensureUser — an email collision is refused, not retried and not adopted', () => {
  for (const [label, target] of [
    ['array  ["email"]', ['email']],
    ['string  "email"', 'email'],
    ['constraint name  ["User_email_key"]', ['User_email_key']],
    ['mixed case  ["Email"]', ['Email']],
  ] as Array<[string, unknown]>) {
    it(`refuses on ${label}`, async () => {
      h.upsert.mockRejectedValue(p2002(target));
      const { req, res, next } = makeReqRes();

      await authMiddleware(req, res, next);
      await flush();

      // Forwarded to the error handler as a typed 409 — not a bare 401, not a 500.
      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(IdentityEmailConflictError);
      expect(err.status).toBe(409);
      // errorHandler returns `err.message` as the response `error` field, so the
      // message IS the machine code the client whitelist keys on.
      expect(err.message).toBe('IDENTITY_EMAIL_CONFLICT');

      // NOT retried: three attempts against a permanent constraint buy only latency.
      expect(h.upsert).toHaveBeenCalledTimes(1);
      // NOT adopted: nothing was provisioned and no existing row was attached.
      expect(h.orgCreate).not.toHaveBeenCalled();
      expect(h.membershipFindMany).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });
  }

  it('never reads the other row — no lookup by email happens anywhere', async () => {
    h.upsert.mockRejectedValue(p2002(['email']));
    const { req, res, next } = makeReqRes();
    await authMiddleware(req, res, next);
    await flush();
    // The mocked client exposes only upsert/updateMany on `user`. If the code had
    // reached for findUnique/findFirst by email — the first step of adopting — it
    // would throw "not a function" and this test would fail rather than pass.
    expect(next.mock.calls[0][0]).toBeInstanceOf(IdentityEmailConflictError);
  });
});

describe('ensureUser — everything that is NOT an email collision keeps today\'s behaviour', () => {
  it('id collision: still retried, still recovers, no conflict error', async () => {
    // THE REGRESSION GUARD. Lose the insert race on the primary key once, then
    // succeed on the retry's UPDATE path — exactly as before this change.
    h.upsert
      .mockRejectedValueOnce(p2002(['id']))
      .mockResolvedValueOnce({ id: USER_ID, email: EMAIL, memberships: [{ organizationId: ORG_ID }] });
    const { req, res, next } = makeReqRes();

    await authMiddleware(req, res, next);
    await flush();

    expect(h.upsert).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0].length).toBe(0); // next() with no error
    expect(req.user).toEqual({ id: USER_ID, email: EMAIL, organizationId: ORG_ID });
  });

  it('absent meta: falls back to today\'s behaviour exactly (retry x3, then throw)', async () => {
    h.upsert.mockRejectedValue(p2002NoMeta());
    const { req, res, next } = makeReqRes();

    await authMiddleware(req, res, next);
    await flush();

    expect(h.upsert).toHaveBeenCalledTimes(3); // MAX_PROVISION_ATTEMPTS
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err).not.toBeInstanceOf(IdentityEmailConflictError);
    expect(err.code).toBe('P2002');
  });

  for (const [label, target] of [
    ['unknown field  ["slug"]', ['slug']],
    ['non-string  [42]', [42]],
    ['nested  [["email"]]', [['email']]],
    ['object  {field:"email"}', { field: 'email' }],
    ['null', null],
    ['empty array', []],
  ] as Array<[string, unknown]>) {
    it(`unknown target shape (${label}) falls back to retry, never to refusal`, async () => {
      h.upsert.mockRejectedValue(p2002(target));
      const { req, res, next } = makeReqRes();

      await authMiddleware(req, res, next);
      await flush();

      expect(h.upsert).toHaveBeenCalledTimes(3);
      expect(next.mock.calls[0][0]).not.toBeInstanceOf(IdentityEmailConflictError);
    });
  }

  it('a non-P2002 error is still rethrown untouched on the first attempt', async () => {
    const other = Object.assign(new Error('boom'), { code: 'P2024' });
    h.upsert.mockRejectedValue(other);
    const { req, res, next } = makeReqRes();

    await authMiddleware(req, res, next);
    await flush();

    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBe(other);
  });
});

// ---------------------------------------------------------------------------
// The code has to survive the error handler to be worth throwing.
// ---------------------------------------------------------------------------
// errorHandler returns `err.message` as the response `error` field for any
// non-500, so the class's message IS the wire code. Without this the middleware
// could throw a perfectly typed error that reaches the client as a bare 500
// "Internal Server Error" and tells nobody anything.
import { errorHandler } from './errorHandler';

describe('IdentityEmailConflictError reaches the client as a coded 409', () => {
  it('errorHandler emits status 409 with error=IDENTITY_EMAIL_CONFLICT and an errorId', () => {
    const { res } = makeReqRes();
    const req: any = { method: 'DELETE', originalUrl: '/api/account' };

    errorHandler(new IdentityEmailConflictError(), req, res, vi.fn());

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('IDENTITY_EMAIL_CONFLICT');
    expect(typeof res.body.errorId).toBe('string');
    // Not a 5xx, so it must not be reported to Sentry and must not be masked
    // into the generic "Internal Server Error" tail.
    expect(res.body.error).not.toBe('Internal Server Error');
  });
});
