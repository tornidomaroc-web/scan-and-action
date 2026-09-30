import { describe, it, expect, vi, beforeEach } from 'vitest';
import { format } from 'node:util';

// ============================================================================
// DELETE /api/account and Sign in with Apple revocation. What is pinned: the
// revocation runs after every refusal and before anything is destroyed; a
// failed, unconfigured or skipped revocation never blocks the deletion and
// is reported in the response; the code never reaches a log line.
// ============================================================================

vi.mock('../src/prismaClient', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(async () => null) },
    document: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (cb: any) =>
      cb({
        queryLog: { deleteMany: vi.fn() },
        documentEntity: { deleteMany: vi.fn() },
        entity: { deleteMany: vi.fn() },
        organization: { deleteMany: vi.fn() },
        user: { deleteMany: vi.fn() },
      })
    ),
  },
}));
vi.mock('../src/services/accountDeletionService', () => ({
  deleteStorageObjects: vi.fn(async () => {}),
  deleteAuthUser: vi.fn(async () => {}),
  hasAppleIdentity: vi.fn(async () => false),
}));
vi.mock('../src/services/appleRevocationService', () => ({
  revokeAppleAuthorization: vi.fn(async () => ({ ok: true })),
  appleRevocationConfigured: vi.fn(() => true),
}));
vi.mock('../src/middleware/authContextCache', () => ({ invalidateUser: vi.fn() }));

import { prisma } from '../src/prismaClient';
import { AccountController } from '../src/controllers/accountController';
import { deleteAuthUser, deleteStorageObjects, hasAppleIdentity } from '../src/services/accountDeletionService';
import { revokeAppleAuthorization, appleRevocationConfigured } from '../src/services/appleRevocationService';

const USER_ID = '7f1e2d3c-4b5a-4678-9abc-def012345678';
const EMAIL = 'apple-user@example.com';
const CODE = 'c0de.from.the.sheet.XYZ';
const soloUser = { id: USER_ID, email: EMAIL, memberships: [{ organizationId: 'org-1', organization: { _count: { members: 1 } } }] };

const req = (body: Record<string, unknown>) => ({ user: { id: USER_ID, email: EMAIL }, body }) as any;
const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};
const order: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  (prisma.user.findUnique as any).mockResolvedValue(soloUser);
  (hasAppleIdentity as any).mockResolvedValue(true);
  (appleRevocationConfigured as any).mockReturnValue(true);
  (revokeAppleAuthorization as any).mockImplementation(async () => { order.push('revoke'); return { ok: true }; });
  (deleteStorageObjects as any).mockImplementation(async () => { order.push('storage'); });
  (deleteAuthUser as any).mockImplementation(async () => { order.push('auth'); });
  (prisma.$transaction as any).mockImplementation(async (cb: any) => {
    order.push('db');
    return cb({ queryLog: { deleteMany: vi.fn() }, documentEntity: { deleteMany: vi.fn() }, entity: { deleteMany: vi.fn() }, organization: { deleteMany: vi.fn() }, user: { deleteMany: vi.fn() } });
  });
  (prisma.document.findMany as any).mockResolvedValue([{ fileUrl: 'uploads/a.jpg' }]);
});

describe('success', () => {
  it('revokes with the code before storage, rows and the auth identity go, and reports revoked', async () => {
    const res = mockRes();
    await AccountController.deleteAccount(req({ confirm: EMAIL, appleAuthorizationCode: CODE }), res, vi.fn());
    expect(revokeAppleAuthorization).toHaveBeenCalledWith(CODE);
    expect(order).toEqual(['revoke', 'storage', 'db', 'auth']);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, appleRevocation: 'revoked' });
  });
  it('a revoked outcome writes one log line naming the user, without the code', async () => {
    // Captured with util.format, as Node's console formats; String() would
    // hide an object argument.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await AccountController.deleteAccount(req({ confirm: EMAIL, appleAuthorizationCode: CODE }), mockRes(), vi.fn());
    const lines = log.mock.calls.map((c) => format(...c)).filter((l) => l.includes('apple_revocation'));
    expect(lines).toEqual([`[AccountController] apple_revocation revoked user=${USER_ID}`]);
    expect(log.mock.calls.map((c) => format(...c)).join('\n')).not.toContain(CODE);
    expect(err).not.toHaveBeenCalled();
    log.mockRestore();
    err.mockRestore();
  });
  it('a user who never signed in with Apple: no Apple call, not_applicable', async () => {
    (hasAppleIdentity as any).mockResolvedValue(false);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = mockRes();
    await AccountController.deleteAccount(req({ confirm: EMAIL }), res, vi.fn());
    expect(revokeAppleAuthorization).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true, appleRevocation: 'not_applicable' });
    expect(order).toEqual(['storage', 'db', 'auth']);
    expect(log.mock.calls.map((c) => format(...c)).join('\n')).not.toContain('apple_revocation');
    log.mockRestore();
  });
});

