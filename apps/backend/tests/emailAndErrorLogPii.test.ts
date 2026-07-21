import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// NEGATIVE CONTROLS — item #3 Half B, PR B3 (the last piece of Half B)
// ============================================================================
// Three distinct guarantees, one per part of B3:
//
//   PART 1  the remaining DELIBERATE email interpolations are gone
//           (authMiddleware, webhookController, mailer x3)
//   PART 2  the shared scrubber actually RUNS on the two unpredictable-string
//           sites (errorHandler, queryExecutor) — an email/JWT embedded in an
//           error by Prisma or a vendor is redacted in stdout, not just in Sentry
//   PART 3  the ERROR-OBJECT POLICY holds: a vendor error carrying a storage
//           path does not leak the filename, and no raw error OBJECT is handed
//           to console.*
//
// Assertions are on PII VALUES, not on log wording, so a reword cannot silently
// re-leak. Fully offline: no network, no DB, no Supabase, no Gemini.
// ============================================================================

vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

const createSignedUrl = vi.fn();
const storageUpload = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: { from: () => ({ createSignedUrl, upload: storageUpload }) },
  }),
}));

import { scrubString, formatErrorForLog } from '../src/redaction';
import { errorHandler } from '../src/middleware/errorHandler';
import { QueryExecutor } from '../src/services/query/queryExecutor';
import { getSignedFileUrl } from '../src/services/storage/getSignedFileUrl';
import { uploadToSupabase } from '../src/services/storage/supabaseStorage';
import { GeminiExtractionAdapter } from '../src/services/extraction/geminiAdapter';
import { sendTransactionalEmail } from '../src/services/email/mailer';

const EMAIL = 'payer@example.com';
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
const FILENAME = 'cv-jonathan-q-smitherton.pdf';
const STORAGE_PATH = `uploads/1700000000000-${FILENAME}`;

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

function captured(): string {
  return [logSpy, warnSpy, errorSpy]
    .flatMap((s) => (s.mock.calls as unknown[][]).map((c) => c.map(String).join(' ')))
    .join('\n');
}

/** Every argument handed to console.*, unstringified — for the "no raw object" rule. */
function rawArgs(): unknown[] {
  return [logSpy, warnSpy, errorSpy].flatMap((s) => (s.mock.calls as unknown[][]).flat());
}

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ── The scrubber itself: the new path/filename patterns ────────────────────
describe('scrubString — storage paths and filenames (new in B3)', () => {
  it('redacts our storage-key shape and bare upload filenames', () => {
    expect(scrubString(`key ${STORAGE_PATH} missing`)).toBe('key [redacted-path] missing');
    expect(scrubString(`could not read ${FILENAME}`)).toBe('could not read [redacted-filename]');
    expect(scrubString('bad file receipt.JPEG here')).toContain('[redacted-filename]');
  });

  it('still redacts emails, JWTs and Bearer tokens (Half A behaviour intact)', () => {
    expect(scrubString(`mail ${EMAIL}`)).toBe('mail [redacted-email]');
    expect(scrubString(`tok ${JWT}`)).toBe('tok [redacted-token]');
  });

  it('does not mangle ordinary text or non-upload dotted tokens', () => {
    expect(scrubString('TypeError: x is not a function')).toBe('TypeError: x is not a function');
    expect(scrubString('host api.resend.com refused')).toBe('host api.resend.com refused');
  });
});

// ── PART 3: the error-object policy, as a unit ─────────────────────────────
describe('formatErrorForLog — the error-object policy', () => {
  it('projects a vendor error to bounded metadata + a SCRUBBED message', () => {
    const out = formatErrorForLog({
      name: 'StorageApiError',
      status: 404,
      message: `Object not found: ${STORAGE_PATH}`,
    });
    expect(out).toContain('name=StorageApiError');
    expect(out).toContain('status=404');
    expect(out).not.toContain(FILENAME);
    expect(out).toContain('[redacted-path]');
  });

  it('NEVER surfaces unlisted fields off the error object', () => {
    const out = formatErrorForLog({
      name: 'E',
      message: 'boom',
      // Fields a vendor might attach that we never audited:
      requestBody: { to: EMAIL, path: STORAGE_PATH },
      headers: { authorization: `Bearer ${JWT}` },
    });
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain(JWT);
    expect(out).not.toContain(FILENAME);
    expect(out).toBe('name=E message=boom');
  });

  it('degrades safely on null/undefined/primitives without throwing', () => {
    expect(formatErrorForLog(null)).toBe('unknown error');
    expect(formatErrorForLog(undefined)).toBe('unknown error');
    expect(formatErrorForLog({})).toBe('unspecified error');
    expect(formatErrorForLog(`fail ${EMAIL}`)).toBe('fail [redacted-email]');
    expect(formatErrorForLog(42)).toBe('42');
  });
});

