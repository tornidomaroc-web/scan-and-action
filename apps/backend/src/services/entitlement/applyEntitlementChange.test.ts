import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * In-memory fake Prisma that mirrors the parts applyEntitlementChange uses:
 * $transaction (runs the callback against shared state), $queryRaw (the
 * FOR UPDATE lock), subscription.findUnique/upsert, organization.findUnique/update.
 * No live DB. Read-after-write within one $transaction works because every op
 * mutates the same shared state object.
 */
const h = vi.hoisted(() => {
  const subKey = (orgId: string, source: string) => `${orgId}::${source}`;
  const state = {
    orgs: new Map<string, any>(),
    subs: new Map<string, any>(),
    lockCalls: [] as any[],
    updateCalls: 0,
  };

  const db: any = {
    __state: state,
    __reset() {
      state.orgs.clear();
      state.subs.clear();
      state.lockCalls.length = 0;
      state.updateCalls = 0;
    },
    __seedOrg(id: string, plan: string, planOverride: string | null = null) {
      state.orgs.set(id, { id, plan, planOverride });
    },
    __seedSub(orgId: string, source: string, sub: any) {
      state.subs.set(subKey(orgId, source), {
        organizationId: orgId,
        source,
        status: 'INACTIVE',
        externalId: null,
        currentPeriodEnd: null,
        lastEventAt: null,
        ...sub,
      });
    },
    __getSub(orgId: string, source: string) {
      return state.subs.get(subKey(orgId, source));
    },
    __getOrg(id: string) {
      return state.orgs.get(id);
    },
    async $transaction(cb: any) {
      return cb(db);
    },
    async $queryRaw(sql: any) {
      state.lockCalls.push(sql);
      const id = sql?.values?.[0];
      return state.orgs.has(id) ? [{ id }] : [];
    },
    subscription: {
      async findUnique({ where }: any) {
        const { organizationId, source } = where.organizationId_source;
        const s = state.subs.get(subKey(organizationId, source));
        return s ? { ...s } : null;
      },
      async upsert({ where, create, update }: any) {
        const { organizationId, source } = where.organizationId_source;
        const k = subKey(organizationId, source);
        const existing = state.subs.get(k);
        if (existing) {
          state.subs.set(k, { ...existing, ...update });
        } else {
          state.subs.set(k, {
            externalId: null,
            currentPeriodEnd: null,
            lastEventAt: null,
            ...create,
          });
        }
        return state.subs.get(k);
      },
    },
    organization: {
      async findUnique({ where, select }: any) {
        const org = state.orgs.get(where.id);
        if (!org) return null;
        const out: any = {};
        if (select?.plan) out.plan = org.plan;
        if (select?.planOverride) out.planOverride = org.planOverride;
        if (select?.subscriptions) {
          out.subscriptions = [...state.subs.values()]
            .filter((s) => s.organizationId === where.id)
            .map((s) => ({ status: s.status }));
        }
        return out;
      },
      async update({ where, data }: any) {
        state.updateCalls++;
        const org = state.orgs.get(where.id);
        const updated = { ...org, ...data };
        state.orgs.set(where.id, updated);
        return updated;
      },
    },
  };

  return { db };
});

vi.mock('../../prismaClient', () => ({ prisma: h.db }));

import { applyEntitlementChange } from './applyEntitlementChange';

const ORG = '11111111-1111-4111-8111-111111111111';

function sqlText(sql: any): string {
  if (!sql) return '';
  return (
    sql.sql ||
    sql.text ||
    (Array.isArray(sql.strings) ? sql.strings.join(' ') : '') ||
    String(sql)
  );
}

