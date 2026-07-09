/**
 * Item B — Phase 2 data-layer backfill: populate Entity.displayName.
 *
 * Phase 1 added a nullable `displayName` column (all rows NULL). This script
 * copies the human-readable original name into it so the display layer can stop
 * rendering the normalized `canonicalName` matching key. The original spelling
 * (casing + accents) was preserved at write time in `aliases[0]`
 * (entityResolution.ts sets `aliases: [rawName.trim()]`), so that is the source
 * of truth.
 *
 * HONESTY RULE (absolute): never fabricate a name. A row is UNRECOVERABLE when
 * `aliases` is NULL/empty or `aliases[0]` is not a non-empty string. Such rows
 * are LEFT NULL and counted — we do NOT fall back to `canonicalName`, because
 * canonicalName is the uppercased, accent/punctuation-stripped key; writing it
 * into displayName would launder a corrupted value into a field that claims to
 * hold the real name.
 *
 * Idempotent: only rows with `displayName IS NULL` are touched, and each write
 * is guarded (`updateMany where displayName: null`). A second run is a no-op and
 * can never overwrite an existing displayName.
 *
 * SAFETY: read-first preflight computes the exact write set and prints a summary;
 * ALL writes run in a single $transaction (all-or-nothing). A reconciliation
 * check STOPS (rolls back / never writes) rather than proceed on an inconsistent
 * count instead of guessing.
 *
 * Mirrors the shape of scripts/backfillSubscriptions.ts. Run AFTER Phase 1's
 * `prisma migrate deploy`. Then run the verification gate
 * (verifyEntityDisplayName.ts), which must report 0 mismatches.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class StopBackfill extends Error {}

/**
 * The single source-of-truth predicate, IDENTICAL in the verify script — they
 * MUST stay in sync (backfill writes exactly what verify asserts).
 * Returns the verbatim original name to store, or null when unrecoverable.
 * Guards against a NULL array element (String(null) would otherwise become the
 * literal "null") and whitespace-only strings.
 */
function recoverableName(aliases: unknown): string | null {
  if (!Array.isArray(aliases) || aliases.length === 0) return null;
  const first = aliases[0];
  if (typeof first !== 'string' || first.trim() === '') return null;
  return first; // verbatim — casing and accents preserved, never trimmed on write
}

async function main() {
  console.log('[backfill] Starting Item B Phase 2 displayName backfill (idempotent)...');

  // --- Preflight (reads only). Compute the exact write set. ---
  const rows = await prisma.entity.findMany({
    select: { id: true, displayName: true, aliases: true },
  });

  const total = rows.length;
  const alreadyPopulated = rows.filter((r) => r.displayName !== null).length;
  const candidates = rows.filter((r) => r.displayName === null);

  const toWrite: { id: string; value: string }[] = [];
  let unrecoverable = 0;
  for (const r of candidates) {
    const name = recoverableName(r.aliases);
    if (name === null) {
      unrecoverable++;
    } else {
      toWrite.push({ id: r.id, value: name });
    }
  }

  console.log(`[backfill] Entity rows total                 : ${total}`);
  console.log(`[backfill]   already populated (skip)        : ${alreadyPopulated}`);
  console.log(`[backfill]   NULL displayName (candidates)   : ${candidates.length}`);
  console.log(`[backfill]     -> recoverable (will update)  : ${toWrite.length}`);
  console.log(`[backfill]     -> unrecoverable (leave NULL) : ${unrecoverable}`);

  // Reconciliation: STOP rather than write a partial/guessed set.
  if (toWrite.length + unrecoverable !== candidates.length) {
    throw new StopBackfill(
      `Candidate accounting does not reconcile ` +
        `(${toWrite.length} + ${unrecoverable} != ${candidates.length}). Aborting without changes.`
    );
  }
  if (candidates.length + alreadyPopulated !== total) {
    throw new StopBackfill(
      `Row accounting does not reconcile ` +
        `(${candidates.length} + ${alreadyPopulated} != ${total}). Aborting without changes.`
    );
  }

  if (toWrite.length === 0) {
    console.log('[backfill] Nothing to update. Done (no-op).');
    return;
  }

  // --- Mutations in one transaction (all-or-nothing). ---
  // Each write is guarded on `displayName: null` so it can never overwrite an
  // existing value even under a race; a guarded no-match simply updates 0 rows.
  let updated = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const w of toWrite) {
        const res = await tx.entity.updateMany({
          where: { id: w.id, displayName: null },
          data: { displayName: w.value },
        });
        updated += res.count;
      }
    },
    { timeout: 60_000, maxWait: 15_000 }
  );

  console.log('[backfill] Done.');
  console.log(`[backfill]   Rows updated (displayName set)  : ${updated}`);
  console.log(`[backfill]   Rows skipped (unrecoverable)    : ${unrecoverable}`);
  console.log(`[backfill]   Rows already populated          : ${alreadyPopulated}`);
  console.log('[backfill] Next: run `npm run verify:entity-display-name` — it MUST report 0 mismatches.');
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
