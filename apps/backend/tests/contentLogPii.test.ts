import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// NEGATIVE CONTROLS — document contents must never reach stdout (item #3, B2)
// ============================================================================
// Every test here drives a real code path with PII-laden input and asserts on
// what was actually written to console.*. Before B2 these logs carried:
//
//   * the MERCHANT / TOTAL / DATE read off the user's receipt, in an ASCII box,
//     on EVERY successful scan (geminiAdapter);
//   * the raw Gemini response for the multi-document check (geminiAdapter);
//   * the entity name — which is a real PERSON's name when the scan is a
//     business card, since entityType ∈ VENDOR|CLIENT|PERSON|OTHER
//     (types/schemas.ts:16) — on every first sighting (entityResolution);
//   * the user-chosen FILENAME, at five sites (uploadController ×2,
//     supabaseStorage ×2, ingestionService) — note the storage PATH counts,
//     because it is built as `uploads/<ts>-<sanitized filename>` and the
//     sanitiser only lowercases/strips punctuation, so "CV John Smith.pdf"
//     survives inside it as "cv-john-smith.pdf";
//   * the user's raw natural-language QUESTION (intentParser).
//
// The assertions are deliberately written against the PII VALUES rather than
// against the new log strings: a future refactor is free to reword any line, and
// only regains a failure if it starts printing content again.
//
// Fully offline: no network, no DB, no Gemini, no Supabase. Every collaborator
// is a stub.
// ============================================================================

// The storage module throws at import time without Supabase env (supabaseStorage.ts:7-9),
// and constructs a client at module scope. Both are neutralised before import.
vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

const storageUpload = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => ({ upload: storageUpload }) } }),
}));

