import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// IDENTITY_EMAIL_MISSING — an identity with no address is refused, not defaulted
// ============================================================================
// `User.email` is `String @unique` and NOT NULL (schema.prisma:14). The line
// this file guards used to be `user.email || ''`, which wrote the empty string
// into that unique column — so EXACTLY ONE account in the system could ever hold
// "no email". The first emailless identity provisions normally. The SECOND
// violates `user_email_key`, gets classified by `collidedOnUserEmail` as an
// identity conflict, and is locked out permanently: a brand-new user, no orphan
// row for an operator to point at, and terminal copy telling them only support
// can help.
//
// THE ASSERTION THAT MATTERS MOST is the SECOND identity, not the first. One
// emailless user is legal today and a test that passes with one proves nothing.
// `refuses the SECOND emailless identity` below drives two DIFFERENT uuids
// through a store that actually enforces the unique index, and it is paired with
// a POSITIVE CONTROL that makes the same store reject that same pair — so a
// green result cannot come from a fixture that simply never collides.
//
// UNREACHABLE TODAY. The only auth surface is signInWithPassword / signUp
// (AuthScreen.tsx:82,85); neither can produce an identity without an address.
// This is a precondition of phone auth, anonymous sign-in, or any OAuth provider
// configured without an email scope — not a fix for a live defect.
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

import {
  authMiddleware,
  IdentityEmailConflictError,
  IdentityEmailMissingError,
} from './authMiddleware';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const REAL_EMAIL = 'someone@example.com';
const ORG_ID = 'org-1234';

/** A P2002 shaped like Prisma's PrismaClientKnownRequestError. */
function p2002(target: unknown) {
  return Object.assign(new Error(''), {
    code: 'P2002',
    meta: { modelName: 'User', target },
  });
}

/**
 * An upsert backed by a store that ENFORCES the unique index on email, so a
 * collision here is a real collision and not an assertion about a mock. Keyed on
 * id like the real `ensureUser`, which is precisely why a second row wanting the
 * same address has nowhere to go.
 */
function makeUniqueEmailStore() {
  const byId = new Map<string, { id: string; email: string }>();
  const byEmail = new Map<string, string>();
  return {
    byId,
    byEmail,
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const existing = byId.get(where.id);
      if (existing) {
        const holder = byEmail.get(update.email);
        if (holder !== undefined && holder !== existing.id) throw p2002(['email']);
        byEmail.delete(existing.email);
        existing.email = update.email;
        byEmail.set(update.email, existing.id);
        return { ...existing, memberships: [] };
      }
      if (byEmail.has(create.email)) throw p2002(['email']);
      const row = { id: create.id, email: create.email };
      byId.set(row.id, row);
      byEmail.set(row.email, row.id);
      return { ...row, memberships: [] };
    }),
  };
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

