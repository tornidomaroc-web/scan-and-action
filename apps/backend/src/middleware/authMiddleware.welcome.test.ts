import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Wire up mocks for everything authMiddleware + welcomeEmail touch. The REAL
// authMiddleware and REAL sendWelcomeEmailOnce run; only the boundaries
// (Supabase auth, Prisma, the mailer HTTP call) are faked.
const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsert: vi.fn(),
  orgCreate: vi.fn(),
  updateMany: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: h.getUser } }),
}));

vi.mock('../prismaClient', () => ({
  prisma: {
    user: { upsert: h.upsert, updateMany: h.updateMany },
    organization: { create: h.orgCreate },
  },
}));

vi.mock('../services/email/mailer', () => ({
  sendTransactionalEmail: h.sendMail,
}));

import { authMiddleware } from './authMiddleware';

const USER_ID = '7f1e2d3c-4b5a-4678-9abc-def012345678';
const EMAIL = 'new.user@example.com';
const ORG_ID = 'org-1234';

const flush = () => new Promise((r) => setImmediate(r));

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
  h.orgCreate.mockResolvedValue({ id: ORG_ID });
  h.updateMany.mockResolvedValue({ count: 1 });
  h.sendMail.mockResolvedValue({ status: 'sent', id: 'resend-id' });
  // Welcome sending is default-off; these tests exercise the ENABLED path.
  process.env.WELCOME_EMAIL_ENABLED = 'true';
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WELCOME_EMAIL_ENABLED;
});

describe('authMiddleware — welcome email wiring', () => {
  it('first-time user (zero memberships): provisions, claims, and sends — auth succeeds', async () => {
    h.upsert.mockResolvedValue({ id: USER_ID, email: EMAIL, memberships: [] });
    const { req, res, next } = makeReqRes();

    await authMiddleware(req, res, next);
    await flush();

    expect(h.orgCreate).toHaveBeenCalledTimes(1);
    expect(h.updateMany).toHaveBeenCalledTimes(1);
    expect(h.sendMail).toHaveBeenCalledTimes(1);
    expect(h.sendMail.mock.calls[0][0].to).toBe(EMAIL);
    // Auth proceeded normally.
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
    expect(req.user).toEqual({ id: USER_ID, email: EMAIL, organizationId: ORG_ID });
  });

  it('existing user (has a membership): never claims, never sends — auth succeeds', async () => {
    h.upsert.mockResolvedValue({
      id: USER_ID,
      email: EMAIL,
      memberships: [{ organizationId: ORG_ID, organization: { id: ORG_ID } }],
    });
    const { req, res, next } = makeReqRes();

    await authMiddleware(req, res, next);
    await flush();

    expect(h.orgCreate).not.toHaveBeenCalled();
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.sendMail).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
    expect(req.user.organizationId).toBe(ORG_ID);
  });

  it('auth succeeds even when the mailer returns failed', async () => {
    h.upsert.mockResolvedValue({ id: USER_ID, email: EMAIL, memberships: [] });
    h.sendMail.mockResolvedValue({ status: 'failed', error: 'Resend HTTP 500' });
    const { req, res, next } = makeReqRes();

    await authMiddleware(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
    expect(req.user.organizationId).toBe(ORG_ID);
  });

  it('auth succeeds even when the mailer returns skipped (no RESEND_API_KEY)', async () => {
    h.upsert.mockResolvedValue({ id: USER_ID, email: EMAIL, memberships: [] });
    h.sendMail.mockResolvedValue({ status: 'skipped', reason: 'RESEND_API_KEY not configured' });
    const { req, res, next } = makeReqRes();

    await authMiddleware(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('race loser (claim returns 0 rows): provisioning still ok, no send', async () => {
    h.upsert.mockResolvedValue({ id: USER_ID, email: EMAIL, memberships: [] });
    h.updateMany.mockResolvedValue({ count: 0 });
    const { req, res, next } = makeReqRes();

    await authMiddleware(req, res, next);
    await flush();

    expect(h.updateMany).toHaveBeenCalledTimes(1);
    expect(h.sendMail).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('kill switch held (WELCOME_EMAIL_ENABLED unset): provisioning ok, no claim, no send', async () => {
    delete process.env.WELCOME_EMAIL_ENABLED;
    h.upsert.mockResolvedValue({ id: USER_ID, email: EMAIL, memberships: [] });
    const { req, res, next } = makeReqRes();

    await authMiddleware(req, res, next);
    await flush();

    // Org is still provisioned and auth still succeeds...
    expect(h.orgCreate).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
    expect(req.user.organizationId).toBe(ORG_ID);
    // ...but the welcome path is fully held: no claim burned, no send.
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.sendMail).not.toHaveBeenCalled();
  });
});
