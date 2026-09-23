/**
 * RECOVERY CENSUS. Read-only. Counts the documents a recovery could touch, and
 * whose they are, without reading any money, name, id or day-level date.
 *
 *   cd apps/backend && npx tsx scripts/recoveryCensus.ts
 *
 * Run it from apps/backend so dotenv loads DATABASE_URL: the credential is never
 * read, printed or passed on the command line.
 *
 * This file is the only one that holds the database handle, and it does four
 * things: open ONE transaction, make it read-only and refuse to read until the
 * database confirms it, run the two fixed queries from recoveryCensusCore.ts,
 * and print what the core's disclosure gate rendered. Everything that decides
 * what may be published lives in the core, where it can be tested without a
 * database; see that file's header for the privacy contract.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  CENSUS_QUERY,
  POPULATION_QUERY,
  CensusControlError,
  CensusShapeError,
  assertCensusRows,
  assertPopulation,
  checkControls,
  render,
  runSealed,
} from './recoveryCensusCore';

const prisma = new PrismaClient();

async function main() {
  const lines = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const ro = await tx.$queryRaw<{ transaction_read_only: string }[]>`SHOW transaction_read_only`;
    if (ro[0]?.transaction_read_only !== 'on') throw new CensusControlError('C0 the transaction is not read-only, so nothing was read');
    const population = assertPopulation(await tx.$queryRaw(POPULATION_QUERY));
    const rows = assertCensusRows(await tx.$queryRaw(CENSUS_QUERY), population.organisations);
    return render([checkControls(population, rows), ...runSealed(rows)]);
  }, { timeout: 60_000, maxWait: 10_000 });
  console.log(['C0 read-only transaction: on', ...lines].join('\n'));
}

main()
  .catch((e) => {
    // A control's message carries only global counts and a shape error's only
    // column names, so both are printed. Anything else prints its class and code
    // only: a database error can echo a value.
    const safe = e instanceof CensusControlError || e instanceof CensusShapeError;
    const detail = safe ? e.message : `${e?.constructor?.name ?? 'Error'} ${e?.code ?? ''}`;
    console.error(`recoveryCensus stopped, and nothing below the controls was printed: ${detail}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
