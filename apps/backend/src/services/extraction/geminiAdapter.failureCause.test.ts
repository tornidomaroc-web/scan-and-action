import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiExtractionAdapter } from './geminiAdapter';

// ============================================================================
// The adapter already knows WHY it failed. It just throws the answer away.
// ============================================================================
// extractFromImage catches its own error, derives a failureCause
// (PARSE_ERROR / OCR_FAILED / INTERNAL_ERROR) at :251-257, console.errors it,
// and then returns an empty result carrying no trace of it. Because it RETURNS
// rather than throws, ingestionService's catch never runs — the repo's own test
// calls that path ":85 ... (defensive: unreachable in production)" — so the
// extraction_error record defaulted to 'LowConfidence' for every failure.
//
// Confirmed on the first real production failure (document 24c3ea41,
// 2026-09-08): errorClass='LowConfidence' on a malformed .jpg that was plain
// text. That value asserts "the model succeeded and the document was poor",
// which is the opposite of what happened.
//
// KNOWN LIMIT, tested below so it is not mistaken for a bug later: the cause is
// derived by case-sensitive substring matching on the vendor's message. The SDK
// wraps transport failures as "Error fetching from …", so a 429 quota error
// lands in OCR_FAILED. This PR separates "vendor failed" from "poor document";
// it does NOT separate one vendor failure from another.
// ============================================================================

function makeAdapter(throws: Error) {
  const adapter = new GeminiExtractionAdapter();
  (adapter as any).genAI = {
    getGenerativeModel: () => ({ generateContent: async () => { throw throws; } }),
  };
  return adapter;
}

const run = (adapter: GeminiExtractionAdapter) =>
  adapter.extractFromImage(Buffer.from('not-an-image'), 'image/jpeg');

describe('extractFromImage surfaces its failureCause', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('PARSE_ERROR when the message names JSON', async () => {
    const r: any = await run(makeAdapter(new Error('Unexpected token in JSON at position 0')));
    expect(r.failureCause, 'the cause was computed and discarded').toBe('PARSE_ERROR');
  });

  it('OCR_FAILED when the message names fetch', async () => {
    const r: any = await run(makeAdapter(new Error('[GoogleGenerativeAI Error]: Error fetching from endpoint')));
    expect(r.failureCause).toBe('OCR_FAILED');
  });

  it('INTERNAL_ERROR when no keyword matches', async () => {
    const r: any = await run(makeAdapter(new Error('something else entirely')));
    expect(r.failureCause).toBe('INTERNAL_ERROR');
  });

  it('still returns the empty result shape alongside the cause', async () => {
    // The cause is ADDITIVE. Callers that ignore it must behave exactly as
    // before, or this becomes a behaviour change instead of an observability one.
    const r: any = await run(makeAdapter(new Error('boom')));
    expect(r.rawText).toBe('');
    expect(r.overallConfidence).toBe(0.0);
    expect(r.documentType).toBe('Unknown');
    expect(r.facts).toEqual([]);
    expect(r.entities).toEqual([]);
  });

  it('RESIDUAL LIMIT: a 429 mentioned only in the MESSAGE, with no status, still lands in OCR_FAILED', async () => {
    // The previous version of this test asserted this was true of ALL quota
    // errors. It is now true only of ones that arrive without a status — the
    // keyword path cannot see "429" because that string is not among its five
    // keywords, and "fetching" is. Kept so the remaining gap stays visible
    // rather than being rediscovered.
    const r: any = await run(makeAdapter(new Error('[GoogleGenerativeAI Error]: Error fetching from https://… [429] Resource exhausted')));
    expect(r.failureCause).toBe('OCR_FAILED');
  });
});

// ============================================================================
// The HTTP status is the precise answer, and the SDK already carries it.
// ============================================================================
// @google/generative-ai@0.24.1 declares
//   `class GoogleGenerativeAIFetchError extends GoogleGenerativeAIError`
//   with `status?: number` (generative-ai.d.ts:835-839).
//
// Until now the cause was guessed from case-sensitive substring matching on the
// message. The SDK wraps transport failures as "Error fetching from …", so a 429
// matched 'fetch' and was labelled OCR_FAILED — asserting the model failed to
// read an image it never received.
//
// That mattered beyond tidiness. The Gemini console reading (2026-09-08) found
// 429s clearly present, peaking near 40 in a day around late June / early July —
// but its error chart is PROJECT-level and stayed byte-identical when switching
// between keys, so it cannot attribute a 429 to a key, and both products share
// project gen-lang-client-0493028299. Correlation with volume is not
// attribution. This is what lets the record say 429 itself instead of us
// inferring it from a shared chart.
//
// The keyword path REMAINS, as the fallback for errors that carry no status.
// ============================================================================
function makeAdapterWithStatus(message: string, status: number) {
  return makeAdapter(Object.assign(new Error(message), { status }));
}

describe('failureCause prefers the HTTP status over keyword matching', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('429 is RATE_LIMITED — the whole point of reading the status', async () => {
    const r: any = await run(makeAdapterWithStatus('Resource has been exhausted', 429));
    expect(r.failureCause).toBe('RATE_LIMITED');
  });

  it.each([400, 401, 403, 404])('%d is CLIENT_ERROR', async status => {
    const r: any = await run(makeAdapterWithStatus('bad request', status));
    expect(r.failureCause).toBe('CLIENT_ERROR');
  });

  it.each([500, 502, 503])('%d is VENDOR_ERROR', async status => {
    const r: any = await run(makeAdapterWithStatus('upstream unavailable', status));
    expect(r.failureCause).toBe('VENDOR_ERROR');
  });

  it('the STATUS WINS over a conflicting keyword in the message', async () => {
    // The real shape: the SDK's own wrapper says "Error fetching from …" AND
    // carries status 429. Keyword-first would call this OCR_FAILED; that is the
    // exact misclassification being fixed, so the precedence is pinned.
    const r: any = await run(
      makeAdapterWithStatus('[GoogleGenerativeAI Error]: Error fetching from https://… [429]', 429)
    );
    expect(r.failureCause).toBe('RATE_LIMITED');
  });

  it('a 429 status beats a JSON keyword too — status is checked FIRST, not last', async () => {
    const r: any = await run(makeAdapterWithStatus('Unexpected token in JSON', 429));
    expect(r.failureCause).toBe('RATE_LIMITED');
  });

  it('CONTROL: a non-numeric status is ignored and the keyword path still runs', async () => {
    // Defensive: not every thrown value is an SDK error. A string status must
    // not be range-compared into a bogus bucket.
    const r: any = await run(makeAdapter(Object.assign(new Error('Error fetching from x'), { status: 'nope' })));
    expect(r.failureCause).toBe('OCR_FAILED');
  });

  it('CONTROL: a status outside 4xx/5xx falls through to the keyword path', async () => {
    const r: any = await run(makeAdapterWithStatus('Unexpected token in JSON', 200));
    expect(r.failureCause).toBe('PARSE_ERROR');
  });
});
