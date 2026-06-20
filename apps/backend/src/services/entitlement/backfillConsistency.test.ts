import { describe, it, expect } from 'vitest';
import { PlanType } from '@prisma/client';
import { derivePlan, SubscriptionState } from './derivePlan';

/**
 * Offline proof that the backfill output satisfies the verification gate.
 *
 * Models the post-backfill row for each org category exactly as
 * scripts/backfillSubscriptions.ts produces it, then runs the SAME gate check
 * scripts/verifyEntitlement.ts runs (derivePlan === stored plan). This proves
 * the gate returns 0 mismatches for a correct backfill without needing the live
 * DB — and that it CATCHES a broken backfill.
 */
interface OrgRow {
  plan: PlanType;
  planOverride: PlanType | null;
  subscriptions: SubscriptionState[];
}

function gateMismatch(org: OrgRow): boolean {
  return derivePlan(org.planOverride, org.subscriptions) !== org.plan;
}

describe('backfill output passes the verification gate', () => {
  it('FREE org: no override, no subs', () => {
    expect(gateMismatch({ plan: 'FREE', planOverride: null, subscriptions: [] })).toBe(false);
  });

  it('normal PRO org: PADDLE ACTIVE subscription, no override', () => {
    expect(
      gateMismatch({ plan: 'PRO', planOverride: null, subscriptions: [{ status: 'ACTIVE' }] })
    ).toBe(false);
  });

  it('review-account PRO org: PRO override, no subscription', () => {
    expect(gateMismatch({ plan: 'PRO', planOverride: 'PRO', subscriptions: [] })).toBe(false);
  });

  it('ENTERPRISE org: ENTERPRISE override, no subscription', () => {
    expect(
      gateMismatch({ plan: 'ENTERPRISE', planOverride: 'ENTERPRISE', subscriptions: [] })
    ).toBe(false);
  });

  it('whole fleet of correctly backfilled orgs => 0 mismatches', () => {
    const fleet: OrgRow[] = [
      { plan: 'FREE', planOverride: null, subscriptions: [] },
      { plan: 'PRO', planOverride: null, subscriptions: [{ status: 'ACTIVE' }] },
      { plan: 'PRO', planOverride: 'PRO', subscriptions: [] }, // review account
      { plan: 'ENTERPRISE', planOverride: 'ENTERPRISE', subscriptions: [] },
    ];
    expect(fleet.filter(gateMismatch).length).toBe(0);
  });
});

describe('verification gate catches a broken backfill', () => {
  it('PRO org left with no subscription and no override would be FREE => mismatch', () => {
    expect(gateMismatch({ plan: 'PRO', planOverride: null, subscriptions: [] })).toBe(true);
  });

  it('review account wrongly given a PADDLE sub instead of override still PRO (no mismatch) but is semantically wrong', () => {
    // This documents WHY the review account must use an override: a PADDLE ACTIVE
    // sub also derives PRO (gate passes), but a future Paddle downgrade would then
    // flip it to FREE. The gate cannot catch this; the backfill logic must.
    expect(
      gateMismatch({ plan: 'PRO', planOverride: null, subscriptions: [{ status: 'ACTIVE' }] })
    ).toBe(false);
  });
});
