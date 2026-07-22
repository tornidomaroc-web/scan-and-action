/**
 * The Paddle prices we are willing to grant PRO for.
 *
 * WHY COMMITTED CONFIG AND NOT A RAILWAY ENV VAR:
 * an env var here would recreate audit item #4's drift on the server side, where
 * the failure mode is worse than on the client. On the frontend a stale value
 * showed a customer the wrong number; here a stale value would mean the backend
 * does not recognise a price the frontend is actively selling — i.e. we would
 * alert on (or, under enforcement, reject) our own legitimate customers. A value
 * that must agree with a committed frontend constant belongs in version control
 * next to it, not in a dashboard where no review or test can see it.
 *
 * These ids are NOT secrets. They are already inlined in the public web bundle by
 * design (see apps/frontend/src/lib/pricing.ts), so committing them costs nothing
 * and buys git history, code review and testability.
 *
 * ── HOW THIS IS KEPT FROM DRIFTING FROM THE FRONTEND ──────────────────────────
 * apps/frontend/src/lib/pricing.ts is the source of truth for what we CHARGE.
 * This file is the source of truth for what we ACCEPT. They must name the same
 * ids, and the backend cannot import the frontend module: they are separate
 * packages, and apps/backend/tsconfig.json sets `include: ["src/**"]` with no
 * explicit rootDir, so reaching across would move the inferred rootDir and break
 * the dist/index.js entry point (the same trap documented in
 * src/testSupport/paddleAdjustment.ts).
 *
 * So instead of a fragile import, the equality is ASSERTED BY TEST:
 * paddlePrices.test.ts reads the frontend file from disk and fails if the two
 * sets of ids diverge. Adding a price in one place and not the other fails CI —
 * which is the actual guarantee we want, and is stronger than an import (an
 * import would only prove the code compiles, not that the sets match).
 */

/** Paddle price ids that may grant PRO. Must match apps/frontend/src/lib/pricing.ts. */
export const CANONICAL_PADDLE_PRICE_IDS: ReadonlySet<string> = new Set([
  // Monthly
  'pri_01kpnqr5df47ce3nvfh92qmxc9',
  // Annual
  'pri_01kts9jg7y4kn854q36scrq3vg',
]);

/** True when every supplied price id is one we sell. Empty input is NOT "known". */
export function areAllPricesCanonical(priceIds: readonly string[]): boolean {
  return priceIds.length > 0 && priceIds.every((id) => CANONICAL_PADDLE_PRICE_IDS.has(id));
}

/** The ids that are not in the catalog — what an alert should name. */
export function unknownPriceIds(priceIds: readonly string[]): string[] {
  return priceIds.filter((id) => !CANONICAL_PADDLE_PRICE_IDS.has(id));
}
