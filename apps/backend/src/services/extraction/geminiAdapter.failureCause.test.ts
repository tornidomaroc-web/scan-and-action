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

  it('KNOWN LIMIT: a quota error is classified OCR_FAILED, not as a rate limit', async () => {
    // Pinned deliberately. The SDK's transport wrapper contains "fetching", so
    // this is what the taxonomy does with a 429. Documented, not fixed here —
    // discriminating among vendor failures is out of scope for this PR.
    const r: any = await run(makeAdapter(new Error('[GoogleGenerativeAI Error]: Error fetching from https://… [429] Resource exhausted')));
    expect(r.failureCause).toBe('OCR_FAILED');
  });
});
