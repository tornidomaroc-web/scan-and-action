import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IngestionService } from './ingestionService';
import { PersistenceService, MULTIPLE_DOCUMENTS_REASON } from './persistence';

// ============================================================================
// A file the single-document check refuses carries the reason it was refused.
// ============================================================================
// The refusal used to write the status and nothing else, so the receipt
// screen could only say "The reading was uncertain" (the owner's iPhone, build
// 15, two receipts in one PDF). Now it writes the same decision facts the rule
// engine writes, with MULTIPLE_DOCUMENTS_REASON, which the client translates.
// The emergency fallback with no reason is the control: status only.
// ============================================================================

function makeIngestion(isSingle: boolean) {
  const service = new IngestionService({} as any);
  (service as any).geminiAdapter = {
    isSingleDocument: async () => isSingle,
    extractFromImage: async () => ({ detectedLanguage: 'en', documentType: 'Receipt', rawText: 'total 10', summary: '', facts: [], entities: [], overallConfidence: 0.99 }),
  };
  const markAsNeedsReview = vi.fn(async () => {});
  (service as any).persistenceService = {
    markAsNeedsReview, markAsFailed: async () => {}, recordExtractionFailure: async () => {}, recordExtractionModel: async () => {},
    recordDeliveryFailure: async () => {}, updateDocumentWithExtraction: async () => {},
  };
  return { service, markAsNeedsReview };
}
const run = (s: IngestionService) => s.processUploadAsync('doc-1', 'user-1', 'org-1', Buffer.from('x'), 'application/pdf', 'scan.pdf', 'uploads/scan.pdf');

function makePersistence() {
  const facts: any[] = [];
  const doc: any = { id: 'doc-1', status: 'PROCESSING', processedAt: null };
  const prisma: any = {
    document: { update: async ({ data }: any) => Object.assign(doc, data) },
    documentFact: {
      deleteMany: async ({ where }: any) => { const keys: string[] = where.key.in; for (let i = facts.length - 1; i >= 0; i--) if (keys.includes(facts[i].key)) facts.splice(i, 1); },
      create: async ({ data }: any) => { facts.push(data); return data; },
    },
  };
  return { svc: new PersistenceService(prisma), facts, doc };
}

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe('ingestion', () => {
  it('a multi-document file: NEEDS_REVIEW with the reason, and no extraction', async () => {
    const { service, markAsNeedsReview } = makeIngestion(false);
    await run(service);
    expect(markAsNeedsReview).toHaveBeenCalledWith('doc-1', MULTIPLE_DOCUMENTS_REASON);
    expect(MULTIPLE_DOCUMENTS_REASON).toBe('Multiple documents');
  });
  it('a single document never touches that path', async () => {
    const { service, markAsNeedsReview } = makeIngestion(true);
    await run(service);
    expect(markAsNeedsReview).not.toHaveBeenCalled();
  });
});

describe('persistence.markAsNeedsReview', () => {
  it('with a reason: the status, and the two decision facts the screen reads', async () => {
    const { svc, facts, doc } = makePersistence();
    await svc.markAsNeedsReview('doc-1', MULTIPLE_DOCUMENTS_REASON);
    expect(doc.status).toBe('NEEDS_REVIEW');
    expect(facts.map(f => [f.key, f.valueString])).toEqual([['decision', 'NEEDS_REVIEW'], ['decision_reason', 'Multiple documents']]);
    // a second call replaces rather than accumulates
    await svc.markAsNeedsReview('doc-1', MULTIPLE_DOCUMENTS_REASON);
    expect(facts).toHaveLength(2);
  });
  it('the control, no reason (the emergency fallback): status only, as before', async () => {
    const { svc, facts, doc } = makePersistence();
    await svc.markAsNeedsReview('doc-1');
    expect(doc.status).toBe('NEEDS_REVIEW');
    expect(facts).toEqual([]);
  });
});
