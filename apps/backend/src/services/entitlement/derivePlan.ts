import { PlanType, SubscriptionStatus } from '@prisma/client';

// Entitlement ordering. Higher rank wins. FREE(0) < PRO(1) < ENTERPRISE(2).
const PLAN_RANK: Record<PlanType, number> = {
  FREE: 0,
  PRO: 1,
  ENTERPRISE: 2,
};

/** Returns the higher-entitlement of two plans by PLAN_RANK. */
export function maxPlan(a: PlanType, b: PlanType): PlanType {
  return PLAN_RANK[a] >= PLAN_RANK[b] ? a : b;
}

/** Minimal shape the derivation needs from a Subscription row. */
export interface SubscriptionState {
  status: SubscriptionStatus;
}

/**
 * Pure entitlement derivation — the single source of truth for how
 * Organization.plan is computed from per-source subscription state plus the
 * manual override floor. Reused by the shared entitlement service (Step 2b)
 * and by the backfill verification gate.
 *
 *   plan = max(planOverride ?? FREE, PRO if any source ACTIVE else FREE)
 *
 * - `planOverride` is a manual FLOOR: it can only RAISE entitlement, never lower
 *   it. ENTERPRISE deals and the review account (which has no billing source)
 *   live here, so no billing (Paddle/RevenueCat) event can clobber them.
 * - The billing layer is binary: PRO if ANY source is ACTIVE, else FREE.
 *   Grace/dunning states are mapped to ACTIVE upstream (confirmed product rule),
 *   so this function never needs source-specific status vocabulary.
 *
 * This function is pure and stateless on purpose: no DB, no I/O, no clock.
 */
export function derivePlan(
  planOverride: PlanType | null | undefined,
  subscriptions: ReadonlyArray<SubscriptionState>
): PlanType {
  const anyActive = subscriptions.some((s) => s.status === 'ACTIVE');
  const billingPlan: PlanType = anyActive ? 'PRO' : 'FREE';
  const floor: PlanType = planOverride ?? 'FREE';
  return maxPlan(floor, billingPlan);
}