/** Drive one authenticated request for `identity` and return what next() got. */
async function callAs(identity: Record<string, unknown>) {
  h.getUser.mockResolvedValue({ data: { user: identity }, error: null });
  const { req, res, next } = makeReqRes();
  await authMiddleware(req, res, next);
  await flush();
  return { req, res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.findUnique.mockResolvedValue(null); // no row: the CREATE path
  h.orgCreate.mockResolvedValue({ id: ORG_ID });
  h.membershipFindMany.mockResolvedValue([]);
  h.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.restoreAllMocks());

describe('IDENTITY_EMAIL_MISSING — nothing is written for an identity with no address', () => {
  for (const [label, email] of [
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['tab and newline', '\t\n'],
  ] as Array<[string, unknown]>) {
    it(`refuses email: ${label}`, async () => {
      const { req, next } = await callAs({ id: ID_A, email });

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(IdentityEmailMissingError);
      expect(err.status).toBe(403);
      expect(err.message).toBe('IDENTITY_EMAIL_MISSING');

      // THE POINT OF THE WHOLE CHANGE: the unique column is never touched.
      expect(h.upsert).not.toHaveBeenCalled();
      expect(h.orgCreate).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });
  }

  it('is NOT the terminal code — the client must not lock the account', async () => {
    // lib/identityConflict.ts treats IDENTITY_EMAIL_CONFLICT as final and stops
    // offering a retry. This condition has a different remedy (sign in with an
    // address), so borrowing that code would render "only our team can fix it"
    // to someone who can fix it themselves. Distinctness is load-bearing.
    const { next } = await callAs({ id: ID_A, email: '' });
    const err = next.mock.calls[0][0];
    expect(err).not.toBeInstanceOf(IdentityEmailConflictError);
    expect(err.message).not.toBe('IDENTITY_EMAIL_CONFLICT');
    expect(err.status).not.toBe(409);
  });
});

describe('the SECOND emailless identity — the assertion that actually matters', () => {
  it('positive control: this store really does reject two rows sharing an address', async () => {
    // Prove the detector before believing what it reports. Without this, a green
    // result below is indistinguishable from a fixture that can never collide.
    const store = makeUniqueEmailStore();
    const args = (id: string) => ({
      where: { id },
      update: { email: '' },
      create: { id, email: '', preferredLanguage: 'en' },
    });

    await expect(store.upsert(args(ID_A))).resolves.toMatchObject({ id: ID_A });
    await expect(store.upsert(args(ID_B))).rejects.toMatchObject({
      code: 'P2002',
      meta: { target: ['email'] },
    });
  });

  it('refuses the SECOND emailless identity, and the store stays empty', async () => {
    const store = makeUniqueEmailStore();
    h.upsert.mockImplementation(store.upsert);

    const first = await callAs({ id: ID_A, email: undefined });
    const second = await callAs({ id: ID_B, email: undefined });
    const firstErr = first.next.mock.calls[0][0];
    const secondErr = second.next.mock.calls[0][0];

    // THE SECOND IS ASSERTED FIRST, DELIBERATELY. Under the pre-fix line the
    // first identity provisions cleanly and only the second collides, so an
    // assertion that starts with the first aborts before reaching the case this
    // test exists for — and the failure output would name the wrong identity.
    // Ordered this way, removing the guard reports exactly what B received.
    expect(secondErr).toBeInstanceOf(IdentityEmailMissingError);
    expect(secondErr).not.toBeInstanceOf(IdentityEmailConflictError);
    expect(secondErr.message).toBe('IDENTITY_EMAIL_MISSING');

    // The first is refused too — one emailless account is legal today, and this
    // change deliberately stops allowing even that one, so it must be asserted
    // rather than assumed.
    expect(firstErr).toBeInstanceOf(IdentityEmailMissingError);

    // Neither reached the column, so the collision proven above never arises.
    expect(h.upsert).not.toHaveBeenCalled();
    expect(store.byId.size).toBe(0);
    expect(store.byEmail.size).toBe(0);
  });
});

describe('everything else keeps behaviour exactly as it is today', () => {
  it('a real address is written through UNTRIMMED and provisions normally', async () => {
    h.upsert.mockResolvedValue({ id: ID_A, email: REAL_EMAIL, memberships: [] });

    const { req, next } = await callAs({ id: ID_A, email: REAL_EMAIL });

    expect(h.upsert).toHaveBeenCalledTimes(1);
    const arg = h.upsert.mock.calls[0][0];
    expect(arg.update).toEqual({ email: REAL_EMAIL });
    expect(arg.create).toMatchObject({ id: ID_A, email: REAL_EMAIL });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0].length).toBe(0); // next() with no error
    expect(req.user).toEqual({ id: ID_A, email: REAL_EMAIL, organizationId: ORG_ID });
  });

  it('an address with surrounding whitespace is NOT normalised on the way in', async () => {
    // The guard trims only to TEST emptiness. Trimming the stored value would be
    // a genuine change on the next request for any row created before it, and a
    // genuine change is the only thing that can make the update path collide.
    const padded = `  ${REAL_EMAIL}  `;
    h.upsert.mockResolvedValue({ id: ID_A, email: padded, memberships: [] });

    await callAs({ id: ID_A, email: padded });

    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.upsert.mock.calls[0][0].update).toEqual({ email: padded });
  });

  it('IDENTITY_EMAIL_CONFLICT still fires for a real address held by another id', async () => {
    // THE REGRESSION GUARD. The new branch runs before ensureUser and must not
    // shadow, weaken or rename the terminal condition that already exists.
    h.upsert.mockRejectedValue(p2002(['email']));

    const { next } = await callAs({ id: ID_A, email: REAL_EMAIL });

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(IdentityEmailConflictError);
    expect(err.status).toBe(409);
    expect(err.message).toBe('IDENTITY_EMAIL_CONFLICT');
    expect(err).not.toBeInstanceOf(IdentityEmailMissingError);
  });

  it('an invalid token is still a bare 401, not the new refusal', async () => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } });
    const { req, res, next } = makeReqRes();
    await authMiddleware(req, res, next);
    await flush();

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
