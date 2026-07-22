import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../prismaClient', () => ({
  prisma: { subscription: { findMany: vi.fn() } },
}));

import { prisma } from '../../prismaClient';
import { resolveBillingOrgByExternalId } from './resolveBillingOrgByExternalId';
// THE shared adjustment shape — the same object the controller tests drive. Using
// one definition is the point: the original defect was two copies of this shape,
// one of which invented a `custom_data` field Paddle does not send.
import { adjustmentCreated, FIXTURE_SUBSCRIPTION_ID } from '../../testSupport/paddleAdjustment';

const ORG_ID = 'org-paying-1';
const SUB_ID = FIXTURE_SUBSCRIPTION_ID;

const realAdjustmentEvent = adjustmentCreated();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('resolveBillingOrgByExternalId — the refund identity path', () => {
  // ==========================================================================
  // THE LOAD-BEARING TEST.
  //
  // This is the test that would have caught the false fixture. A refund event
  // carries NO custom_data, so the userId-based path every other webhook branch
  // uses resolves nothing. If identity for refunds cannot be recovered from
  // subscription_id alone, refund-revoke is undeliverable — it would pass CI and
  // silently never fire in production. So: assert it RESOLVES, to the RIGHT org,
  // from an event that has no user identifier on it whatsoever.
  // ==========================================================================
  it('LOAD-BEARING: an adjustment event with NO custom_data still resolves to the correct org via subscription_id', async () => {
    // Precondition, asserted rather than assumed: the event really does lack any
    // user identifier. If a future edit reintroduces custom_data into this fixture,
    // this test stops proving what it claims to prove — so fail loudly here.
    expect(realAdjustmentEvent.data).not.toHaveProperty('custom_data');
    expect(JSON.stringify(realAdjustmentEvent)).not.toContain('userId');

    (prisma.subscription.findMany as any).mockResolvedValue([{ organizationId: ORG_ID }]);

    const resolved = await resolveBillingOrgByExternalId(
      'PADDLE',
      realAdjustmentEvent.data.subscription_id
    );

    // Resolved — not merely "did not throw".
    expect(resolved).toEqual({ organizationId: ORG_ID });

    // And resolved via the subscription id off the event, scoped to the source.
    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { source: 'PADDLE', externalId: SUB_ID } })
    );
  });

  it('returns null (and never queries) when subscription_id is null — a refund on a non-subscription transaction', async () => {
    // Paddle types adjustment.subscription_id as `string | null`. Fail safe: an
    // unresolvable refund must alert upstream, never revoke an arbitrary org.
    const resolved = await resolveBillingOrgByExternalId('PADDLE', null);
    expect(resolved).toBeNull();
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
  });

  it('returns null when the subscription id matches no stored row', async () => {
    (prisma.subscription.findMany as any).mockResolvedValue([]);
    const resolved = await resolveBillingOrgByExternalId('PADDLE', 'sub_unknown');
    expect(resolved).toBeNull();
  });

  it('scopes the lookup to the billing source, so a RevenueCat row cannot answer a Paddle event', async () => {
    (prisma.subscription.findMany as any).mockResolvedValue([]);
    await resolveBillingOrgByExternalId('REVENUECAT', SUB_ID);
    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { source: 'REVENUECAT', externalId: SUB_ID } })
    );
  });

  it('picks deterministically and logs an ALERT when one externalId matches several orgs', async () => {
    // externalId has no unique constraint, so the DB cannot rule this out. Acting
    // on the wrong org would revoke a paying customer — pick stably, shout loudly.
    (prisma.subscription.findMany as any).mockResolvedValue([
      { organizationId: 'org-aaa' },
      { organizationId: 'org-bbb' },
    ]);

    const resolved = await resolveBillingOrgByExternalId('PADDLE', SUB_ID);

    expect(resolved).toEqual({ organizationId: 'org-aaa' });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[resolveBillingOrgByExternalId][ALERT]')
    );
  });

  it('orders the query so the deterministic pick is the DB\'s doing, not luck of insertion order', async () => {
    (prisma.subscription.findMany as any).mockResolvedValue([{ organizationId: ORG_ID }]);
    await resolveBillingOrgByExternalId('PADDLE', SUB_ID);
    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { organizationId: 'asc' } })
    );
  });
});
