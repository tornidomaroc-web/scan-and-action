# Prod Migration-Status Diagnostic — is the latest migration applied?

**Inspected from:** `main` @ `939d4fdbeb6deaaffa8db453577303a8a7803180`
**Date:** 2026-07-19 · **Mode:** READ-ONLY. No migration applied/created/edited/rolled back. No write
to the DB — only `prisma migrate status` (read-only) and two `SELECT`s against `information_schema` /
`_prisma_migrations`.
**Resolves:** BLOCKING item #1 of `docs/PRODUCTION_READINESS_AUDIT_2026-07-18.md`.

## Answer

**YES — the latest schema is applied** to the database reachable from `apps/backend/.env`
(host `aws-1-eu-west-1.pooler.supabase.com`, EU). The `Entity.displayName` column physically exists and
all 7 migrations are recorded as genuinely applied (not `resolve`-marked). **One confirmation is yours
to make:** that this host/project is the same DB the live Railway backend uses (see §Caveat).

## 1. The migration + DDL (repo evidence)

Latest migration introducing `displayName`:
`apps/backend/prisma/migrations/20260709120000_add_entity_display_name/migration.sql`

```sql
-- AlterTable
ALTER TABLE "Entity" ADD COLUMN     "displayName" TEXT;
```

It is the newest of 7 migrations. (Correction to the request's phrasing: `entityResolution.ts:55` is the
**write** — `prisma.entity.create({ data: { …, displayName: … } })` at `:46-59`; `documentDto.ts:30` is
the **read**. The direction doesn't change the risk, but the record should be exact.)

## 2. Applied to the DB? — method + verbatim results

**Method A — `npx prisma migrate status`** (read-only; reads `_prisma_migrations`, reports drift, never
applies). Run from `apps/backend` (auto-loads `.env`; `datasource.directUrl` → `DIRECT_URL`, the direct
5432 connection). Verbatim (credentials redacted):

```
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-1-eu-west-1.pooler.supabase.com:5432"

7 migrations found in prisma/migrations

Database schema is up to date!
```
Exit code 0.

**Method B — physical column + history check** (two `SELECT`s; `information_schema.columns` and
`_prisma_migrations`). This closes the one gap `migrate status` alone leaves — a `migrate resolve` can
mark a migration "applied" in history without the DDL ever running. Verbatim:

```
DISPLAYNAME_COLUMN_PRESENT: true
COLUMN_DETAIL: [ { "column_name": "displayName", "data_type": "text", "is_nullable": "YES" } ]
LAST_3_MIGRATIONS: [
  { "migration_name": "20260709120000_add_entity_display_name",    "finished_at": "2026-07-09T10:29:15.668Z", "rolled_back_at": null },
  { "migration_name": "20260702120000_add_document_analytics_indexes","finished_at": "2026-07-09T10:29:15.267Z", "rolled_back_at": null },
  { "migration_name": "20260622120000_add_welcome_email_sent_at",   "finished_at": "2026-06-22T04:51:33.437Z", "rolled_back_at": null }
]
```

The column **physically exists** (`text`, nullable) AND migration #7 has a real `finished_at`
(`2026-07-09 10:29:15Z`) with `rolled_back_at: null`. So it was genuinely run, not resolve-marked. The
apply timestamp (2026-07-09, between production access on 07-08 and store submission on 07-10) is
consistent with a pre-launch apply against the production DB.

## 3. Reachability

Prod credentials **were** present locally (`apps/backend/.env`, gitignored) and the DB **was reachable**
from this environment, so a live read-only check was possible — no need to hand it back to you blind. If
you want to re-confirm against your canonical prod URL yourself, the exact **read-only** command is:

```bash
cd apps/backend && npx prisma migrate status
# (reads _prisma_migrations only; it NEVER applies. Ensure DATABASE_URL/DIRECT_URL point at prod.)
```
Definitive physical check (read-only), if you prefer SQL against the prod URL:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='Entity' AND column_name='displayName';
-- one row  = applied;  zero rows = MISSING (outage risk, see §4)
```

## 4. Blast radius (confirmed inert here, since the column exists)

Had the column been missing, every query that includes the Entity relation would 500: Prisma's
`include: { entity: true }` selects all Entity scalars, emitting `SELECT … "displayName" …`, and Postgres
would raise `column "Entity".displayName does not exist` → `PrismaClientKnownRequestError` → 500. The
affected paths:
- `documentController.ts:19` (document detail), `:49` (review queue), `:212` (recent), `:336` (fix-action re-fetch)
- `services/expenseSummaryService.ts:25` (expense summary)
- `services/query/queryExecutor.ts:120,132` (search / extract-contacts)
- **plus every entity create during ingestion** — `entityResolution.ts:46` writes `displayName`, so
  extraction persistence itself would fail.
Because the column is present, none of this fires. **Blast radius = not triggered.**

## 5. Any OTHER unapplied migration?

No. `migrate status` reports **"Database schema is up to date!"** (all 7 found migrations applied, none
pending), and the history query shows the two most recent migrations (#7, #6) both applied on
2026-07-09 with no rollback. There is no migration newer than what the migrations table records as
applied. No second latent outage of this class.

## Verdict

**Latest schema applied to prod: YES** — for the DB at `aws-1-eu-west-1.pooler.supabase.com` (the one in
`apps/backend/.env`). Migration #7 (`displayName`) is applied and the column physically exists; no other
migration is pending. Nothing was mutated.

### Caveat (the one thing to confirm)
I verified the DB reachable from the local backend `.env`. I could **not** prove from here that this
project-ref is byte-identical to the `DATABASE_URL` the **Railway** production backend runs with (the
project-ref is inside the redacted credentials, and Railway's env is not in this repo). The evidence that
it *is* prod is strong (remote EU Supabase, the backend's operational env, migration apply-time aligned
with launch), but if you maintain a separate prod URL only in Railway, run the §3 command against **that**
URL to close the last 1%. If they match — which is the likely case — this BLOCKING item is **cleared**.

### Note on the structural gap (unchanged)
This diagnostic clears the *instance* (migration #7 is applied). It does **not** fix the *process* the
audit flagged: CI still never runs `prisma migrate deploy`, so a **future** migration can merge and
deploy while unapplied. The next migration is the next chance for this exact outage. That remains a
separate, open item — not something to fix here.
