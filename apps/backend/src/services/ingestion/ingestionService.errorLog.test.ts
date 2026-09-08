import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IngestionService } from './ingestionService';

// ============================================================================
// ERROR-OBJECT LOGGING POLICY (redaction.ts) — the four raw `.message` sites in
// ingestionService.ts.
// ============================================================================
// Every assertion here is PAIRED. A bare `not.toContain(raw)` proves nothing:
// it passes just as happily when the line was never written, when the prefix
// was misspelt, or when the log call threw before emitting. So each site is
// checked three ways against the SAME captured line:
//
//   1. the redaction marker IS present   -> the scrubber actually ran
//   2. the raw value is NOT present      -> it ran on this value
//   3. the line carries no newline       -> the record was not split
//
// (1) is what makes this a test rather than a tautology, and it is the half
// that fails first against unmodified source.
//
// REACHABILITY, stated honestly per site:
//   :62  live  — markAsNeedsReview is one prisma.document.update; it rejects.
//   :85  NOT reachable in production. geminiAdapter.ts contains no `throw`, and
//                extractFromImage's own catch (geminiAdapter.ts:249-275)
//                swallows and RETURNS a fallback. The only reason this file can
//                reach ingestionService.ts:84 at all is that it substitutes the
//                adapter. The guard there is defensive.
//   :111 live  — updateDocumentWithExtraction runs a prisma $transaction.
//   :113 live  — the emergency fallback, same shape as :62.
//
// The payloads below are what a Prisma rejection actually looks like: a
// multi-line message with an identifier quoted back at us out of the query. One
// distinct address per site, so a line captured from the wrong site cannot make
// another site's assertion pass.
// ============================================================================

const RAW_A = 'victim-a@example.com';
const RAW_B = 'victim-b@example.com';
const RAW_C = 'victim-c@example.com';
const RAW_D = 'victim-d@example.com';

function prismaShapedError(raw: string): Error {
  const err = new Error(
    `\nInvalid \`prisma.document.update()\` invocation:\n\n` +
      `An operation failed because it depends on one or more records that were required but not found.\n` +
      `  query: SELECT "public"."User"."email" FROM "public"."User" WHERE "email" = '${raw}'\n`
  );
  (err as any).code = 'P2025';
  return err;
}

/** All console.error output, one string per call, args joined the way a reader sees them. */
let errorLines: string[];

function linesStartingWith(prefix: string): string[] {
  return errorLines.filter(line => line.startsWith(prefix));
}

function assertScrubbed(line: string, raw: string): void {
  // Positive half — the scrubber ran.
  expect(line).toContain('[redacted-email]');
  // Negative half — it ran on THIS value.
  expect(line).not.toContain(raw);
  // The record is one record.
  expect(line).not.toContain('\n');
}

function makeService(overrides: {
  isSingleDocument?: () => Promise<boolean>;
  extractFromImage?: () => Promise<any>;
  markAsNeedsReview?: () => Promise<void>;
  updateDocumentWithExtraction?: () => Promise<void>;
}) {
  const service = new IngestionService({} as any);

  (service as any).geminiAdapter = {
    isSingleDocument: overrides.isSingleDocument ?? (async () => true),
    extractFromImage:
      overrides.extractFromImage ??
      (async () => ({
        detectedLanguage: 'en',
        documentType: 'Receipt',
        rawText: 'total 10',
        summary: '',
        facts: [],
        entities: [],
        overallConfidence: 0.99,
      })),
  };

  (service as any).persistenceService = {
    markAsNeedsReview: overrides.markAsNeedsReview ?? (async () => {}),
    // Terminal fallback, reached only when markAsNeedsReview rejects. Stubbed
    // so this double still models PersistenceService; these tests assert on the
    // NEEDS_REVIEW-failure log line, not on what follows it.
    markAsFailed: async () => {},
    // Called when every extraction attempt fails or comes back under the 0.6
    // confidence bar — which is exactly the situation the :85 test below sets
    // up. Stubbed for the same reason as markAsFailed: this file asserts on the
    // scrubbing of the ATTEMPT-failure log line, not on the failure record that
    // now follows it.
    recordExtractionFailure: async () => {},
    // Written for EVERY document that attempts extraction, success or failure,
    // so it is reached by every test in this file. Stubbed for the same reason
    // as the two above: this file asserts on log-line scrubbing, not on the
    // experiment's bookkeeping.
    recordExtractionModel: async () => {},
    updateDocumentWithExtraction: overrides.updateDocumentWithExtraction ?? (async () => {}),
  };

  return service;
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

describe('ingestionService error logging goes through formatErrorForLog', () => {
  beforeEach(() => {
    errorLines = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errorLines.push(args.map(a => String(a)).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(':62 — multi-document NEEDS_REVIEW failure is scrubbed, not echoed raw', async () => {
    const service = makeService({
      isSingleDocument: async () => false,
      markAsNeedsReview: async () => {
        throw prismaShapedError(RAW_A);
      },
    });

    await run(service);

    const lines = linesStartingWith('[Background] Failed to mark');
    expect(lines).toHaveLength(1);
    assertScrubbed(lines[0], RAW_A);
  });

  it(':85 — extraction attempt failure is scrubbed (defensive: unreachable in production)', async () => {
    const service = makeService({
      extractFromImage: async () => {
        throw prismaShapedError(RAW_B);
      },
    });

    await run(service);

    const lines = errorLines.filter(line => line.includes('failed with error'));
    // MAX_ATTEMPTS = 2, so the site is exercised twice.
    expect(lines).toHaveLength(2);
    for (const line of lines) assertScrubbed(line, RAW_B);
  });

  it(':111 — persistence failure is scrubbed, not echoed raw', async () => {
    const service = makeService({
      updateDocumentWithExtraction: async () => {
        throw prismaShapedError(RAW_C);
      },
    });

    await run(service);

    const lines = linesStartingWith('[CRITICAL] Persistence failed');
    expect(lines).toHaveLength(1);
    assertScrubbed(lines[0], RAW_C);
  });

  it(':113 — emergency fallback failure is scrubbed, not echoed raw', async () => {
    const service = makeService({
      updateDocumentWithExtraction: async () => {
        throw prismaShapedError(RAW_C);
      },
      markAsNeedsReview: async () => {
        throw prismaShapedError(RAW_D);
      },
    });

    await run(service);

    const lines = linesStartingWith('[FATAL] Even emergency fallback failed');
    expect(lines).toHaveLength(1);
    assertScrubbed(lines[0], RAW_D);
  });
});
