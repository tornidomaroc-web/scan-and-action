import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

/**
 * REAL-POSTGRES integration test for account deletion.
 *
 * Why a real DB and not the in-memory Prisma fakes the rest of the suite uses:
 * this test exists to lock the ON DELETE RESTRICT edge DocumentEntity.entityId ->
 * Entity (schema.prisma:185, migration init:195). FK cascade / RESTRICT ordering
 * is a Postgres runtime behaviour — a mocked Prisma or SQLite would "pass" while
 * proving nothing about what real Postgres does. So this file talks to an actual
 * Postgres instance.
 *
 * SAFETY — this NEVER touches production:
 *  - It runs ONLY when TEST_DATABASE_URL is set. With it unset (CI, a normal
 *    local `npm test`) the whole suite is describe.skip'd, so CI stays green and
 *    no one can accidentally run it against the prod DATABASE_URL.
 *  - It additionally refuses to run if TEST_DATABASE_URL looks like the managed
 *    Supabase/pooler prod host (belt-and-suspenders against a mis-set var).
 *  - Every row it writes is seeded and then deleted within the test; it also
 *    truncates its own tables before each test. It is meant for a THROWAWAY DB.
 *
 * To run it (against a throwaway Postgres — see the PR description for the exact
 * docker one-liner):
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/scanaction_test \
 *     npx prisma migrate deploy      # create the schema in the throwaway DB
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/scanaction_test \
 *     npx vitest run src/controllers/accountController.integration.test.ts
 */

// vi.mock is hoisted above module-level consts, so the throwaway client and the
// prod-guard are built inside vi.hoisted (the pattern used by the entitlement
// tests) — that way the mock factory below can reference the ready client.
const h = vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL;
  const looksLikeProd =
    !!url && /supabase\.com|pooler\.|amazonaws\.com/i.test(url);
  if (looksLikeProd) {
    throw new Error(
      'TEST_DATABASE_URL points at what looks like a managed/prod database. ' +
        'This integration test only runs against a local throwaway Postgres. Aborting.'
    );
  }
  // A dedicated client bound to the throwaway DB. The `|| ...unreachable...`
  // fallback guarantees that even when this module is evaluated while skipped,
  // the client can never lazily connect to the prod DATABASE_URL from env/schema.
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({
    datasources: {
      db: { url: url || 'postgresql://unreachable:5432/skipped_no_test_db' },
    },
  });
  return { db, run: !!url && !looksLikeProd };
});

const db = h.db;
const describeIntegration = h.run ? describe : describe.skip;

// The controller imports the shared singleton and the Supabase-backed deletion
// service. Point the singleton at our throwaway client, and stub out Supabase
// (storage + auth) — the analysis is explicit: mock ONLY Supabase, never the DB.
vi.mock('../prismaClient', () => ({ prisma: h.db }));
vi.mock('../services/accountDeletionService', () => ({
  deleteStorageObjects: vi.fn(async () => {}),
  deleteAuthUser: vi.fn(async () => {}),
}));

// Imported AFTER the mocks above are registered.
import { AccountController } from './accountController';

// Every table the org cascade + explicit deletes must clear, child-before-parent
// so a plain deleteMany reset can't itself trip a RESTRICT.
const TABLES = [
  'QueryLog',
  'DocumentEntity',
  'DocumentFact',
  'Document',
  'Entity',
  'GeneratedReport',
  'SavedReportDefinition',
  'Subscription',
  'Membership',
  'Organization',
  'User',
];