describe('Apple refusal and network failure: the deletion proceeds, the response says failed, one log line without the code', () => {
  for (const outcome of [
    { ok: false, reason: 'exchange_refused', status: 400, error: 'invalid_grant' },
    { ok: false, reason: 'revoke_refused', status: 400 },
    { ok: false, reason: 'network', message: 'getaddrinfo ENOTFOUND appleid.apple.com' },
  ]) {
    it(outcome.reason, async () => {
      (revokeAppleAuthorization as any).mockImplementation(async () => { order.push('revoke'); return outcome; });
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = mockRes();
      await AccountController.deleteAccount(req({ confirm: EMAIL, appleAuthorizationCode: CODE }), res, vi.fn());
      expect(order).toEqual(['revoke', 'storage', 'db', 'auth']);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true, appleRevocation: 'failed' });
      const lines = spy.mock.calls.map((c) => c.map(String).join(' '));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain(`reason=${outcome.reason}`);
      expect(lines[0]).not.toContain(CODE);
      spy.mockRestore();
    });
  }
});

describe('no code', () => {
  it('an Apple-linked user on a surface with no Apple sheet: deletion proceeds, skipped, one log line', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await AccountController.deleteAccount(req({ confirm: EMAIL }), res, vi.fn());
    expect(revokeAppleAuthorization).not.toHaveBeenCalled();
    expect(order).toEqual(['storage', 'db', 'auth']);
    expect(res.json).toHaveBeenCalledWith({ ok: true, appleRevocation: 'skipped' });
    expect(spy.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/apple_revocation skipped/);
    spy.mockRestore();
  });
  it('a code arrives and the backend has no APPLE_* variables: deletion proceeds, not_configured', async () => {
    (appleRevocationConfigured as any).mockReturnValue(false);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await AccountController.deleteAccount(req({ confirm: EMAIL, appleAuthorizationCode: CODE }), res, vi.fn());
    expect(revokeAppleAuthorization).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true, appleRevocation: 'not_configured' });
    expect(spy.mock.calls.map((c) => String(c[0])).join('\n')).not.toContain(CODE);
    spy.mockRestore();
  });
});

describe('refusals come first: the single-use code is not spent on a request that will not delete', () => {
  it('confirmation mismatch: no Apple call', async () => {
    const res = mockRes();
    await AccountController.deleteAccount(req({ confirm: 'other@example.com', appleAuthorizationCode: CODE }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(revokeAppleAuthorization).not.toHaveBeenCalled();
  });
  it('shared workspace: no Apple call', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ ...soloUser, memberships: [{ organizationId: 'org-1', organization: { _count: { members: 2 } } }] });
    const res = mockRes();
    await AccountController.deleteAccount(req({ confirm: EMAIL, appleAuthorizationCode: CODE }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(revokeAppleAuthorization).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  });
  it('already deleted rows, identity still there: revoke, then the identity goes', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    const res = mockRes();
    await AccountController.deleteAccount(req({ confirm: EMAIL, appleAuthorizationCode: CODE }), res, vi.fn());
    expect(order).toEqual(['revoke', 'auth']);
    expect(res.json).toHaveBeenCalledWith({ ok: true, alreadyDeleted: true, appleRevocation: 'revoked' });
  });
});

describe('the identity lookup fails', () => {
  it('is logged as its own thing, and a code present still revokes', async () => {
    (hasAppleIdentity as any).mockRejectedValue(new Error('Auth user lookup failed: 503'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await AccountController.deleteAccount(req({ confirm: EMAIL, appleAuthorizationCode: CODE }), res, vi.fn());
    expect(revokeAppleAuthorization).toHaveBeenCalledWith(CODE);
    expect(res.json).toHaveBeenCalledWith({ ok: true, appleRevocation: 'revoked' });
    expect(spy.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/identity_lookup_failed/);
    spy.mockRestore();
  });
});
