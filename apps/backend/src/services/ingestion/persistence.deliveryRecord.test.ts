import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersistenceService } from './persistence';

// ============================================================================
// The delivery-failure record is a DocumentFact under its OWN key.
// NO SCHEMA CHANGE.
// ============================================================================
// Shape, fixed here so the watch query can be written against it:
//   key         'delivery_error'
//   factType    'DELIVERY_ERROR'
//   sourceSpan  'persist_failure'
//   valueString the error CLASS, never its message
//
// Written OUTSIDE the failed transaction — which is the only place it CAN be
// written, since the transaction that would have carried it is the one that
// just rolled back. That is also why doc10 (2026-09-09T01:53:03Z) kept its
// extraction_model row while losing every fact written inside the tx.
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

describe('recordDeliveryFailure writes its own key', () => {
  it('writes the fixed shape', async () => {
    const { prisma, create } = makePrisma();
    const svc = new PersistenceService(prisma);
    await (svc as any).recordDeliveryFailure('doc-1', 'TypeError');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      documentId: 'doc-1',
      key: 'delivery_error',
      factType: 'DELIVERY_ERROR',
      sourceSpan: 'persist_failure',
      valueString: 'TypeError',
    });
  });

  it('is NOT extraction_error — the two keys stay disjoint', async () => {
    const { prisma, create, deleteMany } = makePrisma();
    const svc = new PersistenceService(prisma);
    await (svc as any).recordDeliveryFailure('doc-2', 'RangeError');
    expect(create.mock.calls[0][0].data.key).not.toBe('extraction_error');
    expect(deleteMany.mock.calls[0][0].where.key).toBe('delivery_error');
  });

  it('replaces rather than accumulates — DocumentFact has no timestamp', async () => {
    const { prisma, deleteMany, create } = makePrisma();
    const svc = new PersistenceService(prisma);
    await (svc as any).recordDeliveryFailure('doc-3', 'TypeError');
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany.mock.calls[0][0].where).toMatchObject({ documentId: 'doc-3', key: 'delivery_error' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('carries nothing user-derived — only the class', async () => {
    const { prisma, create } = makePrisma();
    const svc = new PersistenceService(prisma);
    await (svc as any).recordDeliveryFailure('doc-4', 'TypeError');
    expect(Object.keys(create.mock.calls[0][0].data).sort()).toEqual(
      ['confidence', 'documentId', 'factType', 'isReviewed', 'key', 'sourceSpan', 'valueString'].sort()
    );
  });
});
