/**
 * Phase B data-layer backfill — idempotent, safely re-runnable.
 *
 * Translates the current stored Organization.plan values into the new per-source
 * model so that NO existing entitlement changes:
 *
 *   - plan = ENTERPRISE        -> set planOverride = ENTERPRISE (manual floor),
 *                                 no Subscription row.
 *   - plan = PRO (normal org)  -> upsert Subscription(PADDLE, ACTIVE).
 *                                 Today PRO can only come from Paddle, so this is
 *                                 the correct source attribution.
 *   - plan = PRO (review acct)  -> set planOverride = PRO, NO Subscription row.
 *                                 The review account has no billing source; the
 *                                 override floor makes a future Paddle/RevenueCat
 *                                 downgrade event unable to flip it to FREE.
 *   - plan = FREE              -> nothing.
 *
 * Idempotent: Subscription writes are upserts on (organizationId, source);
 * planOverride writes are plain updates. A second run produces no duplicates and
 * no further changes.
 *
 * SAFETY: this script makes NO changes if the review account's owning org cannot
 * be resolved deterministically — it STOPS and reports, rather than guessing
 * which org gets the PRO override (guessing could leave the review account FREE
 * mid-review or wrongly elevate another org).
 *
 * Run AFTER `prisma migrate deploy`. Then run the verification gate
 * (verifyEntitlement.ts), which must report 0 mismatches.
 *
 * Env:
 *   REVIEW_ACCOUNT_EMAIL   (default: unicornapps.support@gmail.com)
 *   REVIEW_ACCOUNT_ORG_ID  (optional: explicit org id, bypasses email resolution)
 */
import { PrismaClient, PlanType } from '@prisma/client';

const prisma = new PrismaClient();

const REVIEW_ACCOUNT_EMAIL =
  process.env.REVIEW_ACCOUNT_EMAIL || 'unicornapps.support@gmail.com';
const REVIEW_ACCOUNT_ORG_ID = process.env.REVIEW_ACCOUNT_ORG_ID || null;

class StopBackfill extends Error {}

/**
 * Resolve the review account's owning org deterministically, or STOP.
 * Returns the org id, or null only when the review user genuinely does not
 * exist in this database (e.g. staging) AND no explicit org id was provided —
 * in that case there is nothing to override and normal PRO orgs are handled by
 * the billing branch. Ambiguity (user maps to >1 org, or 0 memberships) STOPS.
 */
async function resolveReviewOrgId(): Promise<string | null> {
  if (REVIEW_ACCOUNT_ORG_ID) {
    const org = await prisma.organization.findUnique({
      where: { id: REVIEW_ACCOUNT_ORG_ID },
      select: { id: true, plan: true },
    });
    if (!org) {
      throw new StopBackfill(
        `REVIEW_ACCOUNT_ORG_ID=${REVIEW_ACCOUNT_ORG_ID} does not match any organization. Aborting.`
      );
    }
    console.log(`[backfill] Review org pinned via env: ${org.id} (current plan ${org.plan})`);
    return org.id;
  }

  const user = await prisma.user.findUnique({
    where: { email: REVIEW_ACCOUNT_EMAIL },
    include: { memberships: { select: { organizationId: true } } },
  });

  if (!user) {
    console.warn(
      `[backfill][WARN] Review account ${REVIEW_ACCOUNT_EMAIL} not found in this DB. ` +
        `No PRO override will be applied. If this is production, STOP and investigate — ` +
        `set REVIEW_ACCOUNT_ORG_ID explicitly if the email differs.`
    );
    return null;
  }

  const orgIds = [...new Set(user.memberships.map((m) => m.organizationId))];

  if (orgIds.length === 0) {
    throw new StopBackfill(
      `Review account ${REVIEW_ACCOUNT_EMAIL} (user ${user.id}) has NO memberships — ` +
        `cannot determine which org gets the PRO override. Aborting without changes.`
    );
  }
  if (orgIds.length > 1) {
    throw new StopBackfill(
      `Review account ${REVIEW_ACCOUNT_EMAIL} (user ${user.id}) maps to ${orgIds.length} orgs ` +
        `(${orgIds.join(', ')}). Ambiguous — refusing to guess which gets the PRO override. ` +
        `Set REVIEW_ACCOUNT_ORG_ID explicitly and re-run. Aborting without changes.`
    );
  }

  console.log(`[backfill] Review org resolved via email ${REVIEW_ACCOUNT_EMAIL}: ${orgIds[0]}`);
  return orgIds[0];
}

async function main() {
  console.log('[backfill] Starting Phase B subscription backfill (idempotent)...');

  // --- Preflight (reads only). Resolve the review org or STOP. ---
  const reviewOrgId = await resolveReviewOrgId();

  const orgs = await prisma.organization.findMany({
    select: { id: true, plan: true, planOverride: true },
  });
  console.log(`[backfill] Scanning ${orgs.length} organizations...`);

  let paddleSubs = 0;
  let enterpriseOverrides = 0;
  let reviewOverride = 0;
  let freeSkipped = 0;

  // --- Mutations in one transaction (all-or-nothing). ---
  await prisma.$transaction(async (tx) => {
    for (const org of orgs) {
      if (org.plan === PlanType.ENTERPRISE) {
        // ENTERPRISE always becomes a manual floor (covers a review org that is
        // ENTERPRISE too — correctly, before the PRO/review branch).
        await tx.organization.update({
          where: { id: org.id },
          data: { planOverride: PlanType.ENTERPRISE },
        });
        enterpriseOverrides++;
        continue;
      }

      if (org.plan === PlanType.PRO) {
        if (org.id === reviewOrgId) {
          // Review account: no billing source -> override floor, NO subscription.
          await tx.organization.update({
            where: { id: org.id },
            data: { planOverride: PlanType.PRO },
          });
          reviewOverride++;
        } else {
          // Normal PRO org: attribute to Paddle (the only source of PRO today).
          await tx.subscription.upsert({
            where: { organizationId_source: { organizationId: org.id, source: 'PADDLE' } },
            create: { organizationId: org.id, source: 'PADDLE', status: 'ACTIVE' },
            update: { status: 'ACTIVE' },
          });
          paddleSubs++;
        }
        continue;
      }

      // FREE: nothing to do.
      freeSkipped++;
    }
  });

  console.log('[backfill] Done.');
  console.log(`[backfill]   Paddle ACTIVE subscriptions upserted : ${paddleSubs}`);
  console.log(`[backfill]   ENTERPRISE planOverride set          : ${enterpriseOverrides}`);
  console.log(`[backfill]   Review-account PRO override set       : ${reviewOverride}`);
  console.log(`[backfill]   FREE orgs skipped                    : ${freeSkipped}`);
  console.log('[backfill] Next: run `npm run verify:entitlement` — it MUST report 0 mismatches.');
}

main()
  .catch((e) => {
    if (e instanceof StopBackfill) {
      console.error(`[backfill][STOP] ${e.message}`);
    } else {
      console.error('[backfill][ERROR]', e);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
