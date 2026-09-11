import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentParserService } from './intentParser';
import { QueryPlanner } from './queryPlanner';
import { QueryExecutor } from './queryExecutor';
import { NormalizationService } from '../normalization/normalizationService';

// ============================================================================
// WRITTEN UNDER ONE IDENTIFIER, READ UNDER ANOTHER.
// ============================================================================
// intentParser.ts:77 has always pushed the literal 'RECEIPT' into a
// `Document.documentType` filter when a user asks about receipts. Ingestion has
// never written that value: `normalizeDocumentType` had no 'receipt' key, so
// every receipt was stored as 'UNKNOWN_DOCUMENT_TYPE'. Measured on production
// 2026-09-11: `documentType = 'RECEIPT'` matches **0 of 385** documents, while
// the same equality filter returns 40 for INVOICE — so the zero is a real zero
// and not a query that cannot match. "Show me my receipts" has returned nothing
// for the life of the product, with no error to prompt a second look.
//
// THE POINT OF THIS FILE is that it does not hardcode 'RECEIPT' on both sides.
// The row it stores is typed by the REAL `normalizeDocumentType`, exactly as
// persistence.ts:154 types it, and the query is parsed and planned by the REAL
// parser and planner. It therefore pins the only property that matters: THE
// VALUE INGESTION WRITES IS THE VALUE SEARCH LOOKS FOR. Two literals agreeing
// in a fixture would pass just as happily while the two ends drifted apart.
// ============================================================================

const normalizer = new NormalizationService();
const ORG = 'org-1';
const USER = 'user-1';

// What ingestion would store for each document, through the real normaliser.
const stored = (rawTypeFromModel: string) => normalizer.normalizeDocumentType(rawTypeFromModel);

// Rows as the database would hold them after ingestion.
const ROWS = [
  { id: 'doc-receipt', organizationId: ORG, documentType: stored('receipt'), uploadedAt: new Date('2026-09-01') },
  { id: 'doc-invoice', organizationId: ORG, documentType: stored('invoice'), uploadedAt: new Date('2026-09-02') },
  { id: 'doc-other', organizationId: ORG, documentType: stored('passport'), uploadedAt: new Date('2026-09-03') },
  { id: 'doc-other-org', organizationId: 'org-2', documentType: stored('receipt'), uploadedAt: new Date('2026-09-04') },
];

// A prisma double that APPLIES the where clause instead of just recording it.
// An assertion on the recorded object would prove the planner emitted a filter;
// only running it proves the filter selects the row ingestion actually wrote.
const applyWhere = (rows: typeof ROWS, where: any) =>
  rows.filter((r) => {
    if (where.organizationId && r.organizationId !== where.organizationId) return false;
    for (const clause of where.AND ?? []) {
      if (clause.documentType?.in && !clause.documentType.in.includes(r.documentType)) return false;
      if (typeof clause.documentType === 'string' && clause.documentType !== r.documentType) return false;
    }
    return true;
  });

const findMany = vi.fn();
const queryLogCreate = vi.fn();
const prisma: any = {
  document: { findMany, count: vi.fn() },
  documentFact: { groupBy: vi.fn(), findMany: vi.fn() },
  documentEntity: { findMany: vi.fn() },
  queryLog: { create: queryLogCreate },
};

const run = async (question: string) => {
  const intent = await new IntentParserService().parseUserQuery(question, 'en');
  const plan = new QueryPlanner().generatePlan(intent);
  const result = await new QueryExecutor(prisma).execute(USER, ORG, question, 'en', intent, plan);
  return { intent, plan, result };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  findMany.mockImplementation(({ where }: any) => Promise.resolve(applyWhere(ROWS, where)));
  // The aggregate branches are not the subject here, but `execute` runs one of
  // them for a spend question, and a double that resolves `undefined` would
  // throw inside the executor and disguise itself as a real failure.
  prisma.documentFact.groupBy.mockResolvedValue([]);
  prisma.document.count.mockResolvedValue(0);
  queryLogCreate.mockResolvedValue({});
});

describe('asking for receipts finds the row ingestion stored as a receipt', () => {
  it('returns the receipt row and nothing else', async () => {
    const { result } = await run('show me my receipts');

    expect(result.data.map((d: any) => d.id)).toEqual(['doc-receipt']);
    expect(result.resultCount).toBe(1);
  });

  it('the filter value and the stored value are the same string', async () => {
    const { plan } = await run('show me my receipts');

    const typeFilter = plan.filters.find((f: any) => f.field === 'Document.documentType');
    expect(typeFilter).toBeDefined();
    // The parser's literal, and the normaliser's output, must be one value.
    expect(typeFilter!.value).toContain(stored('receipt'));
  });

  it('a receipt in ANOTHER organization is not returned', async () => {
    const { result } = await run('show me my receipts');
    const ids = result.data.map((d: any) => d.id);
    // BOTH halves, deliberately. Asserting only the exclusion would pass
    // vacuously against unpatched source, where the filter matches nothing at
    // all — a green tick for a screen that returns an empty list.
    expect(ids).toContain('doc-receipt');
    expect(ids).not.toContain('doc-other-org');
  });

  it('asking for invoices still returns only the invoice', async () => {
    const { result } = await run('show me my invoices');
    expect(result.data.map((d: any) => d.id)).toEqual(['doc-invoice']);
  });

  it('asking for neither returns every row in the organization', async () => {
    const { result } = await run('show me my documents');
    expect(result.data.map((d: any) => d.id)).toEqual(['doc-receipt', 'doc-invoice', 'doc-other']);
  });
});

// ── REPORTED, NOT FIXED HERE ────────────────────────────────────────────────
// queryPlanner.ts:79-104 consumes `intent.documentTypes` for `list_documents`
// and `count_documents` ONLY (:107-110). The `sum_expenses` / `group_expenses`
// branch never pushes the filter, so "how much did I spend on receipts" parses
// the receipt type correctly and then sums EVERY document in the organisation.
// That is a planner defect, it is older than this change, and fixing it would
// move a money figure — which is out of scope here and belongs with the open
// question about which statuses count toward a total.
//
// Pinned so the gap is a recorded fact rather than a surprise: this test goes
// red the day someone wires the filter through, which is when they should read
// the note above.
describe('KNOWN GAP — a spend question drops the receipt filter', () => {
  it('parses the type but plans no documentType filter for sum_expenses', async () => {
    const { intent, plan } = await run('how much did I spend on receipts');

    expect(intent.intent).toBe('sum_expenses');
    expect(intent.documentTypes).toEqual(['RECEIPT']);
    expect(plan.filters.find((f: any) => f.field === 'Document.documentType')).toBeUndefined();
  });
});
