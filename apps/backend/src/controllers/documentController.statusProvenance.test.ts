import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// updateStatus must record that it ran. Today it records nothing.
// ============================================================================
// documentController.updateStatus whitelists the target status and then issues a
// bare `document.update({ data: { status } })`. No fact, no provenance, no trace.
//
// Measured consequence: 62 production documents hold status COMPLETED with
// rawText '' and confidence 0. The extraction path CANNOT produce that —
// updateDocumentWithExtraction downgrades to NEEDS_REVIEW whenever confidence is
// below 0.98, and an empty fallback has confidence 0. Every other writer
// produces FAILED / NEEDS_REVIEW / LIMIT_REACHED. updateStatus is the only
// writer of COMPLETED, and ZERO of those 62 carry any fact showing it happened.
//
// That invisibility is what strands them: the re-extraction rule under
// consideration — not PROCESSING, and no fact whose sourceSpan marks user
// authorship — cannot classify a COMPLETED row while a user's approval leaves
// no mark. This record is the precondition for that rule, not a nicety.
//
// NO GUARD IS ADDED HERE, deliberately. Both callers already gate on
// NEEDS_REVIEW (DocumentDetailScreen:429 and the NEEDS_REVIEW-filtered queue),
// so a source-state refusal would defend a path no client uses — and would have
// prevented none of the 62, which reached NEEDS_REVIEW legitimately via
// markAsNeedsReview (which leaves documentType 'UNKNOWN' on a rolled-back stub).
// Refusing an EMPTY document would block a path users demonstrably rely on to
// clear their queue. Whether those approvals were deliberate is exactly what
// this record makes measurable; a guard now would suppress the evidence for it.
// ============================================================================

const mocks = vi.hoisted(() => ({
  docFindFirst: vi.fn(),
  docUpdate: vi.fn(),
  factDeleteMany: vi.fn(),
  factCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../prismaClient', () => {
  const tx = {
    document: { update: mocks.docUpdate },
    documentFact: { deleteMany: mocks.factDeleteMany, create: mocks.factCreate },
  };
  return {
    prisma: {
      document: { findFirst: mocks.docFindFirst, update: mocks.docUpdate },
      documentFact: { deleteMany: mocks.factDeleteMany, create: mocks.factCreate },
      $transaction: (fn: any) => { mocks.transaction(); return fn(tx); },
    },
  };
});
vi.mock('../services/storage/getSignedFileUrl', () => ({ getSignedFileUrl: vi.fn() }));
vi.mock('../services/storage/supabaseStorage', () => ({
  uploadToSupabase: vi.fn(), downloadFromSupabase: vi.fn(),
}));
vi.mock('../services/ingestion/ingestionService', () => ({
  IngestionService: class { processUploadAsync = vi.fn(); },
}));
vi.mock('../services/ruleEngineService', () => ({
  RuleEngineService: class { evaluate = vi.fn(); },
}));

import { DocumentController } from './documentController';

const DOC = 'doc-1';
const ORG = 'org-1';

const makeRes = () => ({
  statusCode: undefined as number | undefined,
  body: undefined as any,
  status(c: number) { this.statusCode = c; return this; },
  json(p: any) { this.body = p; return this; },
}) as any;

const run = async (status = 'COMPLETED') => {
  mocks.docFindFirst.mockResolvedValue({ id: DOC, organizationId: ORG, status: 'NEEDS_REVIEW' });
  mocks.docUpdate.mockResolvedValue({ id: DOC, status, facts: [], documentEntities: [] });
  const req: any = { params: { id: DOC }, body: { status }, user: { organizationId: ORG } };
  const res = makeRes();
  const next = vi.fn();
  await DocumentController.updateStatus(req, res, next);
  return { res, next };
};

const createdFact = () =>
  mocks.factCreate.mock.calls.map(c => c[0].data).find(d => d.key === 'status_change');

describe('updateStatus records its action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('writes a status_change fact', async () => {
    await run('COMPLETED');

    expect(createdFact(), 'updateStatus left no trace at all').toBeTruthy();
  });

  it('the fact carries the NEW status as its value', async () => {
    await run('REJECTED');

    expect(createdFact().valueString).toBe('REJECTED');
  });

  it('the sourceSpan marks USER authorship, so the re-extraction rule can see it', async () => {
    // The rule keys on user-authored sentinels: user_correction,
    // user_justification, review_flow. This one must join that family or a
    // COMPLETED row stays unclassifiable.
    await run('COMPLETED');

    expect(createdFact().sourceSpan).toMatch(/^user_/);
  });

  it('replaces any prior status_change rather than accumulating', async () => {
    // DocumentFact carries no timestamp, so two rows would be
    // indistinguishable. Same replace-then-create idiom as applyFixAction.
    await run('COMPLETED');

    const deleted = mocks.factDeleteMany.mock.calls.map(c => c[0].where);
    expect(deleted.some(w => w.documentId === DOC && w.key === 'status_change')).toBe(true);
  });

  it('the status change and its record commit TOGETHER', async () => {
    // An unrecorded status change is the whole defect. If the record cannot be
    // written, the change must not stand.
    await run('COMPLETED');

    expect(mocks.transaction, 'status and provenance were not written in one transaction').toHaveBeenCalled();
  });

  it('CONTROL: an invalid status is still rejected with 400 and writes nothing', async () => {
    mocks.docFindFirst.mockResolvedValue({ id: DOC, organizationId: ORG });
    const req: any = { params: { id: DOC }, body: { status: 'BANANA' }, user: { organizationId: ORG } };
    const res = makeRes();
    await DocumentController.updateStatus(req, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(mocks.factCreate).not.toHaveBeenCalled();
  });

  it('CONTROL: a missing document still 404s and writes nothing', async () => {
    mocks.docFindFirst.mockResolvedValue(null);
    const req: any = { params: { id: DOC }, body: { status: 'COMPLETED' }, user: { organizationId: ORG } };
    const res = makeRes();
    await DocumentController.updateStatus(req, res, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(mocks.factCreate).not.toHaveBeenCalled();
  });

  it('CONTROL: it stays PERMISSIVE — an empty document is still approvable', async () => {
    // 62 production documents were cleared this way. Refusing would leave users
    // with un-dismissable queue items; the ruling is to record, not to guard.
    mocks.docFindFirst.mockResolvedValue({ id: DOC, organizationId: ORG, status: 'NEEDS_REVIEW', rawText: '', overallConfidence: 0 });
    mocks.docUpdate.mockResolvedValue({ id: DOC, status: 'COMPLETED', facts: [], documentEntities: [] });
    const req: any = { params: { id: DOC }, body: { status: 'COMPLETED' }, user: { organizationId: ORG } };
    const res = makeRes();
    await DocumentController.updateStatus(req, res, vi.fn());

    expect(res.statusCode).toBe(200);
  });
});
