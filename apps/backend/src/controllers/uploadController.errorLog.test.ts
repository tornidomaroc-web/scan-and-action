import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { format } from 'node:util';

// ============================================================================
// ERROR-OBJECT LOGGING POLICY (redaction.ts) — the three raw `.message` LOG
// sites in uploadController.ts: :110, :121, :127.
// ============================================================================
// LINE NUMBERS THROUGHOUT THIS FILE NAME THE SITES AS THEY STOOD BEFORE THIS
// CHANGE, which is how LAUNCH_TODO.md:126 and #181 refer to them. The fix adds
// an import and a comment block, so the post-change positions are lower down
// the file. The prefixes asserted below, not the numbers, are what bind a test
// to its site.
// ============================================================================
// Every assertion is PAIRED. A bare `not.toContain(raw)` proves nothing: it
// passes just as happily when the line was never written, when the prefix was
// misspelt, or when the log call threw before emitting. Each site is checked
// three ways against the SAME captured line:
//
//   1. a redaction/projection marker IS present -> the redactor actually ran
//   2. the raw value is NOT present             -> it ran on THIS value
//   3. the line carries no newline              -> the record was not split
//
// (1) is what makes this a test rather than a tautology, and it is the half
// that fails first against unmodified source.
//
// ---------------------------------------------------------------------------
// WHY THIS HARNESS CAPTURES WITH util.format AND NOT String(), unlike the
// ingestionService.errorLog.test.ts harness it is otherwise modelled on.
// ---------------------------------------------------------------------------
// That file captures with `args.map(a => String(a)).join(' ')`. For a STRING
// argument that is faithful. For an OBJECT it is not: `String({...})` is the
// literal text `[object Object]`, so a harness built that way reports the
// object-dump leak below as ABSENT and passes against unfixed source. Node's
// console.error formats with util.format (util.inspect for objects), which
// prints every enumerable field — including nested ones — across MULTIPLE
// LINES. Verified before this file was written:
//
//   String  : "prefix: [object Object]"           -> leak NOT visible
//   format  : "prefix: {\n  code: 'P2002',\n
//              storageKey: 'uploads/…-cv-john-smith.pdf',\n
//              requestBody: { email: 'victim@example.com' }\n}"
//                                                 -> leak visible, record split
//
// So this harness reproduces the real sink. It matters specifically for the
// `|| err` branch at :110 and :127, which is the whole reason those two sites
// are the worse shape of the three.
//
// ---------------------------------------------------------------------------
// TWO DISTINCT HAZARDS PER `|| err` SITE, so each gets its own test.
// ---------------------------------------------------------------------------
//   message PRESENT -> `err.message` is interpolated raw. A Prisma message is
//     multi-line and quotes the failing query back at us, so the record splits
//     and unaudited text reaches stdout. Marker: [redacted-email].
//   message ABSENT  -> `err.message || err` evaluates to the WHOLE OBJECT and
//     console.error serialises every enumerable field. This is the shape Rule 1
//     of the ERROR-OBJECT POLICY (redaction.ts:72-78) forbids outright. Marker:
//     `code=P2002` — formatErrorForLog's bounded projection. That token cannot
//     appear in a raw dump, which prints `code: 'P2002'` with a colon and
//     quotes; confirmed against util.format before this file was written. The
//     unallowlisted fields are DROPPED, not scrubbed, so there is no
//     [redacted-*] marker to assert on this path — the projection token is the
//     positive half.
//
// ---------------------------------------------------------------------------
// REACHABILITY, stated honestly per site. This CORRECTS the queue item.
// ---------------------------------------------------------------------------
// LAUNCH_TODO.md:126 says "Reachability is not in doubt here, unlike
// ingestionService.ts:85". That is true of :127 and WRONG of :110 and :121.
//
//   :127 LIVE. The outer try wraps uploadToSupabase (which throws on a vendor
//        error, supabaseStorage.ts:44, and on missing env, :9) plus three
//        Prisma calls — organization.findUnique, document.count and
//        document.create. Any of them rejecting lands here. This is the one
//        demonstrated live leak in the file.
//
//   :110 DEFENSIVE, and :121 with it. Both sit in the `.catch` on
//   :121 processUploadAsync, and after #181 no path in that function rejects
//        under the error shapes its dependencies produce:
//          - validateSingleDocument -> geminiAdapter.isSingleDocument FAILS
//            OPEN (geminiAdapter.ts:101-106 catches everything and returns
//            true); that file contains zero `throw` statements;
//          - extractFromImage sits inside the retry try/catch AND self-catches;
//          - both markAsNeedsReview call sites end in `.catch(...)`.
//        The residual is a property getter that throws while formatErrorForLog
//        reads name/code/status/meta/message. Prisma does not produce that.
//        Guarding them is still right — #181 fixed its :85 on exactly this
//        basis — but the claim is "defensive", not "live".
//
// :112 IS NOT A LOG SITE AND IS DELIBERATELY UNTOUCHED. `err.message ===
// 'LIMIT_REACHED'` is a COMPARISON driving the status branch, and
// formatErrorForLog returns a projection (`name=Error message=LIMIT_REACHED`),
// not the bare message. Routing it through the redactor would silently break
// the limit branch under a green suite. The last test in this file pins that
// branch so a later "consistency" edit goes red instead of silent. It is a
// GUARD, not one of the reds: it passes before and after this change.
//
// A sweep of the whole file found exactly four `.message` occurrences — the
// three logs above and that one comparison. The other comparisons (:17, :33,
// :51) are on organizationId / plan / counts and are not error-derived.
// ============================================================================