beforeEach(() => {
  h.db.__reset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('applyEntitlementChange — locking & not-found', () => {
  it('locks the org row with SELECT ... FOR UPDATE before deriving', async () => {
    h.db.__seedOrg(ORG, 'FREE');
    await applyEntitlementChange({ organizationId: ORG, source: 'PADDLE', status: 'ACTIVE' });
    expect(h.db.__state.lockCalls.length).toBe(1);
    expect(sqlText(h.db.__state.lockCalls[0]).toUpperCase()).toContain('FOR UPDATE');
  });

  it('throws when the org does not exist (so the webhook releases its claim and the source retries)', async () => {
    await expect(
      applyEntitlementChange({ organizationId: ORG, source: 'PADDLE', status: 'ACTIVE' })
    ).rejects.toThrow(/not found/);
  });
});

describe('applyEntitlementChange — derivation & plan writes', () => {
  it('PADDLE ACTIVE upgrades a FREE org to PRO and records the source row', async () => {
    h.db.__seedOrg(ORG, 'FREE');
    const r = await applyEntitlementChange({
      organizationId: ORG,
      source: 'PADDLE',
      status: 'ACTIVE',
      externalId: 'sub_123',
    });
    expect(r).toEqual({ previousPlan: 'FREE', newPlan: 'PRO', applied: true });
    expect(h.db.__getOrg(ORG).plan).toBe('PRO');
    expect(h.db.__getSub(ORG, 'PADDLE').status).toBe('ACTIVE');
    expect(h.db.__getSub(ORG, 'PADDLE').externalId).toBe('sub_123');
  });

  it('PADDLE INACTIVE downgrades a PRO org to FREE when it is the only source', async () => {
    h.db.__seedOrg(ORG, 'PRO');
    h.db.__seedSub(ORG, 'PADDLE', { status: 'ACTIVE' });
    const r = await applyEntitlementChange({ organizationId: ORG, source: 'PADDLE', status: 'INACTIVE' });
    expect(r).toEqual({ previousPlan: 'PRO', newPlan: 'FREE', applied: true });
    expect(h.db.__getOrg(ORG).plan).toBe('FREE');
  });

  it('does not write plan when it is unchanged (idempotent re-delivery)', async () => {
    h.db.__seedOrg(ORG, 'PRO');
    h.db.__seedSub(ORG, 'PADDLE', { status: 'ACTIVE' });
    const r = await applyEntitlementChange({ organizationId: ORG, source: 'PADDLE', status: 'ACTIVE' });
    expect(r.newPlan).toBe('PRO');
    expect(h.db.__state.updateCalls).toBe(0);
  });

  it('multi-source: PADDLE INACTIVE but REVENUECAT ACTIVE keeps the org PRO', async () => {
    h.db.__seedOrg(ORG, 'PRO');
    h.db.__seedSub(ORG, 'PADDLE', { status: 'ACTIVE' });
    h.db.__seedSub(ORG, 'REVENUECAT', { status: 'ACTIVE' });
    const r = await applyEntitlementChange({ organizationId: ORG, source: 'PADDLE', status: 'INACTIVE' });
    expect(r.newPlan).toBe('PRO');
    expect(h.db.__getOrg(ORG).plan).toBe('PRO');
  });
});

describe('applyEntitlementChange — planOverride floor is never written or clobbered', () => {
  it('INACTIVE event on a review-style org (planOverride=PRO, no prior sub) leaves plan PRO', async () => {
    h.db.__seedOrg(ORG, 'PRO', 'PRO'); // review account: override PRO, no billing source
    const r = await applyEntitlementChange({ organizationId: ORG, source: 'PADDLE', status: 'INACTIVE' });
    expect(r.newPlan).toBe('PRO');
    expect(h.db.__getOrg(ORG).plan).toBe('PRO');
    // The service must never touch planOverride.
    expect(h.db.__getOrg(ORG).planOverride).toBe('PRO');
  });

  it('ENTERPRISE override is never downgraded by an INACTIVE billing event', async () => {
    h.db.__seedOrg(ORG, 'ENTERPRISE', 'ENTERPRISE');
    h.db.__seedSub(ORG, 'PADDLE', { status: 'ACTIVE' });
    const r = await applyEntitlementChange({ organizationId: ORG, source: 'PADDLE', status: 'INACTIVE' });
    expect(r.newPlan).toBe('ENTERPRISE');
    expect(h.db.__getOrg(ORG).plan).toBe('ENTERPRISE');
    expect(h.db.__getOrg(ORG).planOverride).toBe('ENTERPRISE');
  });
});

describe('applyEntitlementChange — out-of-order guard', () => {
  const T_OLD = new Date('2026-01-01T00:00:00.000Z');
  const T_NEW = new Date('2026-02-01T00:00:00.000Z');

  it('a stale event does NOT resurrect an expired sub, but plan is still reconciled', async () => {
    // Stored: org wrongly FREE (e.g. an earlier crash skipped the plan write),
    // PADDLE expired at T_NEW, but REVENUECAT is ACTIVE -> correct plan is PRO.
    h.db.__seedOrg(ORG, 'FREE');
    h.db.__seedSub(ORG, 'PADDLE', { status: 'INACTIVE', lastEventAt: T_NEW });
    h.db.__seedSub(ORG, 'REVENUECAT', { status: 'ACTIVE' });

    // A late "active" PADDLE event from T_OLD arrives (older than T_NEW).
    const r = await applyEntitlementChange({
      organizationId: ORG,
      source: 'PADDLE',
      status: 'ACTIVE',
      eventOccurredAt: T_OLD,
    });

    expect(r.applied).toBe(false); // source row left unchanged
    expect(h.db.__getSub(ORG, 'PADDLE').status).toBe('INACTIVE'); // not resurrected
    expect(r.newPlan).toBe('PRO'); // plan still reconciled from current state
    expect(h.db.__getOrg(ORG).plan).toBe('PRO');
  });

  it('a newer event is applied normally', async () => {
    h.db.__seedOrg(ORG, 'FREE');
    h.db.__seedSub(ORG, 'PADDLE', { status: 'INACTIVE', lastEventAt: T_OLD });
    const r = await applyEntitlementChange({
      organizationId: ORG,
      source: 'PADDLE',
      status: 'ACTIVE',
      eventOccurredAt: T_NEW,
    });
    expect(r.applied).toBe(true);
    expect(h.db.__getSub(ORG, 'PADDLE').status).toBe('ACTIVE');
    expect(h.db.__getSub(ORG, 'PADDLE').lastEventAt).toEqual(T_NEW);
    expect(h.db.__getOrg(ORG).plan).toBe('PRO');
  });
});

describe('applyEntitlementChange — convergence across sources', () => {
  // NOTE: the fake runs transactions sequentially. True concurrent serialization
  // is enforced at the DB by the SELECT ... FOR UPDATE lock (asserted above);
  // this test proves the writes CONVERGE to the correct plan regardless of order.
  it('sequential cross-source writes converge to the right plan', async () => {
    h.db.__seedOrg(ORG, 'FREE');

    await applyEntitlementChange({ organizationId: ORG, source: 'PADDLE', status: 'ACTIVE' });
    expect(h.db.__getOrg(ORG).plan).toBe('PRO');

    await applyEntitlementChange({ organizationId: ORG, source: 'REVENUECAT', status: 'ACTIVE' });
    expect(h.db.__getOrg(ORG).plan).toBe('PRO');

    // RevenueCat lapses, Paddle still active -> stays PRO.
    const r = await applyEntitlementChange({ organizationId: ORG, source: 'REVENUECAT', status: 'INACTIVE' });
    expect(r.newPlan).toBe('PRO');

    // Paddle also lapses -> now FREE.
    const r2 = await applyEntitlementChange({ organizationId: ORG, source: 'PADDLE', status: 'INACTIVE' });
    expect(r2.newPlan).toBe('FREE');
    expect(h.db.__getOrg(ORG).plan).toBe('FREE');
  });
});
