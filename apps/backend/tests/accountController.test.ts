import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/prismaClient', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    document: { findMany: vi.fn() },
    queryLog: { deleteMany: vi.fn() },
    organization: { deleteMany: vi.fn() },
    // $transaction runs the callback with a tx that reuses the same mocks.
    $transaction: vi.fn(async (cb: any) =>
      cb({
        queryLog: { deleteMany: vi.fn() },
        organization: { deleteMany: vi.fn() },
        user: { deleteMany: vi.fn() },
      })
    ),
  },
}));

vi.mock('../src/services/accountDeletionService', () => ({
  deleteStorageObjects: vi.fn(async () => {}),
  deleteAuthUser: vi.fn(async () => {}),
}));

import { prisma } from '../src/prismaClient';
import { AccountController } from '../src/controllers/accountController';
import { deleteStorageObjects, deleteAuthUser } from '../src/services/accountDeletionService';

const USER_ID = '7f1e2d3c-4b5a-4678-9abc-def012345678';
const ORG_ID = 'org-uuid-1';
const EMAIL = 'owner@example.com';

function mockReq(confirm: unknown) {
  return {
    user: { id: USER_ID, email: EMAIL, organizationId: ORG_ID },
    body: { confirm },
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const soloUser = {
  id: USER_ID,
  email: EMAIL,
  memberships: [
    { organizationId: ORG_ID, organization: { _count: { members: 1 } } },
  ],
};

describe('AccountController.deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when no confirmation is provided', async () => {
    const res = mockRes();
    await AccountController.deleteAccount(mockReq(''), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(deleteAuthUser).not.toHaveBeenCalled();
  });

  it('rejects when the confirmation email does not match the token email', async () => {
    const res = mockRes();
    await AccountController.deleteAccount(mockReq('someone-else@example.com'), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('deletes a solo account end to end: storage, db, auth user', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(soloUser);
    (prisma.document.findMany as any).mockResolvedValue([
      { fileUrl: 'uploads/1-a.pdf' },
      { fileUrl: 'uploads/2-b.pdf' },
    ]);
    const res = mockRes();

    await AccountController.deleteAccount(mockReq(EMAIL), res, vi.fn());

    expect(deleteStorageObjects).toHaveBeenCalledWith(['uploads/1-a.pdf', 'uploads/2-b.pdf']);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(deleteAuthUser).toHaveBeenCalledWith(USER_ID);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('uppercase/whitespace confirmation still matches (case-insensitive, trimmed)', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(soloUser);
    (prisma.document.findMany as any).mockResolvedValue([]);
    const res = mockRes();

    await AccountController.deleteAccount(mockReq('  OWNER@Example.com  '), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(deleteAuthUser).toHaveBeenCalledWith(USER_ID);
  });

  it('fails safe with 409 when the user shares an org with other members', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      ...soloUser,
      memberships: [
        { organizationId: ORG_ID, organization: { _count: { members: 2 } } },
      ],
    });
    const res = mockRes();

    await AccountController.deleteAccount(mockReq(EMAIL), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(deleteStorageObjects).not.toHaveBeenCalled();
    expect(deleteAuthUser).not.toHaveBeenCalled();
  });

  it('is idempotent: when the db user is already gone it still clears the auth user', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    const res = mockRes();

    await AccountController.deleteAccount(mockReq(EMAIL), res, vi.fn());

    expect(deleteAuthUser).toHaveBeenCalledWith(USER_ID);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, alreadyDeleted: true });
  });

  it('aborts before any DB delete if storage deletion fails (no half-deleted state)', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(soloUser);
    (prisma.document.findMany as any).mockResolvedValue([{ fileUrl: 'uploads/1-a.pdf' }]);
    (deleteStorageObjects as any).mockRejectedValueOnce(new Error('Storage deletion failed: boom'));
    const next = vi.fn();
    const res = mockRes();

    await AccountController.deleteAccount(mockReq(EMAIL), res, next);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('only ever targets the token user id, never a body-supplied id', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(soloUser);
    (prisma.document.findMany as any).mockResolvedValue([]);
    const res = mockRes();
    const req = mockReq(EMAIL);
    // Attacker tries to smuggle a different target — must be ignored.
    req.body.userId = 'victim-user-id';

    await AccountController.deleteAccount(req, res, vi.fn());

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } })
    );
    expect(deleteAuthUser).toHaveBeenCalledWith(USER_ID);
  });
});
