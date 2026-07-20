# Account-Deletion FK Analysis — is deletion blocked by DocumentEntity→Entity RESTRICT?

**Inspected from:** `main` @ `939d4fdbeb6deaaffa8db453577303a8a7803180`
**Date:** 2026-07-19 · **Mode:** static + read-only. **No DB access at all** in this task — no query,
no write, no delete, no migration. Pure source + migration-SQL + Postgres-semantics reasoning.
**Re-examines:** BLOCKING item #2 of `docs/PRODUCTION_READINESS_AUDIT_2026-07-18.md`.

## TL;DR verdict

**Real risk, but the audit OVERSTATED its certainty.** The claim "deleting a user who has scanned an
entity throws a FK violation and the account cannot be deleted" is **not established** — static analysis
indicates the org-cascade delete most likely **succeeds today**, because the `Document→Organization` FK
was created *before* the `Entity→Organization` FK, so the `DocumentEntity` join rows are cascade-deleted
(via `Document`) before the `Entity` RESTRICT check runs. **But** that correctness rests on **undocumented
PostgreSQL cascade-trigger ordering**, involves the one referential action (`RESTRICT`) whose check is
*immediate/non-deferrable*, and has **zero test coverage** on a store-compliance-critical path. So the
right action is the same as if it were broken: **make deletion order-independent and add a real
Postgres integration test.** I did **not** assert "it works" as a certainty — see §5.

---

## 1. The exact deletion path (`accountController.ts`)

Target is taken only from the bearer token (`:32` `req.user.id`), guarded by echo-your-email confirm
(`:37`). Solo-org rule; multi-member orgs fail-safe `409` (`:68-74`). The DB deletion is one interactive
transaction (`:99-105`), verbatim:

```ts
99   await prisma.$transaction(async (tx) => {
100     await tx.queryLog.deleteMany({ where: { userId } });
101     if (orgIds.length) {
102       await tx.organization.deleteMany({ where: { id: { in: orgIds } } });
103     }
104     await tx.user.deleteMany({ where: { id: userId } });
105   });
```

The comment at `:95-98` states the intent plainly: *"Deleting the Organization cascades to its
memberships, documents (+facts/+documentEntities), entities, saved and generated reports. QueryLog has
NO cascade on userId, so delete it explicitly first."*

So the design is: **explicit `QueryLog` delete first** (because `QueryLog→User` is RESTRICT — see §2),
then **one `DELETE FROM "Organization"`** that relies entirely on DB **cascade** for documents, facts,
document-entities, entities, reports, memberships, subscriptions; then delete the `User`.
`accountDeletionService.ts` only removes Storage objects + the Supabase auth identity — **no entity
cleanup** (confirmed; the audit did not miss one). Grep for any explicit `documentEntity`/`entity`
delete in the deletion path → **none**. Deletion depends purely on the org cascade.

## 2. The full FK graph (every `ON DELETE`, from the migration SQL — not sampled)

All FKs, quoted from `apps/backend/prisma/migrations/20260328193618_init/migration.sql` (+ the one later
FK):

| Child table.column | → Parent | ON DELETE | migration:line |
|---|---|---|---|
| `Membership.userId` | User | **CASCADE** | init:177 |
| `Membership.organizationId` | Organization | **CASCADE** | init:180 |
| `Document.organizationId` | Organization | **CASCADE** | init:183 |
| `DocumentFact.documentId` | Document | **CASCADE** | init:186 |
| `Entity.organizationId` | Organization | **CASCADE** | init:189 |
| `DocumentEntity.documentId` | Document | **CASCADE** | init:192 |
| `DocumentEntity.entityId` | **Entity** | **RESTRICT** | init:195 |
| `QueryLog.userId` | User | **RESTRICT** | init:198 |
| `SavedReportDefinition.organizationId` | Organization | **CASCADE** | init:201 |
| `GeneratedReport.definitionId` | SavedReportDefinition | **SET NULL** | init:204 |
| `GeneratedReport.organizationId` | Organization | **CASCADE** | init:207 |
| `Subscription.organizationId` | Organization | **CASCADE** | add_subscription…:50 |

