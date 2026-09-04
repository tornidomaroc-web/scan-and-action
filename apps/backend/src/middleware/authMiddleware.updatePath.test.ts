import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// The UPDATE path of an email collision — a working session must not be killed
// ============================================================================
// `collidedOnUserEmail` cannot tell the two situations apart: the try wraps the
// whole upsert, so a P2002 from the INSERT and a P2002 from the UPDATE arrive
// identically, and the classifier reads only `err.meta.target`. Until this
// change both were treated as the permanent one.
//
//   CREATE path — no row for this id. Permanent, refuses. UNCHANGED, and
//     authMiddleware.identityConflict.test.ts is its guard.
//
//   UPDATE path — the row EXISTS. A provisioned account, working until this
//     request, whose token email changed into an address another row holds.
//     Refusing destroyed a live session and rendered terminal copy — "only our
//     team can fix it" — for a condition support has nothing to fix.
//
// THE ASSERTION THAT MATTERS MOST is that the split DISTINGUISHES rather than
// swallows. A change that returns the existing row when NO row exists would
// silently convert the create-path lockout — which is correct and deliberate —
// into a pass, and that is the worse failure of the two. `create path is
// untouched` below is what must go red for it.
//
// NO ORPHAN IS NEEDED HERE. The collidee is an ordinary second user. The
// backend cannot see whether a row's Supabase identity is still live, so the
// orphan requirement in production is a fact about how that database state is
// REACHED, not about the state itself — and it is the state these tests model.
//
// PRECONDITION OF OAUTH, NOT A BUG FIX. Nothing in the product changes a live
// user's email: the whole auth surface is signInWithPassword / signUp
// (AuthScreen.tsx:82,85) plus updateUser({ password }). Unreachable today.
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

import { authMiddleware, IdentityEmailConflictError } from './authMiddleware';

const ID_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'; // the caller, already provisioned
const ID_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'; // an ordinary second user
const EMAIL_A = 'a@example.com';
const EMAIL_B = 'b@example.com';
const ORG_A = 'org-aaaa';
const ORG_B = 'org-bbbb';

function p2002(target: unknown) {
  return Object.assign(new Error(''), {
    code: 'P2002',
    meta: { modelName: 'User', target },
  });
}

/**
 * A store that ENFORCES the unique index on email, so the collision under test
 * is a real one rather than an assertion about a mock. `upsert` keys on id, like
 * the real one, which is exactly why an existing row wanting an occupied address
 * has nowhere to go.
 */
function makeStore(seed: Array<{ id: string; email: string; org: string }>) {
  const byId = new Map<string, { id: string; email: string; memberships: any[] }>();
  const byEmail = new Map<string, string>();
  for (const r of seed) {
    byId.set(r.id, {
      id: r.id,
      email: r.email,
      memberships: [{ organizationId: r.org, organization: { id: r.org } }],
    });
    byEmail.set(r.email, r.id);
  }
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
        return existing;
      }
      if (byEmail.has(create.email)) throw p2002(['email']);
      const row = { id: create.id, email: create.email, memberships: [] as any[] };
      byId.set(row.id, row);
      byEmail.set(row.email, row.id);
      return row;
    }),
    findUnique: vi.fn(async ({ where }: any) => byId.get(where.id) ?? null),
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

async function callAs(id: string, email: string) {
  h.getUser.mockResolvedValue({ data: { user: { id, email } }, error: null });
  const { req, res, next } = makeReqRes();
  await authMiddleware(req, res, next);
  await flush();
  return { req, res, next };
}

let errorLog: string[];

beforeEach(() => {
  vi.clearAllMocks();
  errorLog = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errorLog.push(a.map(String).join(' '));
  });
  h.orgCreate.mockResolvedValue({ id: ORG_A });
  h.membershipFindMany.mockResolvedValue([]);
  h.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.restoreAllMocks());

