/**
 * Item B — Phase 2 verification gate for the displayName backfill. MANDATORY.
 *
 * For EVERY Entity row, asserts:
 *   - If aliases[0] is a usable original name  -> displayName === aliases[0] exactly.
 *   - If aliases is NULL/empty/whitespace-only -> displayName IS NULL (deliberate,
 *     never fabricated). These "skipped" rows are reported separately as
 *     expected-and-acceptable, NOT as failures.
 * It also explicitly fails a LAUNDERED value: a displayName equal to the
 * (mangled) canonicalName while a different usable aliases[0] exists.
 *
 * Read-only: makes no changes. Exits non-zero if any mismatch is found, so it can
 * gate the backfill. Safe to run before AND after the backfill — BEFORE the
 * backfill it is EXPECTED to report mismatches (every usable row still has a NULL
 * displayName); the run that matters is the post-backfill one, which must be 0.
 *
 * The `recoverableName` predicate below is IDENTICAL to the one in
 * backfillEntityDisplayName.ts and MUST stay in sync — verify asserts exactly
 * what the backfill writes.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function recoverableName(aliases: unknown): string | null {
  if (!Array.isArray(aliases) || aliases.length === 0) return null;
  const first = aliases[0];
  if (typeof first !== 'string' || first.trim() === '') return null;
  return first;
}

async function main() {
  const rows = await prisma.entity.findMany({
    select: { id: true, displayName: true, aliases: true, canonicalName: true },
  });

  let backfilledOk = 0; // usable + displayName === aliases[0]
  let deliberateNull = 0; // unrecoverable + displayName === null (expected/acceptable)
  let mismatches = 0;

  for (const r of rows) {
    const expected = recoverableName(r.aliases);
    const dn = r.displayName;

    if (expected !== null) {
      // Row has a usable original name — displayName must equal it exactly.
      if (dn === null) {
        mismatches++;
        console.error(
          `[verify][MISMATCH] entity=${r.id} usable aliases[0]=${JSON.stringify(expected)} ` +
            `but displayName IS NULL (not backfilled).`
        );
      } else if (dn !== expected) {
        mismatches++;
        // Call out the specific laundering case for a clearer signal.
        const laundered = dn === r.canonicalName && r.canonicalName !== expected;
        console.error(
          `[verify][MISMATCH]${laundered ? '[LAUNDERED]' : ''} entity=${r.id} ` +
            `displayName=${JSON.stringify(dn)} != aliases[0]=${JSON.stringify(expected)}` +
            (laundered ? ` (displayName equals the mangled canonicalName)` : '')
        );
      } else {
        backfilledOk++;
      }
    } else {
      // Unrecoverable row — displayName must be NULL (never fabricated).
      if (dn === null) {
        deliberateNull++;
      } else {
        mismatches++;
        console.error(
          `[verify][MISMATCH] entity=${r.id} unrecoverable (aliases empty/whitespace) ` +
            `but displayName=${JSON.stringify(dn)} (fabricated — must be NULL).`
        );
      }
    }
  }

  console.log(`[verify] Entity rows checked         : ${rows.length}`);
  console.log(`[verify]   backfilled (== aliases[0]) : ${backfilledOk}`);
  console.log(`[verify]   deliberately NULL (skipped): ${deliberateNull}  (expected/acceptable)`);
  console.log(`[verify]   mismatches                 : ${mismatches}`);

  if (mismatches > 0) {
    console.error(
      `[verify][FAIL] ${mismatches} row(s) do not match the backfill contract. Do NOT proceed. ` +
        `(If this run is BEFORE the backfill, that is expected — run the backfill first.)`
    );
    process.exit(1);
  }

  console.log('[verify][PASS] 0 mismatches. Every usable row has displayName === aliases[0]; skipped rows are NULL.');
}

main()
  .catch((e) => {
    console.error('[verify][ERROR]', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
