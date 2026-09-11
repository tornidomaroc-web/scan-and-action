import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// THE VALUE INGESTION WRITES IS THE VALUE THE REPORT FILTERS ON.
// ============================================================================
// reportController.ts:36 has always filtered `Document.documentType` eq
// 'BUSINESS_CARD'. Ingestion had never written that value: the extraction
// prompt tells the model to return "business_card" with an UNDERSCORE
// (geminiAdapter.ts:204, :209) and DOCUMENT_TYPE_MAP held 'business card' with
// a SPACE, so every business card was stored as 'UNKNOWN_DOCUMENT_TYPE'.
// Measured on production 2026-09-11, all 386 rows: `documentType =
// 'BUSINESS_CARD'` matched **0**, while the same equality filter returned 40
// for INVOICE — a real zero, not a query that could not match. The
// 'recent_cards' report could not return a row, with no error to prompt a
// second look.
//
// ── WHY THIS FILE RUNS THE REAL THING RATHER THAN ASSERTING ON A PLAN ───────
//
// The row below is typed by the REAL NormalizationService, exactly as
// persistence.ts:154 types it. The filter is the REAL report blueprint in
// ReportController. The where clause is compiled by the REAL QueryExecutor and
// then APPLIED by the prisma double, not merely recorded. So the property
// pinned here is the one that was broken: the string ingestion writes and the
// string the report looks for are ONE STRING. Two literals agreeing in a
// fixture would pass just as happily while the two ends drifted apart — which
// is precisely how this bug and its receipt twin survived.
//
// ── ORG ISOLATION, BOTH HALVES ─────────────────────────────────────────────
//
// A card belonging to ANOTHER organization must not appear. That exclusion is
// asserted together with the inclusion of the caller's own card, deliberately:
// against unpatched source the filter matches NOTHING, so an exclusion-only
// assertion passes vacuously — a green tick for a report that returns an empty
// table. Only the pair discriminates.
// ============================================================================

const mocks = vi.hoisted(() => ({
  docFindMany: vi.fn(),
  docCount: vi.fn(),
  factGroupBy: vi.fn(),
  queryLogCreate: vi.fn(),
}));

vi.mock('../prismaClient', () => ({
  prisma: {
    document: { findMany: mocks.docFindMany, count: mocks.docCount },
    documentFact: { groupBy: mocks.factGroupBy, findMany: vi.fn() },
    documentEntity: { findMany: vi.fn() },
    queryLog: { create: mocks.queryLogCreate },
  },
}));

import { ReportController } from './reportController';
import { NormalizationService } from '../services/normalization/normalizationService';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const USER = 'user-1';

// What ingestion would store for each document, through the real normaliser.
const stored = (rawTypeFromModel: string) =>
  new NormalizationService().normalizeDocumentType(rawTypeFromModel);

// Rows as the database would hold them after ingestion. Every documentType here
// is COMPUTED, never typed as a literal.
const ROWS = [
  { id: 'card-mine', organizationId: ORG, documentType: stored('business_card'), uploadedAt: new Date('2026-09-04') },
  { id: 'card-mine-2', organizationId: ORG, documentType: stored('Business_Card'), uploadedAt: new Date('2026-09-03') },
  { id: 'receipt-mine', organizationId: ORG, documentType: stored('receipt'), uploadedAt: new Date('2026-09-02') },
  { id: 'invoice-mine', organizationId: ORG, documentType: stored('invoice'), uploadedAt: new Date('2026-09-01') },
  { id: 'other-mine', organizationId: ORG, documentType: stored('passport'), uploadedAt: new Date('2026-08-31') },
  { id: 'card-theirs', organizationId: OTHER_ORG, documentType: stored('business_card'), uploadedAt: new Date('2026-09-05') },
];

// A prisma double that APPLIES the where clause instead of just recording it.
// An assertion on the recorded object would prove the controller emitted a
// filter; only running it proves the filter selects the row ingestion wrote.
const applyWhere = (where: any) =>
  ROWS.filter((r) => {
    if (where.organizationId && r.organizationId !== where.organizationId) return false;
    for (const clause of where.AND ?? []) {
      if (clause.documentType?.in && !clause.documentType.in.includes(r.documentType)) return false;
      if (typeof clause.documentType === 'string' && clause.documentType !== r.documentType) return false;
    }
    return true;
  });

const getReport = async (id: string, organizationId = ORG) => {
  const req: any = { params: { id }, query: {}, user: { id: USER, organizationId } };
  let statusCode = 0;
  let body: any = null;
  const res: any = {
    status(code: number) { statusCode = code; return this; },
    json(payload: any) { body = payload; return this; },
  };
  const next = vi.fn();
  await ReportController.getReport(req, res, next);
  return { statusCode, body, next };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.docFindMany.mockImplementation(({ where }: any) => Promise.resolve(applyWhere(where)));
  // Not the subject here, but a double resolving `undefined` would throw inside
  // the executor and disguise itself as a real failure.
  mocks.docCount.mockResolvedValue(0);
  mocks.factGroupBy.mockResolvedValue([]);
  mocks.queryLogCreate.mockResolvedValue({});
});

describe('recent_cards returns the row ingestion stored as a business card', () => {
  it('returns the caller\'s cards and nothing else', async () => {
    const { statusCode, body, next } = await getReport('recent_cards');

    expect(next).not.toHaveBeenCalled();
    expect(statusCode).toBe(200);
    // The response shape is the formatter's TABLE PASSTHROUGH — `{ payload,
    // outputFormat, metadata }`. There is no `data` and no `resultCount` on a
    // table report (answerFormatter.ts:67-69), which is the sort of thing a
    // test built from a hand-written fixture would have asserted wrongly.
    expect(body.outputFormat).toBe('table');
    expect(body.payload.map((d: any) => d.id).sort()).toEqual(['card-mine', 'card-mine-2']);
    expect(body.payload).toHaveLength(2);
  });

  it('the report\'s filter value and the stored value are the same string', async () => {
    await getReport('recent_cards');

    const where = mocks.docFindMany.mock.calls[0][0].where;
    const typeClause = (where.AND ?? []).find((c: any) => c.documentType !== undefined);
    expect(typeClause).toBeDefined();
    // The blueprint's literal, and the normaliser's output, must be one value.
    expect(typeClause.documentType).toBe(stored('business_card'));
  });

  it('a business card in ANOTHER organization is not returned', async () => {
    const { body } = await getReport('recent_cards');
    const ids = body.payload.map((d: any) => d.id);
    // BOTH halves. The exclusion alone passes vacuously on unpatched source.
    expect(ids).toContain('card-mine');
    expect(ids).not.toContain('card-theirs');
  });

  it('and the other organization sees its OWN card, not this one', async () => {
    // The positive control for the isolation test above: proves the exclusion
    // came from the organizationId scope and not from the row being unreachable.
    const { body } = await getReport('recent_cards', OTHER_ORG);
    expect(body.payload.map((d: any) => d.id)).toEqual(['card-theirs']);
  });

  it('a receipt, an invoice and an unrecognised type are all excluded', async () => {
    const { body } = await getReport('recent_cards');
    const ids = body.payload.map((d: any) => d.id);
    expect(ids).not.toContain('receipt-mine');
    expect(ids).not.toContain('invoice-mine');
    expect(ids).not.toContain('other-mine');
  });

  it('an unknown report id is still a 404, and runs no query', async () => {
    const { statusCode } = await getReport('no_such_report');
    expect(statusCode).toBe(404);
    expect(mocks.docFindMany).not.toHaveBeenCalled();
  });
});