const mocks = vi.hoisted(() => ({
  processUploadAsync: vi.fn(),
  uploadToSupabase: vi.fn(),
  orgFindUnique: vi.fn(),
  docCount: vi.fn(),
  docCreate: vi.fn(),
  docUpdate: vi.fn(),
}));

vi.mock('../prismaClient', () => ({
  prisma: {
    organization: { findUnique: mocks.orgFindUnique },
    document: {
      count: mocks.docCount,
      create: mocks.docCreate,
      update: mocks.docUpdate,
    },
  },
}));

vi.mock('../services/storage/supabaseStorage', () => ({
  uploadToSupabase: mocks.uploadToSupabase,
}));

vi.mock('../services/ingestion/ingestionService', () => ({
  IngestionService: class {
    processUploadAsync = mocks.processUploadAsync;
  },
}));

import { UploadController } from './uploadController';

// One distinct value per site, so a line captured from the wrong site cannot
// make another site's assertion pass.
const RAW_BG = 'victim-bg@example.com';
const RAW_UPDATE = 'victim-update@example.com';
const RAW_OUTER = 'victim-outer@example.com';

const KEY_BG = 'uploads/1730000000001-cv-john-smith.pdf';
const KEY_OUTER = 'uploads/1730000000002-payslip-jane-doe.pdf';
const NESTED_BG = 'nested-bg@example.com';
const NESTED_OUTER = 'nested-outer@example.com';

/** What a Prisma rejection actually looks like: multi-line, quoting the query. */
function prismaShapedError(raw: string): Error {
  const err = new Error(
    '\nInvalid `prisma.document.update()` invocation:\n\n' +
      'An operation failed because it depends on one or more records that were required but not found.\n' +
      '  query: SELECT "public"."User"."email" FROM "public"."User" WHERE "email" = \'' + raw + '\'\n'
  );
  (err as any).code = 'P2025';
  return err;
}

/**
 * A vendor error with NO `message`, carrying enumerable fields nobody chose to
 * log. `err.message` is undefined -> falsy -> `|| err` hands the whole object
 * to console.error. `code` is allowlisted by formatErrorForLog; `storageKey`
 * and `requestBody` are not, and are dropped rather than scrubbed.
 */
function messagelessVendorError(storageKey: string, email: string): Record<string, unknown> {
  return {
    code: 'P2002',
    storageKey,
    requestBody: { email },
  };
}

let errorLines: string[];

function linesStartingWith(prefix: string): string[] {
  return errorLines.filter(line => line.startsWith(prefix));
}

/** message-present path: the scrubber ran, on this value, without splitting. */
function assertScrubbedMessage(line: string, raw: string): void {
  expect(line).toContain('[redacted-email]');
  expect(line).not.toContain(raw);
  expect(line).not.toContain('\n');
}

/** message-absent path: a bounded projection, not a dump of the object. */
function assertBoundedProjection(line: string, ...rawValues: string[]): void {
  expect(line).toContain('code=P2002');
  for (const raw of rawValues) expect(line).not.toContain(raw);
  // The unallowlisted field NAMES must not survive either.
  expect(line).not.toContain('storageKey');
  expect(line).not.toContain('requestBody');
  expect(line).not.toContain('\n');
}

function makeReq(): any {
  return {
    file: {
      buffer: Buffer.from('fake-image-bytes'),
      mimetype: 'image/jpeg',
      size: 1234,
      originalname: 'receipt.jpg',
    },
    user: { id: 'user-1', organizationId: 'org-1' },
  };
}

function makeRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

/**
 * The background work is scheduled with setImmediate and its `.catch` handler
 * is async (it awaits prisma.document.update), so one turn is not enough. Each
 * setImmediate round drains all pending microtasks before the next macrotask.
 */
async function flushBackground(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}

