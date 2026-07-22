import { BillingSource } from '@prisma/client';
import { prisma } from '../../prismaClient';
import type { ResolvedBillingOrg } from './resolveBillingOrg';

/**
 * Resolve "which organization does this billing object belong to?" from the
 * SOURCE'S OWN identifier, rather than from our user id.
 *
 * WHY THIS EXISTS (it is not a convenience wrapper around resolveBillingOrg):
 * Paddle's `adjustment` entity — how refunds and chargebacks arrive — carries NO
 * `custom_data`. That field lives on the transaction and subscription entities,
 * not on adjustments (verified against Paddle's adjustment.created /
 * adjustment.updated webhook docs). So `custom_data.userId`, the identifier every
 * other path in this codebase resolves on, is simply absent on a refund event.
 * Resolving refunds via resolveBillingOrg() would therefore always return null in
 * production, while passing any test whose fixture invented a custom_data field.
 *
 * The route that does work: the adjustment carries `subscription_id`, and
 * applyEntitlementChange already persists that value on Subscription.externalId
 * (see its steps (c) create/update). Until now nothing ever read that column back
 * — this function is that read path.
 *
 * Takes already-extracted identifiers, never an event: event-shape parsing stays
 * in the controllers, exactly as resolveBillingOrg does. That keeps this usable
 * by RevenueCat later (original_transaction_id) with no Paddle vocabulary in it.
 *
 * Returns null when the id is absent or matches no row; the CALLER owns the
 * "could not map this billing event" alert, same contract as resolveBillingOrg.
 *
 * NOTE — `subscription_id` is nullable on Paddle adjustments (`string | null`):
 * a refund against a one-off, non-subscription transaction has none. Such a
 * refund cannot be resolved here and will return null. That is correct today (the
 * catalog holds only recurring prices, so every real adjustment has a
 * subscription) and it fails SAFE — an unresolvable refund alerts rather than
 * revoking the wrong org.
 */
export async function resolveBillingOrgByExternalId(
  source: BillingSource,
  externalId: string | null | undefined
): Promise<ResolvedBillingOrg | null> {
  if (!externalId) return null;

  // findMany, not findUnique: Subscription.externalId has NO unique constraint
  // (only @@unique([organizationId, source])), so the DB cannot promise one row.
  // Ordering makes the pick deterministic — same posture as pickBillingMembership's
  // lowest-organizationId tie-break — so a repeated delivery of the same event can
  // never resolve to a different org than the first.
  const rows = await prisma.subscription.findMany({
    where: { source, externalId },
    select: { organizationId: true },
    orderBy: { organizationId: 'asc' },
  });

  if (rows.length === 0) return null;

  if (rows.length > 1) {
    // Two orgs holding the same source subscription id means an earlier event
    // attributed one Paddle subscription to more than one org (e.g. custom_data
    // .userId pointed at different users over time). We pick deterministically so
    // behaviour is stable, but a human must untangle it: acting on the wrong org
    // here would revoke a paying customer.
    console.warn(
      `[resolveBillingOrgByExternalId][ALERT] ${source} externalId ${externalId} matches ` +
        `${rows.length} organizations (${rows.map((r) => r.organizationId).join(', ')}); ` +
        `picked ${rows[0].organizationId} by lowest organizationId. Verify which org actually owns this subscription.`
    );
  }

  return { organizationId: rows[0].organizationId };
}