Exact DDL for the two RESTRICT edges:
```sql
-- init:195
ALTER TABLE "DocumentEntity" ADD CONSTRAINT "DocumentEntity_entityId_fkey"
  FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- init:198
ALTER TABLE "QueryLog" ADD CONSTRAINT "QueryLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```
Schema origin: `schema.prisma:185` `entity Entity @relation(fields: [entityId], references: [id])` — **no
`onDelete`**, so Prisma's default for a required relation (`Restrict`) emitted `ON DELETE RESTRICT`.
(`document` on `:183` has explicit `onDelete: Cascade`.)

**Only two RESTRICT edges exist.** `QueryLog→User` is already handled by the explicit delete at
`accountController.ts:100`. The **only unhandled** RESTRICT is `DocumentEntity→Entity`. The audit
pinpointed the right constraint.

## 3. What a real `DELETE FROM "Organization"` hits, in Postgres cascade order

Deleting an Organization row fires the ON-DELETE action triggers of every FK referencing Organization:
`Membership`, `Document`, `Entity`, `SavedReportDefinition`, `GeneratedReport`, `Subscription` (all
CASCADE). The dangerous interaction is between two sibling cascade chains:

- **Document chain:** `DELETE Document (WHERE org)` → cascades `DocumentFact` (init:186) **and
  `DocumentEntity` via `documentId`** (init:192, CASCADE). After this chain completes, **all
  `DocumentEntity` rows for the org are gone.**
- **Entity chain:** `DELETE Entity (WHERE org)` → the only thing referencing `Entity` is
  `DocumentEntity.entityId` (init:195, **RESTRICT**). RESTRICT is checked **immediately** per deleted
  Entity row — it is **not** deferred to statement end (this is the key difference from `NO ACTION`).

**So the outcome depends entirely on which sibling chain fires first:**
- Document chain first → `DocumentEntity` rows deleted → Entity RESTRICT finds no referrers → **succeeds**.
- Entity chain first → `DocumentEntity` rows still present → Entity RESTRICT **throws**
  `update or delete on table "Entity" violates foreign key constraint "DocumentEntity_entityId_fkey"` →
  the whole transaction rolls back → **deletion fails**.