// ── PART 1: the remaining email sites ──────────────────────────────────────
describe('PART 1 — mailer no longer logs the recipient', () => {
  const params = { to: EMAIL, subject: 'Hi', html: '<p>hi</p>', text: 'hi' };

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.MAIL_POSTAL_ADDRESS = '1 Test Street, Testville';
  });

  it('success path: logs the Resend message id, never the address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'resend-msg-99' }) })
    );

    const result = await sendTransactionalEmail(params);
    expect(result.status).toBe('sent'); // sanity: the path really ran

    const out = captured();
    expect(out).not.toContain(EMAIL);
    expect(out).not.toMatch(/@/);
    expect(out).toContain('resend-msg-99'); // the lossless non-PII handle
  });

  it('HTTP-failure path: neither the address NOR the Resend body echo leaks', async () => {
    // Resend really does echo the offending address back in its error body —
    // dropping `${to}` alone would NOT have been enough here.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: async () => `{"message":"Invalid \`to\` field: ${EMAIL}"}`,
      })
    );

    const result = await sendTransactionalEmail(params);
    expect(result.status).toBe('failed');

    const out = captured();
    expect(out).not.toContain(EMAIL);
    expect(out).not.toMatch(/@/);
    expect(out).toContain('[redacted-email]'); // proves the body was scrubbed
    expect(out).toContain('422'); // signal kept
  });

  it('network-exception path: no address, and the exception text is scrubbed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`getaddrinfo failed for ${EMAIL}`)));

    const result = await sendTransactionalEmail(params);
    expect(result.status).toBe('failed');

    const out = captured();
    expect(out).not.toContain(EMAIL);
    expect(out).not.toMatch(/@/);
  });
});

// ── PART 2: the scrubber runs on the unpredictable-string sites ────────────
describe('PART 2 — errorHandler scrubs the stack it writes to stdout', () => {
  const mkReq = () => ({ method: 'POST', originalUrl: '/api/documents' }) as any;
  const mkRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  it('redacts an email embedded in the stack by Prisma (P2002 on User.email)', () => {
    const err: any = new Error(`Unique constraint failed: User.email (${EMAIL})`);
    err.stack = `Error: Unique constraint failed: User.email (${EMAIL})\n    at prisma.user.create`;

    errorHandler(err, mkReq(), mkRes(), vi.fn());

    const out = captured();
    expect(out).not.toContain(EMAIL);
    expect(out).toContain('[redacted-email]');
    // Signal kept: the correlation id and the route still identify the failure.
    expect(out).toContain('[API Error]');
    expect(out).toContain('/api/documents');
  });

  it('redacts a bearer token embedded in the stack', () => {
    const err: any = new Error('auth blew up');
    err.stack = `Error: auth blew up: Authorization: Bearer ${JWT}\n    at authMiddleware`;

    errorHandler(err, mkReq(), mkRes(), vi.fn());

    const out = captured();
    expect(out).not.toContain(JWT);
    expect(out).toContain('[redacted-token]');
  });

  it('a NON-Error throw goes through the policy, never to console as a raw object', () => {
    // A thrown plain object used to be handed straight to console.error.
    errorHandler({ code: 'WEIRD', message: `boom ${EMAIL}`, secret: JWT } as any, mkReq(), mkRes(), vi.fn());

    const out = captured();
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain(JWT);
    expect(out).toContain('code=WEIRD');
    // Nothing object-shaped reached console.*.
    expect(rawArgs().filter((a) => a !== null && typeof a === 'object')).toHaveLength(0);
  });
});

