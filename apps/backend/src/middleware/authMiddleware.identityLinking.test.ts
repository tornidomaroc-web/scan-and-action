import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Google and Apple sign-in (2026-09-26): what ensureUser sees, and why the
// P2002 create-path refusal (IDENTITY_EMAIL_CONFLICT, #147, #171) cannot be
// armed by it.
//
// The backend never sees a provider. It sees what every request has always
// carried: a Supabase uuid and an email, read from supabase.auth.getUser.
// Supabase's identity linking (docs, "auth-identity-linking": "If a match is
// found, the new identity is linked to the user") keeps the uuid of a user
// whose verified email matches, so the three shapes a social sign-in can
// produce are:
//
//   LINKED   an email-and-password user signs in with Google on the same
//            address: SAME uuid, SAME email. The upsert hits the update path
//            of the row that already exists. Nothing collides.
//
//   RELAY    a first Sign in with Apple with Hide My Email: NEW uuid, NEW
//            relay address (@privaterelay.appleid.com). The create path
//            succeeds; the row is a second, separate account, colliding with
//            no one.
//
//   MOVED    a provisioned user whose token email later changes into an
//            address another row holds: SAME uuid, OCCUPIED email. The #171
//            update path: session lives, mirror write declined. Restated
//            here so the linking file carries all three.
//
// And the control: the create-path refusal still stands for the one shape
// that is NOT social sign-in's, a NEW uuid whose address another row holds,
// which only a deleted identity with a surviving row can produce (#174).
//
// The store enforces the unique index on email, like the real one, so each
// outcome is a fact about the write, not about a mock.
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
import { clearAuthContextCache } from './authContextCache';

beforeEach(() => clearAuthContextCache());

const ID_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'; // an email-and-password user, provisioned
const ID_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'; // an ordinary second user
const ID_NEW = 'cccccccc-3333-4333-8333-cccccccccccc'; // a uuid no row has seen
const EMAIL_A = 'a@example.com';
const EMAIL_B = 'b@example.com';
const RELAY = 'k7q2m9xdz3@privaterelay.appleid.com';
const ORG_A = 'org-aaaa';
const ORG_B = 'org-bbbb';
const ORG_NEW = 'org-new';

function p2002(target: unknown) {
  return Object.assign(new Error(''), { code: 'P2002', meta: { modelName: 'User', target } });
}

function makeStore(seed: Array<{ id: string; email: string; org: string }>) {
  const byId = new Map<string, { id: string; email: string; memberships: any[] }>();
  const byEmail = new Map<string, string>();
  for (const r of seed) {
    byId.set(r.id, { id: r.id, email: r.email, memberships: [{ organizationId: r.org, organization: { id: r.org } }] });
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
let store: ReturnType<typeof makeStore>;

beforeEach(() => {
  vi.clearAllMocks();
  errorLog = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errorLog.push(a.map(String).join(' ')); });
  h.orgCreate.mockResolvedValue({ id: ORG_NEW });
  h.membershipFindMany.mockResolvedValue([]);
  h.updateMany.mockResolvedValue({ count: 1 });
  h.sendMail.mockResolvedValue({ ok: true });
  store = makeStore([
    { id: ID_A, email: EMAIL_A, org: ORG_A },
    { id: ID_B, email: EMAIL_B, org: ORG_B },
  ]);
  h.upsert.mockImplementation(store.upsert);
  h.findUnique.mockImplementation(store.findUnique);
});
afterEach(() => vi.restoreAllMocks());

describe('LINKED: a password user signs in with Google on the same address', () => {
  it('same uuid, same email: the existing row, its org, no lookup, no alert, no welcome mail', async () => {
    const { req, next } = await callAs(ID_A, EMAIL_A);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0].length).toBe(0);
    expect(req.user).toEqual({ id: ID_A, email: EMAIL_A, organizationId: ORG_A });

    // One write, on the row that was already there. No second row, no second org.
    expect(store.upsert).toHaveBeenCalledTimes(1);
    expect(store.byId.size).toBe(2);
    expect(h.orgCreate).not.toHaveBeenCalled();
    expect(store.findUnique).not.toHaveBeenCalled();
    expect(h.sendMail).not.toHaveBeenCalled();
    expect(errorLog.join('\n')).not.toContain('IDENTITY_EMAIL');
  });
});

describe('RELAY: a first Sign in with Apple with Hide My Email', () => {
  it('new uuid, relay address: provisions a fresh row and org; nothing existing is touched', async () => {
    const { req, next } = await callAs(ID_NEW, RELAY);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0].length).toBe(0);
    expect(req.user).toEqual({ id: ID_NEW, email: RELAY, organizationId: ORG_NEW });

    expect(store.byId.get(ID_NEW)).toMatchObject({ id: ID_NEW, email: RELAY });
    expect(store.byEmail.get(RELAY)).toBe(ID_NEW);
    expect(store.byId.get(ID_A)!.email).toBe(EMAIL_A);
    expect(store.byId.get(ID_B)!.email).toBe(EMAIL_B);
    expect(h.orgCreate).toHaveBeenCalledTimes(1);
    expect(errorLog.join('\n')).not.toContain('IDENTITY_EMAIL');
  });

  it('the relay address is written verbatim: no normalisation, no lookup by email anywhere', async () => {
    await callAs(ID_NEW, RELAY);
    const write = store.upsert.mock.calls[0][0];
    expect(write.where).toEqual({ id: ID_NEW });
    expect(write.create.email).toBe(RELAY);
    for (const call of store.findUnique.mock.calls) {
      expect(Object.keys(call[0].where)).toEqual(['id']);
    }
  });
});

describe('MOVED: a provisioned user whose token email is now an occupied address (#171)', () => {
  it('same uuid, occupied email: session continues, mirror write declined, alert without the holder', async () => {
    const { req, next } = await callAs(ID_A, EMAIL_B);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0].length).toBe(0);
    expect(req.user).toEqual({ id: ID_A, email: EMAIL_B, organizationId: ORG_A });
    expect(store.byId.get(ID_A)!.email).toBe(EMAIL_A);
    const alert = errorLog.find((l) => l.includes('IDENTITY_EMAIL_MIRROR_STALE'));
    expect(alert).toBeDefined();
    expect(alert).not.toContain(ID_B);
  });
});

describe('CONTROL: the shape social sign-in cannot produce is still refused', () => {
  it('new uuid, an address another row holds: IDENTITY_EMAIL_CONFLICT, and nothing is adopted', async () => {
    const { req, next } = await callAs(ID_NEW, EMAIL_A);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(IdentityEmailConflictError);
    expect(err.message).toBe('IDENTITY_EMAIL_CONFLICT');
    expect(req.user).toBeUndefined();
    expect(store.byId.has(ID_NEW)).toBe(false);
    expect(store.byEmail.get(EMAIL_A)).toBe(ID_A);
  });

  it('positive control: the store really rejects a second row on an address', async () => {
    await expect(store.upsert({ where: { id: ID_NEW }, update: { email: EMAIL_A }, create: { id: ID_NEW, email: EMAIL_A } }))
      .rejects.toMatchObject({ code: 'P2002' });
  });
});
