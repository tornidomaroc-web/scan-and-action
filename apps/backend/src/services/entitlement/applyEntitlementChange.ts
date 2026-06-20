import { BillingSource, PlanType, Prisma, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../../prismaClient';
import { derivePlan } from './derivePlan';

export interface EntitlementChangeInput {
  organizationId: string;
  /** Which billing source this update comes from. */
  source: BillingSource;
  /** Already mapped to ACTIVE/INACTIVE by the caller (source-specific vocab stays out of here). */
  status: SubscriptionStatus;
  /** Paddle subscription_id / RevenueCat original_transaction_id, if known. */
  externalId?: string | null;
  currentPeriodEnd?: Date | null;
  /** occurred_at of the source event, used for the out-of-order guard. */
  eventOccurredAt?: Date | null;
}

export interface EntitlementChangeResult {
  previousPlan: PlanType;
  newPlan: PlanType;
  /** false when the event was stale (older than the last applied event) and the source row was left unchanged. */
  applied: boolean;
}

/**
 * The single shared entitlement mutation. Both billing webhooks (Paddle now,
 * RevenueCat later) call this with their source + mapped status. It is
 * billing-source-agnostic: NO HMAC, NO auth headers, NO event-shape parsing.
 *
 * INVARIANT: this service NEVER writes Organization.planOverride. That is what
 * protects the review account and ENTERPRISE orgs from being clobbered by any
 * billing downgrade event — there is deliberately no code path here that touches
 * planOverride.
 *
 * Everything runs inside ONE interactive transaction, in this order:
 *   (a) lock the org row (SELECT ... FOR UPDATE) so concurrent Paddle/RC writes
 *       for the same org serialize and cannot lose an update;
 *   (b) out-of-order guard — a stale event does not overwrite the source row,
 *       but plan is still reconciled;
 *   (c) upsert the (organizationId, source) Subscription row;
 *   (d) read planOverride + all source rows;
 *   (e) derivePlan(...) — the same pure function the backfill gate uses;
 *   (f) write Organization.plan only if it changed.
 */
export async function applyEntitlementChange(
  input: EntitlementChangeInput
): Promise<EntitlementChangeResult> {
  const { organizationId, source, status, externalId, currentPeriodEnd, eventOccurredAt } = input;

  return prisma.$transaction(async (tx) => {
    // (a) Lock the org row for the duration of the transaction. This is the
    // serialization point: a second webhook touching the same org blocks here
    // until we commit, so its read in step (d) sees our write — no lost update.
    const locked = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM "Organization" WHERE id = ${organizationId}::uuid FOR UPDATE`
    );
    if (locked.length === 0) {
      // Unknown org: surface it so the webhook's release-claim-on-error fires and
      // the source retries, rather than silently swallowing a paid event.
      throw new Error(`[entitlement] Organization ${organizationId} not found`);
    }

    // (b) Out-of-order guard. If we have already applied a NEWER event for this
    // source, this delivery is stale (sources do not guarantee ordering). We do
    // NOT let it overwrite the source row — otherwise a late "active" could
    // resurrect an expired sub, or a late "expired" could kill a renewed one.
    // We STILL fall through to recompute plan: that is idempotent and heals a
    // plan write that an earlier crash may have skipped.
    const existing = await tx.subscription.findUnique({
      where: { organizationId_source: { organizationId, source } },
      select: { lastEventAt: true },
    });
    const isStale =
      !!eventOccurredAt &&
      !!existing?.lastEventAt &&
      eventOccurredAt.getTime() < existing.lastEventAt.getTime();

    // (c) Upsert the source row, unless stale. Only fields the caller actually
    // provides are written on update, so an event that omits e.g. externalId
    // does not wipe a previously stored value.
    if (!isStale) {
      const writeFields = {
        status,
        ...(externalId !== undefined ? { externalId } : {}),
        ...(currentPeriodEnd !== undefined ? { currentPeriodEnd } : {}),
        ...(eventOccurredAt !== undefined ? { lastEventAt: eventOccurredAt } : {}),
      };
      await tx.subscription.upsert({
        where: { organizationId_source: { organizationId, source } },
        create: {
          organizationId,
          source,
          status,
          externalId: externalId ?? null,
          currentPeriodEnd: currentPeriodEnd ?? null,
          lastEventAt: eventOccurredAt ?? null,
        },
        update: writeFields,
      });
    } else {
      console.warn(
        `[entitlement] Stale ${source} event for org ${organizationId} ` +
          `(occurred ${eventOccurredAt?.toISOString()} <= last applied ` +
          `${existing?.lastEventAt?.toISOString()}) — source row left unchanged, reconciling plan only.`
      );
    }

    // (d) Read the post-write state inside the same transaction.
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: {
        plan: true,
        planOverride: true,
        subscriptions: { select: { status: true } },
      },
    });
    if (!org) {
      throw new Error(`[entitlement] Organization ${organizationId} vanished mid-transaction`);
    }

    // (e) Derive the stored plan from override floor + per-source state.
    const previousPlan = org.plan;
    const newPlan = derivePlan(org.planOverride, org.subscriptions);

    // (f) Write plan only when it actually changes. planOverride is never touched.
    if (newPlan !== previousPlan) {
      await tx.organization.update({
        where: { id: organizationId },
        data: { plan: newPlan },
      });
    }

    return { previousPlan, newPlan, applied: !isStale };
  });
}