// Only uploadController pulls the shared client in; the other subjects here take
// their prisma as a constructor/parameter argument and are unaffected.
vi.mock('../src/prismaClient', () => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    document: { count: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from '../src/prismaClient';
import { UploadController } from '../src/controllers/uploadController';
import { IntentParserService } from '../src/services/query/intentParser';
import { EntityResolutionService } from '../src/services/normalization/entityResolution';
import { IngestionService } from '../src/services/ingestion/ingestionService';
import { GeminiExtractionAdapter } from '../src/services/extraction/geminiAdapter';
import { uploadToSupabase } from '../src/services/storage/supabaseStorage';

// The PII fixtures. Each is checked for by value, so any log line that starts
// carrying it again fails regardless of how the line is worded.
const PERSON_NAME = 'Jonathan Q Smitherton';
const MERCHANT = 'Carrefour Maarif';
const TOTAL = 412.5;
const DOC_DATE = '2026-03-14';
const FILENAME = 'CV Jonathan Q Smitherton.pdf';
// What sanitizeFileName() turns FILENAME into inside the storage path.
const FILENAME_IN_PATH = 'cv-jonathan-q-smitherton.pdf';
const QUESTION = 'combien ai-je dépensé chez Carrefour Maarif pour Jonathan Q Smitherton';

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

/** Everything written to stdout/stderr during the test, as one string. */
function captured(): string {
  return [logSpy, warnSpy, errorSpy]
    .flatMap((s) => (s.mock.calls as unknown[][]).map((c) => c.map(String).join(' ')))
    .join('\n');
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

// ── geminiAdapter: the extraction box (highest-volume site) ─────────────────
describe('geminiAdapter.extractFromImage — no document contents in stdout', () => {
  function adapterReturning(json: object) {
    const adapter = new GeminiExtractionAdapter();
    (adapter as any).genAI = {
      getGenerativeModel: () => ({
        generateContent: async () => ({ response: { text: () => JSON.stringify(json) } }),
      }),
    };
    return adapter;
  }

  it('logs neither the merchant, the total, nor the date', async () => {
    const adapter = adapterReturning({
      merchantName: MERCHANT,
      totalAmount: TOTAL,
      date: DOC_DATE,
      currency: 'MAD',
      documentType: 'Receipt',
      language: 'fr',
      rawText: `${MERCHANT} TOTAL ${TOTAL} MAD ${DOC_DATE}`,
      summary: `Receipt from ${MERCHANT}`,
    });

    const result = await adapter.extractFromImage(Buffer.from('img'), 'image/jpeg');

    // Sanity: the extraction really did carry the PII, so this is not vacuous.
    expect(result.entities.find((e) => e.name === MERCHANT)).toBeTruthy();

    const out = captured();
    expect(out).not.toContain(MERCHANT);
    expect(out).not.toContain('Carrefour');
    expect(out).not.toContain(String(TOTAL));
    expect(out).not.toContain(DOC_DATE);
    // The old box is gone entirely.
    expect(out).not.toContain('GEMINI AI EXTRACTION');
    expect(out).not.toContain('MERCHANT:');
  });

  it('still emits a useful non-PII extraction summary (signal kept, values dropped)', async () => {
    const adapter = adapterReturning({
      merchantName: MERCHANT,
      totalAmount: TOTAL,
      date: DOC_DATE,
      currency: 'MAD',
      documentType: 'Receipt',
    });

    await adapter.extractFromImage(Buffer.from('img'), 'image/jpeg');

    const out = captured();
    expect(out).toContain('Extraction complete');
    expect(out).toContain('hasMerchant=true');
    expect(out).toContain('hasTotal=true');
    expect(out).toContain('hasDate=true');
    expect(out).toContain('type=RECEIPT');
    expect(out).toContain('currency=MAD');
  });

  it('reports missing fields as booleans rather than going silent', async () => {
    const adapter = adapterReturning({ documentType: 'Other', totalAmount: null, date: null });
    await adapter.extractFromImage(Buffer.from('img'), 'image/jpeg');

    const out = captured();
    expect(out).toContain('hasMerchant=false');
    expect(out).toContain('hasTotal=false');
    expect(out).toContain('hasDate=false');
  });
});

// ── geminiAdapter: the raw multi-document response ──────────────────────────
describe('geminiAdapter.isSingleDocument — no raw model output in stdout', () => {
  it('does not echo the model response, which is unbounded text about the user document', async () => {
    // A deliberately chatty response: nothing constrains the model to YES/NO.
    const chatty = `NO — this is a single receipt from ${MERCHANT} totalling ${TOTAL}`;
    const adapter = new GeminiExtractionAdapter();
    (adapter as any).genAI = {
      getGenerativeModel: () => ({
        generateContent: async () => ({ response: { text: () => chatty } }),
      }),
    };

    await adapter.isSingleDocument(Buffer.from('img'), 'image/jpeg');

    const out = captured();
    expect(out).not.toContain(MERCHANT);
    expect(out).not.toContain('Carrefour');
    expect(out).not.toContain(chatty);
    expect(out).not.toContain('raw result');
    // The decision signal survives.
    expect(out).toContain('containsYes=false');
    expect(out).toContain('containsNo=true');
  });
});

// ── entityResolution: the person's name off a business card ────────────────
describe('entityResolution — no entity/person name in stdout', () => {
  it('logs the new entity id and type, never the name (PERSON = a real human)', async () => {
    const prisma: any = {
      entity: {
        findFirst: vi.fn().mockResolvedValue(null), // force the create branch
        create: vi.fn().mockResolvedValue({ id: 'ent-abc-123' }),
      },
    };
    const svc = new EntityResolutionService(prisma);

    await svc.resolveOrGenerateEntity('org-uuid-1', {
      name: PERSON_NAME,
      entityType: 'PERSON',
      role: 'Contact',
      sourceSpan: 'Business card',
      confidence: 0.99,
    } as any);

    // Sanity: the name really was written to the DB, so the path ran.
    expect(prisma.entity.create).toHaveBeenCalledTimes(1);
    expect(prisma.entity.create.mock.calls[0][0].data.displayName).toBe(PERSON_NAME);

    const out = captured();
    expect(out).not.toContain(PERSON_NAME);
    expect(out).not.toContain('Smitherton');
    // The canonical key is the same name mangled — it must not appear either.
    expect(out).not.toContain('JONATHAN');
    // Signal kept: id + type + org.
    expect(out).toContain('ent-abc-123');
    expect(out).toContain('type=PERSON');
  });

  it('logs nothing at all when the entity already exists (no new-entity line)', async () => {
    const prisma: any = {
      entity: {
        findFirst: vi.fn().mockResolvedValue({ id: 'ent-existing' }),
        create: vi.fn(),
      },
    };
    await new EntityResolutionService(prisma).resolveOrGenerateEntity('org-uuid-1', {
      name: PERSON_NAME,
      entityType: 'PERSON',
      role: 'Contact',
      sourceSpan: 'Business card',
      confidence: 0.99,
    } as any);

    expect(prisma.entity.create).not.toHaveBeenCalled();
    expect(captured()).not.toContain(PERSON_NAME);
  });
});

// ── ingestionService + supabaseStorage: the filename ───────────────────────
describe('ingestionService.processUploadAsync — no filename in stdout', () => {
  it('logs the documentId and file metadata, never the user-chosen filename', async () => {
    const svc = new IngestionService({} as any);
    (svc as any).geminiAdapter = {
      isSingleDocument: vi.fn().mockResolvedValue(false), // shortest path through
      extractFromImage: vi.fn(),
    };
    (svc as any).persistenceService = { markAsNeedsReview: vi.fn().mockResolvedValue(undefined) };

    await svc.processUploadAsync(
      'doc-1',
      'user-1',
      'org-1',
      Buffer.from('fake-image-bytes'),
      'application/pdf',
      FILENAME,
      `uploads/1700000000000-${FILENAME_IN_PATH}`
    );

    const out = captured();
    expect(out).not.toContain(FILENAME);
    expect(out).not.toContain('Smitherton');
    // Signal kept: the documentId every other line in this workflow keys on.
    expect(out).toContain('doc-1');
    expect(out).toContain('application/pdf');
  });
});

describe('uploadToSupabase — no filename and no storage path in stdout', () => {
  it('logs bucket + type + size only; the path embeds the filename so it is withheld', async () => {
    const storagePath = `uploads/1700000000000-${FILENAME_IN_PATH}`;
    storageUpload.mockResolvedValue({ data: { path: storagePath }, error: null });

    const file: any = {
      originalname: FILENAME,
      buffer: Buffer.from('pdf-bytes'),
      mimetype: 'application/pdf',
    };

    const returned = await uploadToSupabase(file);

    // Sanity: the path really does embed the sanitized name — that is the whole
    // reason logging it was a leak — and it is still RETURNED to the caller,
    // which persists it on the Document row. Only the LOG changed.
    expect(returned).toBe(storagePath);
    expect(storagePath).toContain(FILENAME_IN_PATH);

    const out = captured();
    expect(out).not.toContain(FILENAME);
    expect(out).not.toContain(FILENAME_IN_PATH);
    expect(out).not.toContain('smitherton');
    expect(out).not.toContain(storagePath);
    // Signal kept.
    expect(out).toContain('application/pdf');
  });
});

describe('UploadController.uploadDocument — no filename and no storage path in stdout', () => {
  it('logs type + size and the documentId, never the filename or the path', async () => {
    const storagePath = `uploads/1700000000000-${FILENAME_IN_PATH}`;
    (prisma.organization.findUnique as any).mockResolvedValue({ plan: 'PRO', scanCount: 1 });
    (prisma.document.count as any).mockResolvedValue(0);
    (prisma.document.create as any).mockResolvedValue({ id: 'doc-xyz' });
    storageUpload.mockResolvedValue({ data: { path: storagePath }, error: null });

    const req: any = {
      file: {
        originalname: FILENAME,
        buffer: Buffer.from('pdf-bytes'),
        mimetype: 'application/pdf',
        size: 9,
      },
      user: { id: 'user-1', organizationId: 'org-1' },
    };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    await UploadController.uploadDocument(req, res, vi.fn());

    // Sanity: the request really succeeded AND the filename really was persisted
    // to the DB row — only the LOG changed, not what we store.
    expect(res.status).toHaveBeenCalledWith(202);
    expect((prisma.document.create as any).mock.calls[0][0].data.originalFileName).toBe(FILENAME);

    const out = captured();
    expect(out).not.toContain(FILENAME);
    expect(out).not.toContain(FILENAME_IN_PATH);
    expect(out).not.toContain('Smitherton');
    expect(out).not.toContain('smitherton');
    expect(out).not.toContain(storagePath);
    // Signal kept: the documentId that makes log -> DB -> path lossless.
    expect(out).toContain('doc-xyz');
    expect(out).toContain('application/pdf');
  });
});

// ── intentParser: the user's raw question ──────────────────────────────────
describe('intentParser.parseUserQuery — no raw question text in stdout', () => {
  it('logs the resolved intent, never the sentence the user typed', async () => {
    const intent = await new IntentParserService().parseUserQuery(QUESTION, 'fr');

    // Sanity: the parser really did process this question.
    expect(intent.intent).toBe('sum_expenses');

    const out = captured();
    expect(out).not.toContain(QUESTION);
    expect(out).not.toContain(QUESTION.toLowerCase());
    expect(out).not.toContain('Carrefour');
    expect(out).not.toContain('Smitherton');
    expect(out).not.toContain('dépensé');
    // Signal kept — and it is strictly more useful than the raw sentence was.
    expect(out).toContain('intent=sum_expenses');
    expect(out).toContain(`length=${QUESTION.length}`);
    expect(out).toContain('confidence=');
  });

  it('logs the ambiguity decision for a too-short question without echoing it', async () => {
    await new IntentParserService().parseUserQuery('ok', 'en');
    const out = captured();
    expect(out).not.toMatch(/"ok"/);
    expect(out).toContain('clarify=true');
  });
});