describe('PART 2 — queryExecutor scrubs the DB error it writes to stdout', () => {
  it('redacts a value embedded in a Prisma error message', async () => {
    const prisma: any = {
      document: {
        findMany: vi.fn().mockRejectedValue(new Error(`Invalid filter for ${EMAIL}`)),
        count: vi.fn().mockRejectedValue(new Error(`Invalid filter for ${EMAIL}`)),
        aggregate: vi.fn().mockRejectedValue(new Error(`Invalid filter for ${EMAIL}`)),
        groupBy: vi.fn().mockRejectedValue(new Error(`Invalid filter for ${EMAIL}`)),
      },
      queryLog: { create: vi.fn().mockResolvedValue({}) },
    };

    // execute() re-throws on EXECUTION_ERROR by design (queryExecutor.ts:187),
    // AFTER logging and after writing the QueryLog row — the log is what we assert.
    await expect(
      new QueryExecutor(prisma).execute(
        'user-1',
        'org-1',
        'raw question',
        'en',
        { intent: 'list_documents', outputFormat: 'table', confidence: 0.9, needsClarification: false } as any,
        { sourceTables: ['Document'], joins: [], filters: [], requiresClarification: false } as any
      )
    ).rejects.toThrow('Data Executor Failed');

    const out = captured();
    expect(out).toContain('[QueryExecutor ERROR]'); // sanity: the path ran
    expect(out).not.toContain(EMAIL);
    expect(out).toContain('[redacted-email]');
  });
});

// ── PART 3: applied at the vendor-error sites ──────────────────────────────
describe('PART 3 — vendor errors carrying a storage path do not leak the filename', () => {
  it('getSignedFileUrl: a Supabase error quoting the object key is redacted', async () => {
    createSignedUrl.mockResolvedValue({
      data: null,
      error: { name: 'StorageApiError', status: 404, message: `Object not found: ${STORAGE_PATH}` },
    });

    await expect(getSignedFileUrl(STORAGE_PATH)).rejects.toThrow('Failed to create signed URL');

    const out = captured();
    expect(out).not.toContain(FILENAME);
    expect(out).not.toContain('smitherton');
    expect(out).toContain('[redacted-path]');
    expect(out).toContain('status=404'); // signal kept
    expect(rawArgs().filter((a) => a !== null && typeof a === 'object')).toHaveLength(0);
  });

  it('uploadToSupabase: an upload error quoting the object key is redacted', async () => {
    storageUpload.mockResolvedValue({
      data: null,
      error: { name: 'StorageApiError', status: 409, message: `Duplicate: ${STORAGE_PATH}` },
    });

    const file: any = {
      originalname: 'CV Jonathan Q Smitherton.pdf',
      buffer: Buffer.from('pdf'),
      mimetype: 'application/pdf',
    };
    await expect(uploadToSupabase(file)).rejects.toThrow('Failed to upload file to Supabase');

    const out = captured();
    expect(out).not.toContain(FILENAME);
    expect(out).not.toContain('smitherton');
    expect(out).toContain('status=409');
    expect(rawArgs().filter((a) => a !== null && typeof a === 'object')).toHaveLength(0);
  });

  it('geminiAdapter: an SDK error quoting a filename is redacted, cause still classified', async () => {
    const adapter = new GeminiExtractionAdapter();
    (adapter as any).genAI = {
      getGenerativeModel: () => ({
        generateContent: async () => {
          throw new Error(`safety block while parsing ${FILENAME} at ${STORAGE_PATH}`);
        },
      }),
    };

    const result = await adapter.extractFromImage(Buffer.from('img'), 'image/jpeg');
    expect(result.overallConfidence).toBe(0.0); // sanity: the failure path ran

    const out = captured();
    expect(out).not.toContain(FILENAME);
    expect(out).not.toContain('smitherton');
    // The classification is derived BEFORE scrubbing, so it is unaffected.
    expect(out).toContain('FAILURE_CAUSE');
  });

  it('geminiAdapter.isSingleDocument: SDK error is projected, not dumped', async () => {
    const adapter = new GeminiExtractionAdapter();
    (adapter as any).genAI = {
      getGenerativeModel: () => ({
        generateContent: async () => {
          throw Object.assign(new Error(`fetch failed for ${STORAGE_PATH}`), { code: 'ENOTFOUND' });
        },
      }),
    };

    // Fail-open contract preserved.
    await expect(adapter.isSingleDocument(Buffer.from('img'), 'image/jpeg')).resolves.toBe(true);

    const out = captured();
    expect(out).not.toContain(FILENAME);
    expect(out).toContain('code=ENOTFOUND');
    expect(rawArgs().filter((a) => a !== null && typeof a === 'object')).toHaveLength(0);
  });
});