**Why it most likely succeeds today (and why that's not reassurance):** PostgreSQL fires a table's
AFTER-DELETE RI triggers in **trigger-name order**, and internal RI triggers are named by their
constraint OID, i.e. roughly **constraint-creation order**. `Document→Organization` (init:183) was
created **before** `Entity→Organization` (init:189), so the Document cascade chain fires first and clears
`DocumentEntity` before the Entity chain's RESTRICT check. **This ordering is implementation behaviour,
not a contract** — it is not guaranteed by the SQL standard or Postgres docs, and could differ across
Postgres versions or if the constraints are ever recreated in a different order (e.g. a Prisma
`migrate reset`/`diff` regen, or a manual rebuild). Building a Play-compliance-critical, irreversible
feature on accidental trigger ordering is the real defect, whether or not it happens to work in prod
right now.

**Had the FK been `NO ACTION` instead of `RESTRICT`,** the check would defer to end-of-statement and the
single `DELETE FROM Organization` would succeed **regardless** of chain order (all `DocumentEntity` rows
are gone by statement end). The choice of `RESTRICT` (Prisma's required-relation default) is precisely
what introduces the order dependence.

## 4. Who is actually affected + minimal trigger shape

- A user with **no `Entity` rows** (signed up but never scanned, or scanned but no entity resolved) is
  **never** at risk: the Entity cascade deletes nothing, so the RESTRICT check never runs.
- The **minimal data shape that could trip it** (if ordering ever flips): **one `Entity` row + one
  `DocumentEntity` row referencing it** (i.e. any user who has scanned a document that resolved an
  entity — a vendor/merchant — which is essentially every real receipt scan; entities are written on
  every create at `entityResolution.ts:46-59`).
- No code path cleans entities up first (confirmed §1), so nothing mitigates it in application code — it
  is 100% on the DB cascade.

So the audit's "affects essentially every real user" is the correct *population* — **if** the failure
occurs. The open question is only whether the failure occurs, which §3 says is order-dependent and
currently (probably) does not.

## 5. Safe reproduction — what I did and did NOT do

- I used **option (a): pure schema + Postgres-semantics reasoning** (§3). I did **not** reach a
  conclusion of certainty in either direction, because the deciding factor (cascade-trigger order) is not
  statically knowable with certainty.
- I did **NOT** run option (b) `BEGIN … ROLLBACK` — **because the only DB reachable from this environment
  is the production database** (`apps/backend/.env` → `aws-1-eu-west-1.pooler.supabase.com`, established
  in `docs/PROD_MIGRATION_STATUS_CHECK_2026-07-19.md`). A `BEGIN…ROLLBACK` still issues `INSERT`/`DELETE`
  to prod before rolling back; that violates the "do NOT write to the DB" instruction. I will not seed
  throwaway rows into prod even transactionally.
- **To get empirical certainty safely, run this harness against a LOCAL / throwaway Postgres** (never
  prod). It is self-contained, always rolls back, and prints the outcome:

```sql
BEGIN;
-- minimal solo-org shape that exercises DocumentEntity->Entity RESTRICT
INSERT INTO "Organization"(id, plan) VALUES ('00000000-0000-0000-0000-0000000000aa', 'FREE');
INSERT INTO "Document"(id, "organizationId", "userId", "originalFileName", status)
  VALUES ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000aa',
          '00000000-0000-0000-0000-0000000000u1','r.jpg','COMPLETED');
INSERT INTO "Entity"(id, "organizationId", "entityType", "canonicalName")
  VALUES ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000aa','VENDOR','acme');
INSERT INTO "DocumentEntity"(id, "documentId", "entityId", role, confidence)
  VALUES ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000e1','VENDOR',0.9);
-- the exact statement accountController.ts:102 issues:
DELETE FROM "Organization" WHERE id = '00000000-0000-0000-0000-0000000000aa';
-- if you reach here with no error, the cascade order is favourable; if it raised
-- "violates foreign key constraint DocumentEntity_entityId_fkey", it is the blocker.
ROLLBACK;   -- nothing is ever committed
```
(Column lists are illustrative — align NOT-NULL columns to `schema.prisma`. Requires the same Postgres
version as prod for the ordering to be representative.)

## 6. Fix space + ONE recommendation

| Option | What | Migration? | Robust to order? | Testable | Notes |
|---|---|---|---|---|---|
| **A. Code-only ordered deletes** | In the tx, delete `DocumentEntity` then `Entity` explicitly before the org delete | **No** | **Yes** (explicit) | Yes | Deploys via normal Railway path; no manual DB step |
| B. Migration → `onDelete: Cascade` on `DocumentEntity.entityId` | Join row dies with its Entity too | **Yes** | Yes | Yes | Semantically "correct" long-term, but needs a manual prod apply — the very CI-gap that is audit item #1 |
| C. Migration → `NO ACTION` | Defer the check to statement end | **Yes** | Yes | Yes | Minimal DDL, but still a migration + manual apply |

**Recommendation: Option A (code-only), now.** Rationale:
1. **No migration** → it does not reopen the "CI never runs `migrate deploy`, migrations lag prod"
   latent-outage risk (audit item #1). A schema fix that must be hand-applied to prod is exactly the
   failure mode we're trying to stop relying on.
2. It makes deletion **explicitly order-independent** — correctness no longer rests on undocumented
   cascade ordering, so it can't silently regress if constraints are ever recreated.
3. Idempotent and consistent with the existing style (`deleteMany` no-ops on missing rows).

Concretely (illustrative — **not** to apply here), the transaction becomes:
```ts
await prisma.$transaction(async (tx) => {
  await tx.queryLog.deleteMany({ where: { userId } });
  if (orgIds.length) {
    await tx.documentEntity.deleteMany({ where: { document: { organizationId: { in: orgIds } } } });
    await tx.entity.deleteMany({ where: { organizationId: { in: orgIds } } });
    await tx.organization.deleteMany({ where: { id: { in: orgIds } } });  // cascades the rest
  }
  await tx.user.deleteMany({ where: { id: userId } });
});
```
Option B (the `CASCADE` schema fix) is the cleaner long-term model and worth doing **later as its own
planned migration with your explicit go-ahead** — but it should not be the launch-unblocking change,
precisely because applying it to prod is a manual write step. **Any migration is a separate write action
needing your approval and its own plan; nothing here applies one.**

## 7. The test that must exist (and why the current suite can't catch this)

A **Postgres integration test** (not jsdom, not mocked Prisma, not SQLite — FK/cascade semantics are
Postgres-specific and are the entire point). Against a real Postgres (CI service container or Testcontainers):

1. **Seed the full cascade fan-out for a solo org:** `User` + `Membership(OWNER)` + `Organization` +
   `Document` + `DocumentFact` + **`Entity` + `DocumentEntity`** (the RESTRICT edge) + `QueryLog`
   (the other RESTRICT edge) + `SavedReportDefinition` + `GeneratedReport` + `Subscription` — one row
   each, so every FK in §2 is exercised.
2. **Call the real deletion transaction** (`AccountController.deleteAccount` or the tx body), with real
   Prisma against the seeded DB. Mock only Supabase storage/auth (`accountDeletionService`), never the DB.
3. **Assert it does not throw**, and that afterwards **every** table above has `count === 0` for that
   org/user (Organization, Document, DocumentFact, DocumentEntity, Entity, QueryLog, Membership,
   Subscription, reports, User).
4. **Also assert the fail-safe:** seed a 2-member org and assert `409 SHARED_WORKSPACE` with **no**
   deletion.
5. **Regression value:** because it runs against real Postgres, it fails the instant the cascade order is
   unfavourable OR a future RESTRICT FK is added without an explicit delete — which the current
   unit-level suite (mocked Prisma) structurally cannot detect.

> Note the meta-point: today there is **no** test that deletes an account against a real DB, so "green CI"
> says nothing about whether deletion works. That absence — not a proven failure — is the true item #2.

---

## Final answer

**Item #2 is a REAL risk but NOT a confirmed hard blocker as written.** The FK facts are exactly as the
audit stated (`DocumentEntity.entityId` is `ON DELETE RESTRICT`, init:195; deletion relies solely on the
org cascade, `accountController.ts:99-105`), but the conclusion "the account cannot be deleted" is
**unproven** — static analysis of Postgres cascade ordering indicates it most likely **succeeds today**
(Document FK created before Entity FK), and I deliberately did not run a mutation against prod to prove it
either way. What is unambiguous: deletion correctness on a store-compliance path currently depends on
**undocumented cascade ordering + an immediate-check RESTRICT + zero real-DB test coverage**, which is
not shippable regardless of today's behaviour.

**Recommended fix:** **Option A — code-only ordered deletes** (delete `DocumentEntity`, then `Entity`,
before the org delete), because it removes the ordering dependence with **no prod migration** (avoiding
audit item #1's CI-migration gap) and is fully testable.

**Lock it with:** a **Postgres** integration test that seeds the full cascade fan-out (including the
`Entity`+`DocumentEntity` RESTRICT edge) and asserts the real deletion transaction completes and leaves
zero rows — plus the 2-member `409` fail-safe.

Nothing was mutated, no migration applied, no PR opened. Any fix or migration is a separate action
needing your explicit go-ahead.
