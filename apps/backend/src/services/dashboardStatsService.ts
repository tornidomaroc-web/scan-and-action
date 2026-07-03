import { prisma } from '../prismaClient';

/**
 * Dashboard analytics for GET /documents/stats (PR-C1).
 *
 * Returns RAW counts only — no percentages, no deltas. The frontend (PR-C2)
 * decides how to render trends, so the backend stays honest and easy to test.
 *
 * Decisions locked for v1:
 *  - Breakdown is over REAL statuses only (COMPLETED / NEEDS_REVIEW / REJECTED).
 *    FAILED and in-flight PROCESSING are NOT surfaced. No invented
 *    "Approved"/"Flagged" buckets.
 *  - "Processed" for the time series / period counts means COMPLETED or
 *    NEEDS_REVIEW — matching the existing getStats totalCount definition.
 *  - Month buckets are computed in UTC. There is no per-org timezone yet, so a
 *    user far from UTC sees month boundaries shift by their offset. Acceptable
 *    for v1; revisit if/when an org timezone is stored.
 */

// Statuses that count as "processed" (matches getStats totalCount).
export const PROCESSED_STATUSES = ['COMPLETED', 'NEEDS_REVIEW'] as const;
// Statuses shown in the user-facing by-status breakdown (FAILED/PROCESSING out).
export const BREAKDOWN_STATUSES = ['COMPLETED', 'NEEDS_REVIEW', 'REJECTED'] as const;

// Trailing window length for the "documents processed" chart, including the
// current month.
export const SERIES_MONTHS = 6;

export interface MonthWindow {
  /** 'YYYY-MM' (UTC). */
  month: string;
  /** Inclusive lower bound (first instant of the month, UTC). */
  gte: Date;
  /** Exclusive upper bound (first instant of the next month, UTC). */
  lt: Date;
}

export interface DashboardAnalytics {
  statusBreakdown: { COMPLETED: number; NEEDS_REVIEW: number; REJECTED: number };
  monthlySeries: Array<{ month: string; count: number }>;
  periods: {
    thisMonth: { processed: number };
    lastMonth: { processed: number };
  };
}

/**
 * The trailing `count` UTC month windows, oldest → newest, ending in the month
 * containing `now`. Date.UTC handles month/year underflow (e.g. Jan → prior
 * year) automatically.
 */
export function buildMonthWindows(now: Date, count: number = SERIES_MONTHS): MonthWindow[] {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const windows: MonthWindow[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const gte = new Date(Date.UTC(y, m - i, 1));
    const lt = new Date(Date.UTC(y, m - i + 1, 1));
    const month = `${gte.getUTCFullYear()}-${String(gte.getUTCMonth() + 1).padStart(2, '0')}`;
    windows.push({ month, gte, lt });
  }
  return windows;
}

/**
 * Computes the additive analytics block for one organization at time `now`.
 *
 * Query budget is FIXED regardless of row count (no N+1): one groupBy for the
 * breakdown + one bounded count per month window. The this/last-month period
 * counts REUSE the last two series buckets, so they cost no extra queries. All
 * queries are scoped to `organizationId`; there is no cross-org path.
 */
export async function computeDashboardAnalytics(
  organizationId: string,
  now: Date
): Promise<DashboardAnalytics> {
  const windows = buildMonthWindows(now, SERIES_MONTHS);

  // Fire everything concurrently: 1 groupBy + SERIES_MONTHS counts.
  const [breakdownRows, ...monthCounts] = await Promise.all([
    prisma.document.groupBy({
      by: ['status'],
      where: {
        organizationId,
        status: { in: [...BREAKDOWN_STATUSES] },
      },
      _count: { _all: true },
    }),
    ...windows.map((w) =>
      prisma.document.count({
        where: {
          organizationId,
          status: { in: [...PROCESSED_STATUSES] },
          processedAt: { gte: w.gte, lt: w.lt },
        },
      })
    ),
  ]);

  // Stable shape: every breakdown key present, defaulting to 0.
  const statusBreakdown = { COMPLETED: 0, NEEDS_REVIEW: 0, REJECTED: 0 };
  for (const row of breakdownRows) {
    if (row.status in statusBreakdown) {
      statusBreakdown[row.status as keyof typeof statusBreakdown] = row._count._all;
    }
  }

  const monthlySeries = windows.map((w, i) => ({ month: w.month, count: monthCounts[i] }));

  // Current month is the last bucket; previous month the one before it.
  const thisMonth = monthCounts[monthCounts.length - 1] ?? 0;
  const lastMonth = monthCounts[monthCounts.length - 2] ?? 0;

  return {
    statusBreakdown,
    monthlySeries,
    periods: {
      thisMonth: { processed: thisMonth },
      lastMonth: { processed: lastMonth },
    },
  };
}
