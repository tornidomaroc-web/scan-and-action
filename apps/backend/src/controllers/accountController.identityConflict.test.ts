import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// DELETE /api/account — `!dbUser` must not report success for a stranger row
// ============================================================================
// `!dbUser` conflates two states. "Already deleted" is one; "your address is held
// by a row under a DIFFERENT id" is the other. Reported identically, the second
// deletes the caller's auth identity, leaves the other row's organization,
// documents and storage objects intact, keeps the address locked so the next
// signup fails the same way — and returns `ok: true`.
//
// The authMiddleware classifier normally stops such a request before it reaches
// this controller (see authMiddleware.identityConflict.test.ts), so this guard is
// defence in depth. It is here because "should be unreachable" is the assumption
// that decays: any future change that makes provisioning recover or adopt routes
// straight into the success branch and silently reports a deletion that did not
// happen. This file is the tripwire for that.
// ============================================================================

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  deleteAuthUser: vi.fn(),
  deleteStorageObjects: vi.fn(),
}));

vi.mock('../prismaClient', () => ({
  prisma: { user: { findUnique: h.findUnique, findFirst: h.findFirst } },
}));

vi.mock('../services/accountDeletionService', () => ({
  deleteAuthUser: h.deleteAuthUser,
  deleteStorageObjects: h.deleteStorageObjects,
}));

import { AccountController } from './accountController';

const CALLER_ID = 'c521aa92-0f4d-4b82-821a-b9e8c0c6f7ae'; // live identity, no row
const HOLDER_ID = '1e1c8482-16bb-474c-89d0-5f3e65d1f186'; // orphan row holding the address
const EMAIL = 'someone@example.com';

function makeReqRes(confirm: string = EMAIL, email: string = EMAIL) {
  const req: any = { user: { id: CALLER_ID, email }, body: { confirm } };
  const res: any = {
    statusCode: 0,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return { req, res, next: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.findUnique.mockResolvedValue(null); // caller has no User row
  h.deleteAuthUser.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('deleteAccount — the address is held by another id', () => {
  it('refuses with a coded 409 and does NOT delete the auth identity', async () => {
    h.findFirst.mockResolvedValue({ id: HOLDER_ID });
    const { req, res, next } = makeReqRes();

    await AccountController.deleteAccount(req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: 'IDENTITY_EMAIL_CONFLICT',
      message: expect.stringContaining('different identity'),
    });
    // The two things that made the naive path dangerous:
    expect(h.deleteAuthUser).not.toHaveBeenCalled();
    expect(res.body.ok).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('matches the holder case-insensitively', async () => {
    // User.email is stored exactly as Supabase supplied it; `email` in the
    // controller is normalised for the confirm compare. A case difference must
    // not turn a refusal into a false success.
    h.findFirst.mockResolvedValue({ id: HOLDER_ID });
    const { req, res, next } = makeReqRes('SomeOne@Example.com', 'SomeOne@Example.com');

    await AccountController.deleteAccount(req, res, next);

    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: EMAIL, mode: 'insensitive' } },
      })
    );
    expect(res.statusCode).toBe(409);
    expect(h.deleteAuthUser).not.toHaveBeenCalled();
  });
});

describe('deleteAccount — genuine idempotency is unchanged', () => {
  it('no row anywhere: still deletes the auth identity and reports alreadyDeleted', async () => {
    h.findFirst.mockResolvedValue(null);
    const { req, res, next } = makeReqRes();

    await AccountController.deleteAccount(req, res, next);

    expect(h.deleteAuthUser).toHaveBeenCalledWith(CALLER_ID);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadyDeleted: true });
  });

  it('a holder that IS the caller is not a conflict', async () => {
    h.findFirst.mockResolvedValue({ id: CALLER_ID });
    const { req, res, next } = makeReqRes();

    await AccountController.deleteAccount(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadyDeleted: true });
    expect(h.deleteAuthUser).toHaveBeenCalledWith(CALLER_ID);
  });
});

describe('deleteAccount — the confirmation gate is untouched', () => {
  it('a mismatched confirmation still 400s before any lookup', async () => {
    const { req, res, next } = makeReqRes('not-my-email@example.com');

    await AccountController.deleteAccount(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('CONFIRMATION_REQUIRED');
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.deleteAuthUser).not.toHaveBeenCalled();
  });
});
