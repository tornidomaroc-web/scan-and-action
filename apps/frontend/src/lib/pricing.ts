/**
 * THE single source of truth for what we sell and what it costs.
 *
 * WHY THE PRICE IDS ARE COMMITTED HERE RATHER THAN READ FROM VITE_ ENV:
 * they used to come from `import.meta.env.VITE_PADDLE_PRICE_ID_*` (Vercel
 * dashboard). That bought nothing and cost a source of truth. `VITE_` variables
 * are INLINED AT BUILD TIME, so changing one in the Vercel dashboard already
 * requires a redeploy — exactly the same operational cost as editing this file.
 * What the env var did add was a second, invisible copy of the value: not in git,
 * not in code review, not testable, and free to disagree with the price we print.
 * These ids are not secrets (they are already inlined in the public bundle by
 * design), so committing them is pure gain. ONE definition, in version control.
 *
 * Do not reintroduce a VITE_PADDLE_PRICE_ID_* read. If you need a sandbox price,
 * change it here on a branch — the same redeploy you would have needed anyway.
 *
 * DISPLAYED PRICE vs CHARGED PRICE:
 * The amounts below are ONLY a fallback for when Paddle's PricePreview cannot be
 * reached. The real displayed price comes from PricePreview, for the exact
 * `priceId` in this file — the same id handed to Checkout.open. That is what makes
 * displayed == charged true by construction rather than by convention. If you
 * change an amount in the Paddle dashboard, the UI follows automatically; these
 * fallbacks only need updating so the offline path is not stale.
 */

export type Plan = 'monthly' | 'yearly';

export interface PlanCatalogEntry {
  /** Paddle price id — the ONLY thing sent to Checkout.open and PricePreview. */
  priceId: string;
  /**
   * Shown only if PricePreview fails. Deliberately currency-explicit and plain:
   * an offline fallback should look like a fallback, not like a live local price.
   */
  fallbackFormatted: string;
  /** Same amount as a number, so the savings badge can be derived, never frozen. */
  fallbackAmount: number;
  /** Rendered next to the amount ("/mo", "/yr"). */
  periodSuffix: string;
}

export const PLAN_CATALOG: Record<Plan, PlanCatalogEntry> = {
  monthly: {
    priceId: 'pri_01kpnqr5df47ce3nvfh92qmxc9',
    fallbackFormatted: '$9',
    fallbackAmount: 9,
    periodSuffix: '/mo',
  },
  yearly: {
    priceId: 'pri_01kts9jg7y4kn854q36scrq3vg',
    fallbackFormatted: '$59',
    fallbackAmount: 59,
    periodSuffix: '/yr',
  },
};

/** Stable display order, and the order prices are requested from Paddle. */
export const PLAN_ORDER: readonly Plan[] = ['monthly', 'yearly'];

/**
 * Reverse lookup: which plan does a Paddle price id belong to?
 * Used to match PricePreview line items back to plans BY ID rather than by array
 * position — Paddle does not promise line items come back in request order, and
 * showing the yearly total on the monthly tile would be the exact class of bug
 * this module exists to prevent. Unknown ids return null and are ignored.
 */
export function planForPriceId(priceId: string): Plan | null {
  return PLAN_ORDER.find((plan) => PLAN_CATALOG[plan].priceId === priceId) ?? null;
}

/**
 * Yearly saving vs paying monthly for a year, as a whole percent.
 *
 * DERIVED, NEVER TYPED. The old UI carried a frozen "Save 45%" literal beside two
 * other frozen literals; any price change silently turned it into a false
 * advertising claim. Both inputs must be in the SAME currency — they always are,
 * because both come from one PricePreview response (one currencyCode).
 *
 * Returns null when the inputs are unusable or the yearly plan is not actually
 * cheaper, so the caller can drop the badge rather than print "Save 0%" or a
 * negative saving.
 */
export function yearlySavingsPercent(
  monthlyTotal: number | undefined,
  yearlyTotal: number | undefined
): number | null {
  if (!Number.isFinite(monthlyTotal) || !Number.isFinite(yearlyTotal)) return null;
  const yearAtMonthlyRate = (monthlyTotal as number) * 12;
  if (yearAtMonthlyRate <= 0) return null;
  const saved = yearAtMonthlyRate - (yearlyTotal as number);
  if (saved <= 0) return null;
  return Math.round((saved / yearAtMonthlyRate) * 100);
}

/** The savings badge for the offline fallback path, derived from the same rule. */
export function fallbackSavingsPercent(): number | null {
  return yearlySavingsPercent(
    PLAN_CATALOG.monthly.fallbackAmount,
    PLAN_CATALOG.yearly.fallbackAmount
  );
}