describe('UPDATE path — the session lives and only the email write is declined', () => {
  it('a provisioned user whose address is taken keeps working', async () => {
    const store = makeStore([
      { id: ID_A, email: EMAIL_A, org: ORG_A },
      { id: ID_B, email: EMAIL_B, org: ORG_B },
    ]);
    h.upsert.mockImplementation(store.upsert);
    h.findUnique.mockImplementation(store.findUnique);

    // A's identity provider now reports B's address for A's uuid.
    const { req, next } = await callAs(ID_A, EMAIL_B);

    // The session continues: next() with NO error, and req.user is populated.
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0].length).toBe(0);
    expect(req.user).toEqual({ id: ID_A, email: EMAIL_B, organizationId: ORG_A });

    // The write was DECLINED, not applied and not partially applied.
    expect(store.byId.get(ID_A)!.email).toBe(EMAIL_A);
    expect(store.byEmail.get(EMAIL_A)).toBe(ID_A);
    // B is untouched — nothing was adopted, reassigned or overwritten.
    expect(store.byId.get(ID_B)!.email).toBe(EMAIL_B);
    expect(store.byEmail.get(EMAIL_B)).toBe(ID_B);
  });

  it('alerts, names the caller, and does NOT name or look up the holder', async () => {
    const store = makeStore([
      { id: ID_A, email: EMAIL_A, org: ORG_A },
      { id: ID_B, email: EMAIL_B, org: ORG_B },
    ]);
    h.upsert.mockImplementation(store.upsert);
    h.findUnique.mockImplementation(store.findUnique);

    await callAs(ID_A, EMAIL_B);

    const alert = errorLog.find((l) => l.includes('IDENTITY_EMAIL_MIRROR_STALE'));
    expect(alert).toBeDefined();
    expect(alert).toContain('[ALERT]');
    expect(alert).toContain(ID_A);
    // The holder's id is deliberately absent: naming it needs a read BY EMAIL,
    // which is the first step of adopting and is never done on a request.
    expect(alert).not.toContain(ID_B);
    for (const call of store.findUnique.mock.calls) {
      expect(call[0].where).toEqual({ id: ID_A });
    }
    // And it must NOT be reported as the terminal condition.
    expect(errorLog.join(' ')).not.toContain('IDENTITY_EMAIL_CONFLICT');
  });

  it('returns the row with memberships loaded, so downstream still resolves an org', async () => {
    const store = makeStore([
      { id: ID_A, email: EMAIL_A, org: ORG_A },
      { id: ID_B, email: EMAIL_B, org: ORG_B },
    ]);
    h.upsert.mockImplementation(store.upsert);
    h.findUnique.mockImplementation(store.findUnique);

    const { req } = await callAs(ID_A, EMAIL_B);

    // The include on the guard's findUnique must match the upsert's, or this is
    // undefined and every request 500s instead of being served.
    //
    // ASSERTED ON THE CALL ARGS, not just on the outcome. The store's findUnique
    // ignores `include` — it returns whatever it holds — so dropping the include
    // from the production code would still satisfy the outcome assertion below
    // and survive a mutation pass unnoticed. This pins the argument itself.
    expect(store.findUnique.mock.calls[0][0].include).toEqual({
      memberships: { include: { organization: true } },
    });
    expect(req.user.organizationId).toBe(ORG_A);
    expect(h.orgCreate).not.toHaveBeenCalled(); // not re-provisioned
    expect(h.sendMail).not.toHaveBeenCalled(); // and not re-welcomed
  });
});

describe('the split DISTINGUISHES — it must not swallow the create path', () => {
  it('create path is untouched: no row for this id still refuses', async () => {
    // THE MUTATION TARGET. Returning the existing row when there is none would
    // convert a correct, deliberate lockout into a silent pass. This is what has
    // to go red for that change.
    const store = makeStore([{ id: ID_B, email: EMAIL_B, org: ORG_B }]);
    h.upsert.mockImplementation(store.upsert);
    h.findUnique.mockImplementation(store.findUnique);

    // A live identity with NO row, whose address is held by B.
    const { req, next } = await callAs(ID_A, EMAIL_B);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(IdentityEmailConflictError);
    expect(err.status).toBe(409);
    expect(err.message).toBe('IDENTITY_EMAIL_CONFLICT');
    expect(req.user).toBeUndefined();

    // Nothing was provisioned and nothing was adopted.
    expect(store.byId.has(ID_A)).toBe(false);
    expect(store.byEmail.get(EMAIL_B)).toBe(ID_B);
    expect(h.orgCreate).not.toHaveBeenCalled();
    expect(errorLog.join(' ')).toContain('IDENTITY_EMAIL_CONFLICT');
    expect(errorLog.join(' ')).not.toContain('IDENTITY_EMAIL_MIRROR_STALE');
  });

  it('positive control: the store really does reject the write under test', async () => {
    // Prove the detector. Without this, a green update-path result cannot be
    // distinguished from a fixture whose upsert never collides at all.
    const store = makeStore([
      { id: ID_A, email: EMAIL_A, org: ORG_A },
      { id: ID_B, email: EMAIL_B, org: ORG_B },
    ]);
    await expect(
      store.upsert({ where: { id: ID_A }, update: { email: EMAIL_B }, create: {} })
    ).rejects.toMatchObject({ code: 'P2002', meta: { target: ['email'] } });
    // …and does NOT reject when the address is free.
    await expect(
      store.upsert({ where: { id: ID_A }, update: { email: 'free@example.com' }, create: {} })
    ).resolves.toMatchObject({ id: ID_A });
  });
});

describe('cost — the extra query happens only on the path that needs it', () => {
  it('no lookup at all when the upsert succeeds', async () => {
    h.upsert.mockResolvedValue({ id: ID_A, email: EMAIL_A, memberships: [{ organizationId: ORG_A }] });

    const { next } = await callAs(ID_A, EMAIL_A);

    expect(next.mock.calls[0].length).toBe(0);
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('no lookup on an id collision — the race path is untouched', async () => {
    // THE OTHER REGRESSION GUARD. An `id` collision is the provisioning race and
    // must still be retried, never routed through the new branch.
    h.upsert
      .mockRejectedValueOnce(p2002(['id']))
      .mockResolvedValueOnce({ id: ID_A, email: EMAIL_A, memberships: [{ organizationId: ORG_A }] });

    const { req, next } = await callAs(ID_A, EMAIL_A);

    expect(h.upsert).toHaveBeenCalledTimes(2);
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(next.mock.calls[0].length).toBe(0);
    expect(req.user).toEqual({ id: ID_A, email: EMAIL_A, organizationId: ORG_A });
  });

  it('exactly one lookup on the email-collision path, and it is not retried', async () => {
    const store = makeStore([
      { id: ID_A, email: EMAIL_A, org: ORG_A },
      { id: ID_B, email: EMAIL_B, org: ORG_B },
    ]);
    h.upsert.mockImplementation(store.upsert);
    h.findUnique.mockImplementation(store.findUnique);

    await callAs(ID_A, EMAIL_B);

    expect(h.upsert).toHaveBeenCalledTimes(1); // not three attempts
    expect(h.findUnique).toHaveBeenCalledTimes(1);
  });
});