async function resetDb() {
  // TRUNCATE ... CASCADE is order-independent and fast; quote-wrap the PascalCase
  // identifiers so Postgres doesn't lowercase them.
  const list = TABLES.map((t) => `"${t}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Minimal fake Express req/res/next capturing what the controller returns. */
function makeCtx(userId: string, email: string, confirm?: string) {
  const captured: { statusCode?: number; body?: any; nextErr?: unknown } = {};
  const req: any = { user: { id: userId, email }, body: { confirm: confirm ?? email } };
  const res: any = {
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(payload: any) {
      captured.body = payload;
      return res;
    },
  };
  const next = (err?: unknown) => {
    captured.nextErr = err;
  };
  return { req, res, next, captured };
}

// UUIDs are fixed so the seed is deterministic.
const U1 = '00000000-0000-4000-8000-0000000000a1';
const ORG1 = '00000000-0000-4000-8000-0000000000b1';

/**
 * Seed one solo org that exercises EVERY FK in the graph, including both RESTRICT
 * edges (QueryLog.userId -> User, DocumentEntity.entityId -> Entity).
 */
async function seedSoloOrg(opts: { userId: string; orgId: string; email: string }) {
  const { userId, orgId, email } = opts;
  await db.user.create({ data: { id: userId, email } });
  await db.organization.create({
    data: { id: orgId, name: 'Solo', slug: `solo-${orgId}` },
  });
  await db.membership.create({
    data: { userId, organizationId: orgId, role: 'OWNER' },
  });
  const doc = await db.document.create({
    data: {
      organizationId: orgId,
      userId,
      originalFileName: 'receipt.jpg',
      fileUrl: 'uploads/receipt.jpg',
      documentType: 'RECEIPT',
      detectedLanguage: 'en',
      rawText: 'ACME 12.00',
      normalizedText: 'acme 12.00',
      overallConfidence: 0.9,
      status: 'COMPLETED',
    },
  });
  await db.documentFact.create({
    data: {
      documentId: doc.id,
      factType: 'TOTAL',
      key: 'total',
      valueNumber: 12,
      confidence: 0.9,
      sourceSpan: '0:9',
    },
  });
  const entity = await db.entity.create({
    data: {
      organizationId: orgId,
      entityType: 'VENDOR',
      canonicalName: 'acme',
      aliases: ['ACME'],
      metadataJson: {},
    },
  });
  // The RESTRICT edge under test: a join row referencing the Entity.
  await db.documentEntity.create({
    data: { documentId: doc.id, entityId: entity.id, role: 'VENDOR', confidence: 0.9 },
  });
  // The other RESTRICT edge: QueryLog.userId -> User.
  await db.queryLog.create({
    data: {
      userId,
      rawQueryText: 'total spend',
      sourceLanguage: 'en',
      parsedIntentJson: {},
      queryPlanJson: {},
      executionTimeMs: 5,
      resultCount: 1,
      status: 'OK',
    },
  });
  const def = await db.savedReportDefinition.create({
    data: {
      organizationId: orgId,
      title: 'Monthly',
      description: 'monthly spend',
      queryTemplateJson: {},
    },
  });
  await db.generatedReport.create({
    data: {
      definitionId: def.id,
      organizationId: orgId,
      title: 'July',
      summaryText: 'ok',
      dataSnapshotJson: {},
      locale: 'en',
    },
  });
  await db.subscription.create({
    data: { organizationId: orgId, source: 'PADDLE', status: 'INACTIVE' },
  });
}

async function totalRows(): Promise<Record<string, number>> {
  const [
    users,
    orgs,
    memberships,
    documents,
    facts,
    entities,
    docEntities,
    queryLogs,
    savedReports,
    generatedReports,
    subscriptions,
  ] = await Promise.all([
    db.user.count(),
    db.organization.count(),
    db.membership.count(),
    db.document.count(),
    db.documentFact.count(),
    db.entity.count(),
    db.documentEntity.count(),
    db.queryLog.count(),
    db.savedReportDefinition.count(),
    db.generatedReport.count(),
    db.subscription.count(),
  ]);
  return {
    users,
    orgs,
    memberships,
    documents,
    facts,
    entities,
    docEntities,
    queryLogs,
    savedReports,
    generatedReports,
    subscriptions,
  };
}

describeIntegration('AccountController.deleteAccount — real Postgres', () => {
  beforeAll(async () => {
    await db.$connect();
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    await resetDb();
  });

  it('deletes a solo org with the DocumentEntity->Entity RESTRICT edge without throwing, leaving zero rows', async () => {
    await seedSoloOrg({ userId: U1, orgId: ORG1, email: 'solo@example.com' });

    // Sanity: the RESTRICT edge really is present before deletion.
    const before = await totalRows();
    expect(before.entities).toBe(1);
    expect(before.docEntities).toBe(1);
    expect(before.queryLogs).toBe(1);

    const { req, res, next, captured } = makeCtx(U1, 'solo@example.com');
    await AccountController.deleteAccount(req, res, next);

    // Did NOT throw / was NOT routed to the error handler with a FK violation.
    expect(captured.nextErr).toBeUndefined();
    expect(captured.statusCode).toBe(200);
    expect(captured.body).toMatchObject({ ok: true });

    // Every table is empty for this org/user.
    const after = await totalRows();
    for (const [table, count] of Object.entries(after)) {
      expect(count, `expected 0 rows left in ${table}`).toBe(0);
    }
  });

  it('preserves the 2-member fail-safe: returns 409 SHARED_WORKSPACE and deletes nothing', async () => {
    // Solo-style seed for member A, then attach a second member B to the same org.
    await seedSoloOrg({ userId: U1, orgId: ORG1, email: 'a@example.com' });
    const U2 = '00000000-0000-4000-8000-0000000000a2';
    await db.user.create({ data: { id: U2, email: 'b@example.com' } });
    await db.membership.create({
      data: { userId: U2, organizationId: ORG1, role: 'MEMBER' },
    });

    const before = await totalRows();

    const { req, res, next, captured } = makeCtx(U1, 'a@example.com');
    await AccountController.deleteAccount(req, res, next);

    expect(captured.nextErr).toBeUndefined();
    expect(captured.statusCode).toBe(409);
    expect(captured.body).toMatchObject({ error: 'SHARED_WORKSPACE' });

    // NOTHING was deleted — the fail-safe must not touch shared data.
    const after = await totalRows();
    expect(after).toEqual(before);
    expect(after.users).toBe(2);
    expect(after.memberships).toBe(2);
    expect(after.orgs).toBe(1);
  });
});
