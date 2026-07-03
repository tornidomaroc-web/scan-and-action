import { describe, it, expect, vi, beforeEach } from 'vitest';

// Emulate the tiny slice of Prisma the analytics service uses against an
// in-memory fixture, so the WHERE clauses the service builds (org scoping,
// status filter, processedAt window) are exercised for real — not just asserted
// as call args. This is where aggregation bugs hide.
vi.mock('../src/prismaClient', () => ({
  prisma: {
    document: { groupBy: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from '../src/prismaClient';
import {
  buildMonthWindows,
  computeDashboardAnalytics,
  SERIES_MONTHS,
} from '../src/services/dashboardStatsService';

type Doc = { organizationId: string; status: string; processedAt: Date | null };

// Minimal WHERE matcher mirroring Prisma semantics for our queries.
function matchesWhere(doc: Doc, where: any): boolean {
  if (where.organizationId !== undefined && doc.organizationId !== where.organizationId) return false;
  if (where.status?.in && !where.status.in.includes(doc.status)) return false;
  if (where.processedAt) {
    if (doc.processedAt == null) return false; // null processedAt never falls in a range
    if (where.processedAt.gte && doc.processedAt.getTime() < where.processedAt.gte.getTime()) return false;
    if (where.processedAt.lt && doc.processedAt.getTime() >= where.processedAt.lt.getTime()) return false;
  }
  return true;
}

function loadFixture(docs: Doc[]) {
  (prisma.document.count as any).mockImplementation(async ({ where }: any) =>
    docs.filter((d) => matchesWhere(d, where)).length
  );
  (prisma.document.groupBy as any).mockImplementation(async ({ where }: any) => {
    const counts: Record<string, number> = {};
    for (const d of docs.filter((x) => matchesWhere(x, where))) {
      counts[d.status] = (counts[d.status] ?? 0) + 1;
    }
    return Object.entries(counts).map(([status, n]) => ({ status, _count: { _all: n } }));
  });
}

const NOW = new Date('2026-07-02T12:00:00.000Z'); // current UTC month = 2026-07

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const ORG_C = '33333333-3333-4333-8333-333333333333'; // brand-new, no docs

const d = (iso: string) => new Date(iso);

const FIXTURE: Doc[] = [
  // ORG_A — processed docs across the 6-month window (Feb..Jul 2026)
  { organizationId: ORG_A, status: 'COMPLETED', processedAt: d('2026-07-01T09:00:00Z') }, // Jul
  { organizationId: ORG_A, status: 'COMPLETED', processedAt: d('2026-06-15T09:00:00Z') }, // Jun
  { organizationId: ORG_A, status: 'NEEDS_REVIEW', processedAt: d('2026-06-20T09:00:00Z') }, // Jun
  { organizationId: ORG_A, status: 'NEEDS_REVIEW', processedAt: d('2026-05-05T09:00:00Z') }, // May
  { organizationId: ORG_A, status: 'COMPLETED', processedAt: d('2026-02-01T00:00:00Z') }, // Feb (bucket edge)
  { organizationId: ORG_A, status: 'REJECTED', processedAt: d('2026-06-10T09:00:00Z') }, // in breakdown, NOT in series
  { organizationId: ORG_A, status: 'FAILED', processedAt: d('2026-07-05T09:00:00Z') }, // excluded everywhere user-facing
  { organizationId: ORG_A, status: 'PROCESSING', processedAt: null }, // excluded (in-flight)
  { organizationId: ORG_A, status: 'COMPLETED', processedAt: d('2026-01-15T09:00:00Z') }, // before window: breakdown yes, series no
  // ORG_B — same months, must never leak into ORG_A's numbers
  { organizationId: ORG_B, status: 'COMPLETED', processedAt: d('2026-07-01T09:00:00Z') },
  { organizationId: ORG_B, status: 'NEEDS_REVIEW', processedAt: d('2026-06-01T09:00:00Z') },
  { organizationId: ORG_B, status: 'REJECTED', processedAt: d('2026-06-02T09:00:00Z') },
];

describe('buildMonthWindows — UTC month buckets', () => {
  it('returns SERIES_MONTHS chronological windows ending in the current month', () => {
    const w = buildMonthWindows(NOW);
    expect(w).toHaveLength(SERIES_MONTHS);
    expect(w.map((x) => x.month)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);
  });

  it('each window is [firstOfMonthUTC, firstOfNextMonthUTC) and abuts the next', () => {
    const w = buildMonthWindows(NOW);
    expect(w[5].gte.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(w[5].lt.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    for (let i = 0; i < w.length - 1; i++) {
      expect(w[i].lt.getTime()).toBe(w[i + 1].gte.getTime()); // no gaps, no overlap
    }
  });

  it('crosses the year boundary correctly', () => {
    const w = buildMonthWindows(new Date('2026-01-15T00:00:00Z'));
    expect(w.map((x) => x.month)).toEqual(['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']);
    expect(w[0].gte.toISOString()).toBe('2025-08-01T00:00:00.000Z');
  });
});

describe('computeDashboardAnalytics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('breakdown counts real statuses; missing statuses default to 0', async () => {
    loadFixture(FIXTURE);
    const a = await computeDashboardAnalytics(ORG_A, NOW);
    // COMPLETED: Jul,Jun,Feb,Jan = 4 ; NEEDS_REVIEW: Jun,May = 2 ; REJECTED: 1
    expect(a.statusBreakdown).toEqual({ COMPLETED: 4, NEEDS_REVIEW: 2, REJECTED: 1 });
  });

  it('missing status still present as 0 (stable shape)', async () => {
    loadFixture([{ organizationId: ORG_A, status: 'COMPLETED', processedAt: d('2026-07-01T00:00:00Z') }]);
    const a = await computeDashboardAnalytics(ORG_A, NOW);
    expect(a.statusBreakdown).toEqual({ COMPLETED: 1, NEEDS_REVIEW: 0, REJECTED: 0 });
  });

  it('monthlySeries buckets processed docs (COMPLETED+NEEDS_REVIEW) by processedAt; window length 6', async () => {
    loadFixture(FIXTURE);
    const a = await computeDashboardAnalytics(ORG_A, NOW);
    expect(a.monthlySeries).toHaveLength(SERIES_MONTHS);
    expect(a.monthlySeries).toEqual([
      { month: '2026-02', count: 1 }, // Feb COMPLETED
      { month: '2026-03', count: 0 },
      { month: '2026-04', count: 0 },
      { month: '2026-05', count: 1 }, // May NEEDS_REVIEW
      { month: '2026-06', count: 2 }, // Jun COMPLETED + NEEDS_REVIEW (REJECTED excluded)
      { month: '2026-07', count: 1 }, // Jul COMPLETED (FAILED + PROCESSING excluded)
    ]);
  });

  it('periods reuse the last two buckets (this/last month)', async () => {
    loadFixture(FIXTURE);
    const a = await computeDashboardAnalytics(ORG_A, NOW);
    expect(a.periods).toEqual({ thisMonth: { processed: 1 }, lastMonth: { processed: 2 } });
  });

  it('REJECTED, FAILED and PROCESSING are excluded from series/periods', async () => {
    // Only non-processed statuses this month -> series/periods must be 0.
    loadFixture([
      { organizationId: ORG_A, status: 'REJECTED', processedAt: d('2026-07-10T00:00:00Z') },
      { organizationId: ORG_A, status: 'FAILED', processedAt: d('2026-07-11T00:00:00Z') },
      { organizationId: ORG_A, status: 'PROCESSING', processedAt: null },
    ]);
    const a = await computeDashboardAnalytics(ORG_A, NOW);
    expect(a.periods.thisMonth.processed).toBe(0);
    expect(a.monthlySeries.every((m) => m.count === 0)).toBe(true);
  });

  it('is strictly org-scoped: ORG_B docs never leak into ORG_A', async () => {
    loadFixture(FIXTURE);
    const a = await computeDashboardAnalytics(ORG_A, NOW);
    // If ORG_B leaked, Jul would be 2 and breakdown COMPLETED would be 5.
    expect(a.periods.thisMonth.processed).toBe(1);
    expect(a.statusBreakdown.COMPLETED).toBe(4);
    // And every query issued was filtered to ORG_A.
    const allCalls = [
      ...(prisma.document.count as any).mock.calls,
      ...(prisma.document.groupBy as any).mock.calls,
    ];
    expect(allCalls.length).toBeGreaterThan(0);
    for (const [args] of allCalls) {
      expect(args.where.organizationId).toBe(ORG_A);
    }
  });

  it('brand-new account (no docs) returns real zeros, never fabricated data', async () => {
    loadFixture(FIXTURE);
    const a = await computeDashboardAnalytics(ORG_C, NOW);
    expect(a.statusBreakdown).toEqual({ COMPLETED: 0, NEEDS_REVIEW: 0, REJECTED: 0 });
    expect(a.monthlySeries).toHaveLength(SERIES_MONTHS);
    expect(a.monthlySeries.every((m) => m.count === 0)).toBe(true);
    expect(a.periods).toEqual({ thisMonth: { processed: 0 }, lastMonth: { processed: 0 } });
  });

  it('issues a bounded, fixed number of queries (1 groupBy + 6 counts), no N+1', async () => {
    loadFixture(FIXTURE);
    await computeDashboardAnalytics(ORG_A, NOW);
    expect((prisma.document.groupBy as any).mock.calls).toHaveLength(1);
    expect((prisma.document.count as any).mock.calls).toHaveLength(SERIES_MONTHS);
  });
});
