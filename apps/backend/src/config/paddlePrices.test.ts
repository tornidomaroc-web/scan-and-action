import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  CANONICAL_PADDLE_PRICE_IDS,
  areAllPricesCanonical,
  unknownPriceIds,
} from './paddlePrices';

// apps/backend/src/config -> apps/frontend/src/lib/pricing.ts
const FRONTEND_PRICING = path.resolve(
  __dirname,
  '../../../frontend/src/lib/pricing.ts'
);

describe('paddlePrices — anti-drift against the frontend catalog', () => {
  // ==========================================================================
  // THE DRIFT GUARD.
  //
  // The frontend decides what we CHARGE; this backend config decides what we
  // ACCEPT. If they diverge, the backend alerts on (or, under enforcement,
  // rejects) our own paying customers — the server-side version of the exact
  // drift audit item #4 was about.
  //
  // The backend cannot import the frontend module (separate packages, and
  // backend tsconfig `include: ["src/**"]` with no rootDir — reaching across
  // would relocate the emit and break dist/index.js). So the equality is proven
  // by reading the file instead. That is deliberately stronger than an import
  // would be: an import proves compilation, this proves the SETS MATCH.
  //
  // If this fails: a price id was added or changed in one place and not the
  // other. Fix the mismatch — do not delete the test.
  // ==========================================================================
  it('DRIFT GUARD: accepts exactly the price ids the frontend sells', () => {
    const source = fs.readFileSync(FRONTEND_PRICING, 'utf8');
    const frontendIds = new Set(source.match(/pri_[a-z0-9]+/g) ?? []);

    // Guard the guard: if the frontend file is ever restructured so no ids are
    // found, this test must fail rather than vacuously pass on two empty sets.
    expect(frontendIds.size).toBeGreaterThan(0);

    expect([...frontendIds].sort()).toEqual([...CANONICAL_PADDLE_PRICE_IDS].sort());
  });
});

describe('paddlePrices — helpers', () => {
  const MONTHLY = 'pri_01kpnqr5df47ce3nvfh92qmxc9';
  const YEARLY = 'pri_01kts9jg7y4kn854q36scrq3vg';

  it('accepts a known price', () => {
    expect(areAllPricesCanonical([MONTHLY])).toBe(true);
    expect(areAllPricesCanonical([MONTHLY, YEARLY])).toBe(true);
  });

  it('rejects a mixed set — one unknown price taints the whole grant', () => {
    expect(areAllPricesCanonical([MONTHLY, 'pri_legacy_five_dollar'])).toBe(false);
  });

  it('treats an EMPTY list as not-canonical, never as vacuously fine', () => {
    // An event we could not read prices from must not be silently blessed.
    expect(areAllPricesCanonical([])).toBe(false);
  });

  it('names exactly the unknown ids, for the alert', () => {
    expect(unknownPriceIds([MONTHLY, 'pri_promo', 'pri_lifetime'])).toEqual([
      'pri_promo',
      'pri_lifetime',
    ]);
    expect(unknownPriceIds([MONTHLY, YEARLY])).toEqual([]);
  });
});
