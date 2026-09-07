import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { format } from 'node:util';
import { IngestionService } from './ingestionService';

// ============================================================================
// WHAT A DOCUMENT BECOMES WHEN `markAsNeedsReview` ITSELF FAILS.
// ============================================================================
// This is a BEHAVIOUR change, not a logging one. Both `markAsNeedsReview` call
// sites in processUploadAsync end in `.catch(...)` that logs and swallows
// (:62 and :113). The function then RESOLVES, uploadController's `.catch`
// never fires, and the row is left in `PROCESSING` even though the detached
// setImmediate callback has returned and nothing is working on it.
//
// RULED: it lands in FAILED. The alternatives are excluded by construction,
// not by preference:
//   NEEDS_REVIEW is written ONLY by the call that just failed
//                (persistence.ts markAsNeedsReview);
//   COMPLETED    is false — the $transaction rolled back, or the image was
//                rejected as multi-document;
//   PROCESSING   asserts a process that has already returned.
//
// This introduces NO NEW STATE. staleSweepService.ts already converges these
// rows to FAILED (15-minute threshold, 5-minute interval, wired at index.ts:10
// and reached in production because package.json `start` is `node
// dist/index.js`). The change makes that outcome immediate rather than up to
// ~20 minutes late, and removes the window in which the client keeps treating
// a dead document as in-flight.
//
// TWO THINGS THIS DELIBERATELY DOES NOT DO, each pinned by a test below.
//
//   1. It does not fire when markAsNeedsReview SUCCEEDS. The forced write is
//      the failure path only.
//   2. It does not make processUploadAsync REJECT when the forced write also
//      fails. A rejection would newly reach uploadController's `.catch` — a
//      block that #182 established is defensive and does not currently run —
//      which is a second behaviour change and out of scope. When both writes
//      fail we log and give up; the stale sweep remains the backstop.
//
// Console output is captured with util.format, per the CLAUDE.md rule recorded
// in #183: `String()` renders an object argument as `[object Object]`, so a
// String-based harness cannot see an object dump and reports a leak as absent.
// ============================================================================

const RAW_A = 'victim-a@example.com';
const RAW_B = 'victim-b@example.com';
const RAW_C = 'victim-c@example.com';
const RAW_D = 'victim-d@example.com';

function prismaShapedError(raw: string): Error {
  const err = new Error(
    '\nInvalid `prisma.document.update()` invocation:\n\n' +
      'An operation failed because it depends on one or more records that were required but not found.\n' +
      '  query: SELECT "public"."User"."email" FROM "public"."User" WHERE "email" = \'' + raw + '\'\n'
  );
  (err as any).code = 'P2025';
  return err;
}

let errorLines: string[];

function linesStartingWith(prefix: string): string[] {
  return errorLines.filter(line => line.startsWith(prefix));
}

function assertScrubbed(line: string, raw: string): void {
  expect(line).toContain('[redacted-email]');
  expect(line).not.toContain(raw);
  expect(line).not.toContain('\n');
}

type Overrides = {
  isSingleDocument?: () => Promise<boolean>;
  markAsNeedsReview?: () => Promise<void>;
  markAsFailed?: () => Promise<void>;
  updateDocumentWithExtraction?: () => Promise<void>;
};

function makeService(overrides: Overrides) {
  const service = new IngestionService({} as any);

  (service as any).geminiAdapter = {
    isSingleDocument: overrides.isSingleDocument ?? (async () => true),
    extractFromImage: async () => ({
      detectedLanguage: 'en',
      documentType: 'Receipt',
      rawText: 'total 10',
      summary: '',
      facts: [],
      entities: [],
      overallConfidence: 0.99,
    }),
  };

  const markAsNeedsReview = vi.fn(overrides.markAsNeedsReview ?? (async () => {}));
  const markAsFailed = vi.fn(overrides.markAsFailed ?? (async () => {}));

  (service as any).persistenceService = {
    markAsNeedsReview,
    markAsFailed,
    updateDocumentWithExtraction:
      overrides.updateDocumentWithExtraction ?? (async () => {}),
  };

  return { service, markAsNeedsReview, markAsFailed };
}

function run(service: IngestionService) {
  return service.processUploadAsync(
    'doc-1',
    'user-1',
    'org-1',
    Buffer.from('fake-image-bytes'),
    'image/jpeg',
    'receipt.jpg',
    'uploads/1700000000000-receipt.jpg'
  );
}