async function runUpload(): Promise<void> {
  await UploadController.uploadDocument(makeReq(), makeRes(), vi.fn() as any);
  await flushBackground();
}

describe('uploadController error logging goes through formatErrorForLog', () => {
  beforeEach(() => {
    errorLines = [];
    // vi.restoreAllMocks() in afterEach restores SPIES but does not clear call
    // history on the vi.fn()s created by vi.hoisted above — they are shared
    // module-level singletons. Without this, docUpdate's calls accumulate
    // across tests and the :112 guard's call-count assertion reads 5 instead
    // of 1. Clear history first; the implementations are re-set just below.
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Capture the way the real sink formats, not with String(). See the header.
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errorLines.push(format(...args));
    });

    mocks.uploadToSupabase.mockResolvedValue('uploads/1730000000000-receipt.jpg');
    mocks.orgFindUnique.mockResolvedValue({ plan: 'PRO', scanCount: 0 });
    mocks.docCount.mockResolvedValue(0);
    mocks.docCreate.mockResolvedValue({ id: 'doc-1' });
    mocks.docUpdate.mockResolvedValue({});
    mocks.processUploadAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(':110 — a message-bearing rejection is scrubbed, not echoed raw', async () => {
    mocks.processUploadAsync.mockRejectedValue(prismaShapedError(RAW_BG));

    await runUpload();

    const lines = linesStartingWith('[Background] Extraction failed for doc-1:');
    expect(lines).toHaveLength(1);
    assertScrubbedMessage(lines[0], RAW_BG);
  });

  it(':110 — a messageless rejection logs a projection, never the whole object', async () => {
    mocks.processUploadAsync.mockRejectedValue(messagelessVendorError(KEY_BG, NESTED_BG));

    await runUpload();

    const lines = linesStartingWith('[Background] Extraction failed for doc-1:');
    expect(lines).toHaveLength(1);
    assertBoundedProjection(lines[0], KEY_BG, NESTED_BG);
  });

  it(':121 — a message-bearing status-update failure is scrubbed, not echoed raw', async () => {
    mocks.processUploadAsync.mockRejectedValue(new Error('upstream extraction failed'));
    mocks.docUpdate.mockRejectedValue(prismaShapedError(RAW_UPDATE));

    await runUpload();

    const lines = linesStartingWith('[Background] Could not set FAILED status for doc-1:');
    expect(lines).toHaveLength(1);
    assertScrubbedMessage(lines[0], RAW_UPDATE);
  });

  it(':121 — a messageless status-update failure logs a projection, not "undefined"', async () => {
    // NOT a leak: `updateErr.message` alone prints the literal text "undefined"
    // and exposes no field. This asserts the informativeness half of the same
    // fix — the line names the failure instead of saying nothing.
    mocks.processUploadAsync.mockRejectedValue(new Error('upstream extraction failed'));
    mocks.docUpdate.mockRejectedValue(messagelessVendorError(KEY_BG, NESTED_BG));

    await runUpload();

    const lines = linesStartingWith('[Background] Could not set FAILED status for doc-1:');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('code=P2002');
    expect(lines[0]).not.toContain('undefined');
    expect(lines[0]).not.toContain('\n');
  });

  it(':127 — a message-bearing upload-flow failure is scrubbed, not echoed raw', async () => {
    mocks.uploadToSupabase.mockRejectedValue(prismaShapedError(RAW_OUTER));

    await runUpload();

    const lines = linesStartingWith('[UploadController] Error during upload flow:');
    expect(lines).toHaveLength(1);
    assertScrubbedMessage(lines[0], RAW_OUTER);
  });

  it(':127 — a messageless upload-flow failure logs a projection, never the whole object', async () => {
    mocks.uploadToSupabase.mockRejectedValue(messagelessVendorError(KEY_OUTER, NESTED_OUTER));

    await runUpload();

    const lines = linesStartingWith('[UploadController] Error during upload flow:');
    expect(lines).toHaveLength(1);
    assertBoundedProjection(lines[0], KEY_OUTER, NESTED_OUTER);
  });

  it(':112 GUARD — the LIMIT_REACHED comparison still reads the bare message', async () => {
    // Pins the trap named in LAUNCH_TODO.md:126. Routing :112 through
    // formatErrorForLog would make this read `name=Error message=LIMIT_REACHED`,
    // the comparison would go false, and the status would silently become
    // FAILED. This test passes BEFORE and AFTER this change by design — it is a
    // guard against a later edit, not one of the reds.
    mocks.processUploadAsync.mockRejectedValue(new Error('LIMIT_REACHED'));

    await runUpload();

    expect(mocks.docUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.docUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: 'doc-1' },
      data: { status: 'LIMIT_REACHED' },
    });
  });
});
