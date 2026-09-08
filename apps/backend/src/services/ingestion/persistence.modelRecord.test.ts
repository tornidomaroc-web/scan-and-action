import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersistenceService } from './persistence';

// ============================================================================
// The arm record is a DocumentFact. NO SCHEMA CHANGE.
// ============================================================================
// extraction_error already rides the DocumentFact table as a keyed row
// (persistence.ts:436-450) rather than a column, and the arm record uses the
// same mechanism for the same reason: it is additive, needs no migration, and
// nothing reads it outside the experiment.
//
// Shape, fixed here so the analysis query can be written before the run:
//   key         'extraction_model'
//   factType    'EXTRACTION_MODEL'
//   sourceSpan  the arm — 'ab_pinned' | 'ab_alias'
//   valueString '<requested model id> -> <resolved version | unavailable>'
//
// The arm lives in sourceSpan, NOT in valueString, because sourceSpan is the
// column the existing provenance families already use ('extraction_failure',
// 'user_status_change') and because it must stay readable even when the
// resolved version is unavailable — which is the expected case if the API turns
// out not to send modelVersion at all.
//
// The requested id is stored EXPLICITLY rather than being recomputed from the
// arm, because GEMINI_PINNED_MODEL is overridable at runtime: arm -> model is
// only a stable mapping while that variable is unchanged, and an experiment
// that cannot be re-read after someone retunes it is not a record.
//
// Replace, never accumulate: DocumentFact carries no timestamp, so two rows for
// one document are indistinguishable. Same idiom as extraction_error.
// ============================================================================

function makePrisma() {
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const create = vi.fn().mockResolvedValue({});
  return { prisma: { documentFact: { deleteMany, create } } as any, deleteMany, create };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('recordExtractionModel writes the arm as a DocumentFact', () => {
  it('writes the fixed shape, with the arm in sourceSpan', async () => {
    const { prisma, create } = makePrisma();
    const svc = new PersistenceService(prisma);
    await (svc as any).recordExtractionModel('doc-1', 'ab_pinned', 'models/gemini-2.5-flash', 'gemini-2.5-flash-001');

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      documentId: 'doc-1',
      key: 'extraction_model',
      factType: 'EXTRACTION_MODEL',
      sourceSpan: 'ab_pinned',
      valueString: 'models/gemini-2.5-flash -> gemini-2.5-flash-001',
    });
  });

  it('records the ALIAS arm with whatever the alias actually resolved to', async () => {
    // This is the row that answers "what does -latest point at?" — a question
    // ListModels cannot answer: it lists models/gemini-flash-latest with
    // version "Gemini Flash Latest", a placeholder, not a resolution.
    const { prisma, create } = makePrisma();
    const svc = new PersistenceService(prisma);
    await (svc as any).recordExtractionModel('doc-2', 'ab_alias', 'models/gemini-flash-latest', 'gemini-3.8-flash');
    expect(create.mock.calls[0][0].data).toMatchObject({
      sourceSpan: 'ab_alias',
      valueString: 'models/gemini-flash-latest -> gemini-3.8-flash',
    });
  });

  it('records ABSENCE readably when no version came back', async () => {
    const { prisma, create } = makePrisma();
    const svc = new PersistenceService(prisma);
    await (svc as any).recordExtractionModel('doc-3', 'ab_alias', 'models/gemini-flash-latest', null);
    expect(create.mock.calls[0][0].data.valueString).toBe('models/gemini-flash-latest -> unavailable');
  });

  it('replaces rather than accumulates — DocumentFact has no timestamp', async () => {
    const { prisma, deleteMany, create } = makePrisma();
    const svc = new PersistenceService(prisma);
    await (svc as any).recordExtractionModel('doc-4', 'ab_pinned', 'models/gemini-2.5-flash', 'v1');
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany.mock.calls[0][0].where).toMatchObject({ documentId: 'doc-4', key: 'extraction_model' });
    expect(deleteMany.mock.calls[0][0].where.key).toBe('extraction_model');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('never persists anything user-derived — only the model id and the arm', async () => {
    const { prisma, create } = makePrisma();
    const svc = new PersistenceService(prisma);
    await (svc as any).recordExtractionModel('doc-5', 'ab_pinned', 'models/gemini-2.5-flash', 'gemini-2.5-flash-001');
    const data = create.mock.calls[0][0].data;
    // ERROR-OBJECT POLICY (redaction.ts): a vendor string can echo a storage key
    // which embeds the sanitized filename. Only these fields carry text.
    expect(Object.keys(data).sort()).toEqual(
      ['confidence', 'documentId', 'factType', 'isReviewed', 'key', 'sourceSpan', 'valueString'].sort()
    );
  });
});
