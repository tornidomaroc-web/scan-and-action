import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiExtractionAdapter } from './geminiAdapter';

// ============================================================================
// The model id must be INJECTABLE at both call sites, and the RESOLVED version
// must come back so the pin is verifiable from the process.
// ============================================================================
// Both sites hardcode "models/gemini-flash-latest" today — geminiAdapter.ts:51
// (isSingleDocument) and :137 (extractFromImage). Validation uses it too, so
// pinning only the extraction call would leave a third of the traffic on the
// alias and silently contaminate the arm.
//
// WHY THE RESOLVED VERSION MATTERS. ListModels on 2026-09-08 lists
// models/gemini-flash-latest with version "Gemini Flash Latest" — a placeholder,
// not a resolution. The alias does NOT disclose what it points at through the
// model listing. The only thing that can is the response itself.
//
// The SDK is proven not to strip it: generateContent does
//   const responseJson = await response.json();
//   const enhancedResponse = addHelpers(responseJson);
// (dist/index.js:866-873) and addHelpers MUTATES that parsed object in place
// and returns it (:478-495). Every field the API sends survives.
//
// But GenerateContentResponse (generative-ai.d.ts:643-650) declares only
// candidates / promptFeedback / usageMetadata. modelVersion is UNTYPED, and
// nothing here proves the API populates it. So it is read defensively and its
// ABSENCE is recorded as a value rather than crashing or being mistaken for a
// pin that did not take. A pin nobody can read is not a pin — and neither is
// one whose reading is silently undefined.
// ============================================================================

const VALID = {
  documentType: 'invoice',
  language: 'en',
  date: '2026-09-08',
  totalAmount: 12.5,
  taxAmount: 0,
  currency: 'USD',
  merchant: 'Test Merchant',
  rawText: 'total 12.50',
  confidence: 0.95,
};

/**
 * Captures what model id the adapter asked the SDK for, and lets the test
 * decide what the response object carries.
 */
function makeAdapter(opts: { responseExtras?: Record<string, unknown>; throws?: Error } = {}) {
  const adapter = new GeminiExtractionAdapter();
  const seen: string[] = [];
  (adapter as any).genAI = {
    getGenerativeModel: (cfg: any) => {
      seen.push(cfg.model);
      return {
        generateContent: async () => {
          if (opts.throws) throw opts.throws;
          return {
            response: Object.assign(
              { text: () => JSON.stringify(VALID) },
              opts.responseExtras ?? {}
            ),
          };
        },
      };
    },
  };
  return { adapter, seen };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('extractFromImage accepts an injected model id (geminiAdapter.ts:137)', () => {
  it('uses the injected model id instead of the floating alias', async () => {
    const { adapter, seen } = makeAdapter({ responseExtras: { modelVersion: 'gemini-2.5-flash-001' } });
    await adapter.extractFromImage(Buffer.from('x'), 'image/jpeg', 'models/gemini-2.5-flash');
    expect(seen).toContain('models/gemini-2.5-flash');
    expect(seen).not.toContain('models/gemini-flash-latest');
  });

  it('falls back to the PINNED model — never the alias — when nothing is injected', async () => {
    // Inverted deliberately. The A/B (n=10, interleaved, one window) came back
    // pinned 6/6 vs alias 0/4, every alias call RATE_LIMITED, Fisher 0.005. An
    // un-injected call is the production path, and it must not reach the alias.
    const { adapter, seen } = makeAdapter({ responseExtras: { modelVersion: 'whatever' } });
    await adapter.extractFromImage(Buffer.from('x'), 'image/jpeg');
    expect(seen).toContain('models/gemini-2.5-flash');
    expect(seen).not.toContain('models/gemini-flash-latest');
  });
});

describe('isSingleDocument accepts an injected model id (geminiAdapter.ts:51)', () => {
  it('uses the injected model id for the VALIDATION call too', async () => {
    const adapter = new GeminiExtractionAdapter();
    const seen: string[] = [];
    (adapter as any).genAI = {
      getGenerativeModel: (cfg: any) => {
        seen.push(cfg.model);
        return { generateContent: async () => ({ response: { text: () => 'SINGLE' } }) };
      },
    };
    await adapter.isSingleDocument(Buffer.from('x'), 'image/jpeg', 'models/gemini-2.5-flash');
    expect(seen).toEqual(['models/gemini-2.5-flash']);
  });

  it('falls back to the PINNED model for validation too', async () => {
    const adapter = new GeminiExtractionAdapter();
    const seen: string[] = [];
    (adapter as any).genAI = {
      getGenerativeModel: (cfg: any) => {
        seen.push(cfg.model);
        return { generateContent: async () => ({ response: { text: () => 'SINGLE' } }) };
      },
    };
    await adapter.isSingleDocument(Buffer.from('x'), 'image/jpeg');
    expect(seen).toEqual(['models/gemini-2.5-flash']);
  });
});

describe('the resolved modelVersion is surfaced, present or not', () => {
  it('carries the response modelVersion back to the caller', async () => {
    const { adapter } = makeAdapter({ responseExtras: { modelVersion: 'gemini-2.5-flash-001' } });
    const r: any = await adapter.extractFromImage(Buffer.from('x'), 'image/jpeg', 'models/gemini-2.5-flash');
    expect(r.modelVersion).toBe('gemini-2.5-flash-001');
  });

  it('reports ABSENCE explicitly when the API sends no modelVersion', async () => {
    // Not hypothetical: the field is undeclared in the SDK types and unproven
    // against the live API. Absence must be a readable value, not undefined.
    const { adapter } = makeAdapter({ responseExtras: {} });
    const r: any = await adapter.extractFromImage(Buffer.from('x'), 'image/jpeg', 'models/gemini-2.5-flash');
    expect(r.modelVersion).toBe('unavailable');
  });

  it('ignores a non-string modelVersion rather than recording a bogus one', async () => {
    const { adapter } = makeAdapter({ responseExtras: { modelVersion: 42 } });
    const r: any = await adapter.extractFromImage(Buffer.from('x'), 'image/jpeg', 'models/gemini-2.5-flash');
    expect(r.modelVersion).toBe('unavailable');
  });

  it('a FAILED call reports no resolved version but still returns its failureCause', async () => {
    const err: any = new Error('Error fetching from https://generativelanguage.googleapis.com/');
    err.status = 503;
    const { adapter } = makeAdapter({ throws: err });
    const r: any = await adapter.extractFromImage(Buffer.from('x'), 'image/jpeg', 'models/gemini-2.5-flash');
    expect(r.failureCause).toBe('VENDOR_ERROR');
    expect(r.modelVersion).toBe('unavailable');
  });
});

describe('REGRESSION: #193 classification is untouched by the pin', () => {
  const cases: Array<[number | undefined, string]> = [
    [429, 'RATE_LIMITED'],
    [400, 'CLIENT_ERROR'],
    [503, 'VENDOR_ERROR'],
  ];
  for (const [status, expected] of cases) {
    it(`status ${status} still classifies as ${expected} when a model is injected`, async () => {
      const err: any = new Error('Error fetching from vendor');
      if (status !== undefined) err.status = status;
      const { adapter } = makeAdapter({ throws: err });
      const r: any = await adapter.extractFromImage(Buffer.from('x'), 'image/jpeg', 'models/gemini-2.5-flash');
      expect(r.failureCause).toBe(expected);
    });
  }
});
