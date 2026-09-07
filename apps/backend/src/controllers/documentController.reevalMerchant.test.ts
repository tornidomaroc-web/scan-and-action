import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// The re-evaluation path has been running blind on merchants.
// ============================================================================
// documentController.ts:475 picks the merchant with
// `updatedDoc.documentEntities.find(de => de.role === 'VENDOR')`. Every stored
// role is 'ISSUER' — measured, 156 rows, zero 'VENDOR' — so merchantName has
// always arrived as null on this path.
//
// The cost is not only Rule D. `isFoodMerchant(merchantName)` is one of the two
// disjuncts that keep Rule B alive, so re-evaluation could only ever flag a food
// expense via the SUMMARY. This is the same defect as checkDuplicate's, at the
// second of two call sites, and it is fixed the same way: key on the entity's
// entityType, the axis that actually carries 'VENDOR'
// (types/schemas.ts:16-17, geminiAdapter.ts:240-241).
// ============================================================================

const mocks = vi.hoisted(() => ({
  docFindFirst: vi.fn(),
  docFindUnique: vi.fn(),
  factDeleteMany: vi.fn(),
  factCreate: vi.fn(),
  evaluate: vi.fn(),
}));

vi.mock('../prismaClient', () => {
  const tx = {
    documentFact: { deleteMany: mocks.factDeleteMany, create: mocks.factCreate },
    document: { update: vi.fn() },
  };
  return {
    prisma: {
      document: { findFirst: mocks.docFindFirst, findUnique: mocks.docFindUnique },
      documentFact: { deleteMany: mocks.factDeleteMany, create: mocks.factCreate },
      $transaction: async (fn: any) => fn(tx),
    },
  };
});

vi.mock('../services/ruleEngineService', () => ({
  RuleEngineService: class { evaluate = mocks.evaluate; },
}));

// documentController imports both storage modules, and each THROWS at module
// load without SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Stub them so the file
// under test can be imported at all — same stubs as
// documentController.reextract.test.ts.
vi.mock('../services/storage/getSignedFileUrl', () => ({ getSignedFileUrl: vi.fn() }));
vi.mock('../services/storage/supabaseStorage', () => ({
  uploadToSupabase: vi.fn(),
  downloadFromSupabase: vi.fn(),
}));
vi.mock('../services/ingestion/ingestionService', () => ({
  IngestionService: class { processUploadAsync = vi.fn(); },
}));

import { DocumentController } from './documentController';

const DOC = 'doc-1';
const ORG = 'org-1';

/** Exactly the shape the database holds: role ISSUER, entityType VENDOR. */
const dbShapedEntities = [
  { role: 'ISSUER', entity: { entityType: 'VENDOR', canonicalName: 'Joe Pizza' } },
];

function makeRes() {
  return {
    statusCode: undefined as number | undefined,
    body: undefined as any,
    status(c: number) { this.statusCode = c; return this; },
    json(p: any) { this.body = p; return this; },
  } as any;
}

const run = async (entities = dbShapedEntities) => {
  mocks.docFindFirst.mockResolvedValue({ id: DOC, organizationId: ORG });
  mocks.docFindUnique.mockResolvedValue({
    id: DOC, organizationId: ORG,
    facts: [{ key: 'manual_amount', valueNumber: 100 }],
    documentEntities: entities,
  });
  mocks.evaluate.mockResolvedValue({ decision: 'APPROVED', reasons: [] });

  const req: any = {
    params: { id: DOC },
    body: { actionType: 'amount_corrected', payload: { amount: 100 } },
    user: { organizationId: ORG },
  };
  const res = makeRes();
  const next = vi.fn();
  await DocumentController.applyFixAction(req, res, next);
  return { res, next };
};

describe('re-evaluation resolves the merchant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('passes the VENDOR entity name to the rule engine, not null', async () => {
    await run();

    expect(mocks.evaluate).toHaveBeenCalledTimes(1);
    const merchantName = mocks.evaluate.mock.calls[0][3];
    expect(merchantName, 'merchantName arrived null on the re-eval path').toBe('Joe Pizza');
  });

  it('does not key on the role column, which never holds "VENDOR"', async () => {
    // Same row, but with a role that is NOT 'ISSUER': the merchant must still
    // resolve, because the entityType is the axis that carries VENDOR.
    await run([{ role: 'BILLED_TO', entity: { entityType: 'VENDOR', canonicalName: 'Joe Pizza' } }]);

    expect(mocks.evaluate.mock.calls[0][3]).toBe('Joe Pizza');
  });

  it('CONTROL: a non-VENDOR entity yields a null merchant', async () => {
    await run([{ role: 'ISSUER', entity: { entityType: 'PERSON', canonicalName: 'Jane Doe' } }]);

    expect(mocks.evaluate.mock.calls[0][3]).toBeNull();
  });

  it('CONTROL: no entities at all yields a null merchant', async () => {
    await run([]);

    expect(mocks.evaluate.mock.calls[0][3]).toBeNull();
  });
});