describe('a failed markAsNeedsReview leaves the row FAILED, not PROCESSING', () => {
  beforeEach(() => {
    errorLines = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errorLines.push(format(...args));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(':62 — multi-document abort: NEEDS_REVIEW write fails, so the row is forced FAILED', async () => {
    const { service, markAsNeedsReview, markAsFailed } = makeService({
      isSingleDocument: async () => false,
      markAsNeedsReview: async () => {
        throw prismaShapedError(RAW_A);
      },
    });

    await run(service);

    expect(markAsNeedsReview).toHaveBeenCalledTimes(1);
    expect(markAsFailed).toHaveBeenCalledTimes(1);
    expect(markAsFailed).toHaveBeenCalledWith('doc-1');
  });

  it(':113 — emergency fallback: NEEDS_REVIEW write fails, so the row is forced FAILED', async () => {
    const { service, markAsNeedsReview, markAsFailed } = makeService({
      updateDocumentWithExtraction: async () => {
        throw prismaShapedError(RAW_B);
      },
      markAsNeedsReview: async () => {
        throw prismaShapedError(RAW_C);
      },
    });

    await run(service);

    expect(markAsNeedsReview).toHaveBeenCalledTimes(1);
    expect(markAsFailed).toHaveBeenCalledTimes(1);
    expect(markAsFailed).toHaveBeenCalledWith('doc-1');
  });

  it('GUARD — the forced write does NOT fire when markAsNeedsReview succeeds', async () => {
    // Passes before AND after this change. It pins the failure path as the
    // only trigger, so a later edit cannot start overwriting NEEDS_REVIEW rows
    // with FAILED. Not one of the reds.
    const multiDoc = makeService({ isSingleDocument: async () => false });
    await run(multiDoc.service);
    expect(multiDoc.markAsNeedsReview).toHaveBeenCalledTimes(1);
    expect(multiDoc.markAsFailed).not.toHaveBeenCalled();

    const persistFails = makeService({
      updateDocumentWithExtraction: async () => {
        throw prismaShapedError(RAW_B);
      },
    });
    await run(persistFails.service);
    expect(persistFails.markAsNeedsReview).toHaveBeenCalledTimes(1);
    expect(persistFails.markAsFailed).not.toHaveBeenCalled();
  });

  it('both writes fail: the workflow still RESOLVES, and says so on one scrubbed line', async () => {
    // The resolve half matters as much as the log half. Rejecting here would
    // newly reach uploadController's .catch — defensive today per #182 — which
    // is a separate behaviour change. The stale sweep stays the backstop.
    const { service, markAsFailed } = makeService({
      isSingleDocument: async () => false,
      markAsNeedsReview: async () => {
        throw prismaShapedError(RAW_A);
      },
      markAsFailed: async () => {
        throw prismaShapedError(RAW_D);
      },
    });

    await expect(run(service)).resolves.toBeUndefined();

    expect(markAsFailed).toHaveBeenCalledTimes(1);
    const lines = linesStartingWith('[Background] Could not force doc-1 to FAILED');
    expect(lines).toHaveLength(1);
    assertScrubbed(lines[0], RAW_D);
  });

  it('the forced write throwing SYNCHRONOUSLY also resolves — .catch() would not have caught it', async () => {
    // Found by the existing suite, not by the tests above. Two pre-existing
    // doubles (tests/ingestionMultiDoc.test.ts, ingestionService.errorLog.test.ts)
    // stub persistenceService without markAsFailed, so calling it raised
    // `TypeError: ... is not a function` — a SYNCHRONOUS throw, which a
    // `.catch()` on the returned promise cannot intercept because no promise is
    // ever returned. processUploadAsync rejected, which is exactly what the
    // previous test claims cannot happen. The call site therefore uses
    // try/catch rather than .catch(). Both doubles now stub the method too.
    const service = new IngestionService({} as any);
    (service as any).geminiAdapter = { isSingleDocument: async () => false };
    (service as any).persistenceService = {
      markAsNeedsReview: async () => {
        throw prismaShapedError(RAW_A);
      },
      markAsFailed: () => {
        throw new TypeError('markAsFailed exploded before returning a promise');
      },
    };

    await expect(run(service)).resolves.toBeUndefined();

    const lines = linesStartingWith('[Background] Could not force doc-1 to FAILED');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('name=TypeError');
    expect(lines[0]).not.toContain('\n');
  });
});
