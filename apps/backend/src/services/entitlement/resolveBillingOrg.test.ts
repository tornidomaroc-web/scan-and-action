import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../prismaClient', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

import { prisma } from '../../prismaClient';
import { resolveBillingOrg, pickBillingMembership } from './resolveBillingOrg';

const USER_ID = '7f1e2d3c-4b5a-4678-9abc-def012345678';

function m(organizationId: string, role: any, joinedAt: string) {
  return { organizationId, role, joinedAt: new Date(joinedAt) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('pickBillingMembership (deterministic rule)', () => {
  it('prefers highest role regardless of input order', () => {
    const picked = pickBillingMembership([
      m('org-member', 'MEMBER', '2026-01-01'),
      m('org-owner', 'OWNER', '2026-06-01'),
      m('org-admin', 'ADMIN', '2026-01-01'),
    ]);
    expect(picked.organizationId).toBe('org-owner');
  });

  it('tie-breaks equal roles by earliest joinedAt', () => {
    const picked = pickBillingMembership([
      m('org-late', 'OWNER', '2026-06-01'),
      m('org-early', 'OWNER', '2026-01-01'),
    ]);
    expect(picked.organizationId).toBe('org-early');
  });

  it('tie-breaks equal role + joinedAt by lowest organizationId', () => {
    const picked = pickBillingMembership([
      m('org-bbb', 'OWNER', '2026-01-01'),
      m('org-aaa', 'OWNER', '2026-01-01'),
    ]);
    expect(picked.organizationId).toBe('org-aaa');
  });
});

describe('resolveBillingOrg', () => {
  it('resolves by userId and returns the chosen org', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: USER_ID,
      memberships: [m('org-1', 'OWNER', '2026-01-01')],
    });
    const res = await resolveBillingOrg(USER_ID);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } })
    );
    expect(res).toEqual({ organizationId: 'org-1' });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('logs an ALERT when the user has more than one membership', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: USER_ID,
      memberships: [m('org-2', 'OWNER', '2026-01-01'), m('org-3', 'MEMBER', '2026-02-01')],
    });
    const res = await resolveBillingOrg(USER_ID);
    expect(res).toEqual({ organizationId: 'org-2' });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[resolveBillingOrg][ALERT] Ambiguous billing org')
    );
  });

  it('falls back to email when userId matches no user', async () => {
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce(null) // userId lookup misses
      .mockResolvedValueOnce({ id: USER_ID, memberships: [m('org-4', 'ADMIN', '2026-01-01')] }); // email hit
    const res = await resolveBillingOrg(USER_ID, 'buyer@example.com');
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { email: 'buyer@example.com' } })
    );
    expect(res).toEqual({ organizationId: 'org-4' });
  });

  it('returns null when neither userId nor email resolves a user', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    expect(await resolveBillingOrg(USER_ID, 'nobody@example.com')).toBeNull();
  });

  it('returns null when the resolved user has no memberships', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: USER_ID, memberships: [] });
    expect(await resolveBillingOrg(USER_ID)).toBeNull();
  });

  it('returns null without any lookup when given no identifiers', async () => {
    expect(await resolveBillingOrg(null, null)).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
