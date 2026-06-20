/**
 * Phase B verification gate — MANDATORY, blocks success.
 *
 * For EVERY organization, asserts:
 *     derivePlan(planOverride, its subscriptions) === stored Organization.plan
 *
 * The backfill is NOT done until this reports 0 mismatches. Any PRO org that
 * would lose entitlement is a direct revenue loss and an immediate stop.
 *
 * Read-only: makes no changes. Exits non-zero if any mismatch is found, so it
 * can gate a deploy pipeline. Safe to run before AND after the backfill — before
 * the backfill it is EXPECTED to report mismatches (every PRO/ENTERPRISE org,
 * since no subscriptions/overrides exist yet); the gate that matters is the
 * post-backfill run, which must be 0.
 *
 * Reuses the exact same derivePlan the entitlement service will use in Step 2b,
 * so the gate proves the data matches the runtime contract.
 */
import { PrismaClient } from '@prisma/client';
import { derivePlan } from '../src/services/entitlement/derivePlan';

const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      plan: true,
      planOverride: true,
      subscriptions: { select: { status: true } },
    },
  });

  let mismatches = 0;
  for (const org of orgs) {
    const derived = derivePlan(org.planOverride, org.subscriptions);
    if (derived !== org.plan) {
      mismatches++;
      console.error(
        `[verify][MISMATCH] org=${org.id} stored=${org.plan} derived=${derived} ` +
          `planOverride=${org.planOverride ?? 'null'} ` +
          `subs=[${org.subscriptions.map((s) => s.status).join(',') || 'none'}]`
      );
    }
  }

  console.log(`[verify] Organizations checked : ${orgs.length}`);
  console.log(`[verify] Mismatches            : ${mismatches}`);

  if (mismatches > 0) {
    console.error(
      `[verify][FAIL] ${mismatches} org(s) would have a different entitlement under the new model. ` +
        `Do NOT proceed. (If this run is BEFORE the backfill, that is expected — run the backfill first.)`
    );
    process.exit(1);
  }

  console.log('[verify][PASS] 0 mismatches. Stored plan matches derived plan for every org.');
}

main()
  .catch((e) => {
    console.error('[verify][ERROR]', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
