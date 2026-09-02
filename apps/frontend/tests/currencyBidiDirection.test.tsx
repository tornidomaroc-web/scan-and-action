import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// ============================================================================
// WHAT THIS GUARD CAN AND CANNOT SEE. Read this before trusting a green run.
// ============================================================================
// jsdom implements NO bidirectional algorithm and NO layout. It stores `dir` as
// an attribute and never resolves it. So the defect and the fix are literally
// indistinguishable to every assertion in this file:
//
//     "$US 42.07"  (wrong)   and   "42.07 US$"  (right)
//
// are the SAME DOM here — same text node, same characters, same order. Nothing
// below can see the sign on the wrong side of the letters. A screenshot round is
// the only instrument that can, and this file is not a substitute for it.
//
// What it CAN see, and does:
//   1. The `dir` attribute actually present on each of the four sites.
//   2. The ABSENCE of an isolate element inside them — the specific regression a
//      reviewer introduces in good faith, by "improving" a bare dir="ltr" into
//      the <bdi> idiom. That edit is invisible to every direction assertion,
//      which is why it gets an assertion of its own.
//   3. That the polymorphic Detail sites resolve direction PER VALUE: a currency
//      fact pins ltr, an Arabic string value stays auto. A static dir would be
//      actively wrong on the second, so this is the assertion that separates
//      "fixed" from "broke Arabic prose".
//   4. That factValueDir's precedence MIRRORS formatFactValue's. If they drift,
//      the direction is computed for a branch that did not produce the string.
//   5. The PRECONDITION of the defect in this environment's ICU — that the ar
//      currency string still begins with U+200F and ends with a neutral. If ICU
//      ever changes that, the premise of the fix moved and someone should know.
//   6. That the sites deliberately NOT swept still carry their original dir.
// ============================================================================

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'bidi@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../src/services/documentService', () => ({
  documentService: {
    getReviewQueue: vi.fn(),
    getDocumentDetail: vi.fn(),
    updateStatus: vi.fn(),
    getStats: vi.fn().mockResolvedValue({ totalCount: 0, pendingCount: 0, averageConfidence: 0 }),
  },
}));

import { strings } from '../src/i18n/strings';
import { documentService } from '../src/services/documentService';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ReviewQueueScreen } from '../src/screens/ReviewQueueScreen';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';
import { formatFactValue, factValueDir } from '../src/lib/searchResultCard';

const readSrc = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const s = strings.en;

let container: HTMLDivElement;
let root: Root;

const AMOUNT_FACT = { key: 'TOTAL_AMOUNT', valueNumber: 42.07, currency: 'USD', confidence: 0.97 };
const ARABIC_FACT = { key: 'vendor', valueString: 'شركة الفواتير', confidence: 0.95 };

// getAmount matches the fact key 'AMOUNT' exactly (searchResultCard.ts:81), so
// the queue fixture must use that key, not the Detail table's TOTAL_AMOUNT.
const QUEUE_AMOUNT_FACT = { key: 'AMOUNT', valueNumber: 42.07, currency: 'USD', confidence: 0.97 };

const queueRow = {
  id: 'q1',
  originalFileName: 'Invoice.pdf',
  status: 'NEEDS_REVIEW',
  uploadedAt: '2026-07-01T10:00:00Z',
  facts: [QUEUE_AMOUNT_FACT],
};
const detailDoc = {
  id: 'doc-9',
  originalFileName: 'Invoice.pdf',
  status: 'COMPLETED',
  uploadedAt: '2026-07-01T10:00:00Z',
  facts: [AMOUNT_FACT, ARABIC_FACT],
  entities: [],
};

const OutletStub = () => (
  <Outlet context={{ onSuccess: () => {}, refreshCount: 0, onNewScan: () => {}, plan: 'FREE' as const }} />
);

function mountQueue(lang: 'en' | 'ar' = 'ar') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/queue']}>
            <Routes>
              <Route element={<OutletStub />}>
                <Route path="/queue" element={<ReviewQueueScreen />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

function mountDetail(lang: 'en' | 'ar' = 'ar') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/documents/doc-9']}>
            <Routes>
              <Route element={<OutletStub />}>
                <Route path="/documents/:id" element={<DocumentDetailScreen />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

/** Elements whose text is the formatted amount — the sites under test. */
const amountEls = () =>
  [...container.querySelectorAll('[dir]')].filter((el) => /42[.,]07/.test(el.textContent ?? ''));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  (documentService.getStats as any).mockResolvedValue({ totalCount: 0, pendingCount: 0, averageConfidence: 0 });
});
afterEach(() => {
  vi.restoreAllMocks();
  root?.unmount();
  container?.remove();
  document.body.innerHTML = '';
});

// ── 5. THE PRECONDITION — is the defect's cause still present in this ICU? ───

describe('the premise: Intl ar currency still leads with U+200F and ends neutral', () => {
  it('ar/USD is exactly the byte sequence the Chrome measurement was made against', () => {
    const out = new Intl.NumberFormat('ar', { style: 'currency', currency: 'USD' }).format(42.07);
    const cps = [...out].map((c) => c.codePointAt(0)!);
    // 200f 34 32 2e 30 37 a0 55 53 24 — recorded in f18bd1e.
    expect(cps).toEqual([0x200f, 0x34, 0x32, 0x2e, 0x30, 0x37, 0xa0, 0x55, 0x53, 0x24]);
    expect(cps[0], 'the leading RLM is the whole reason dir="auto" resolves RTL').toBe(0x200f);
  });

  it('the affected currencies still end in LETTERS, and the safe ones still do not', () => {
    const fmt = (c: string) => new Intl.NumberFormat('ar', { style: 'currency', currency: c }).format(42.07);
    // Letters after the number -> reorderable -> affected.
    for (const c of ['USD', 'GBP', 'CAD', 'AUD']) {
      expect(/[A-Za-z]/.test(fmt(c)), `${c} was expected to carry letters`).toBe(true);
    }
    // A bare symbol has no letter run to land on the wrong side of.
    expect(/[A-Za-z]/.test(fmt('EUR'))).toBe(false);
  });
});

// ── 4. THE PREDICATE MIRRORS THE FORMATTER ──────────────────────────────────

describe('factValueDir mirrors formatFactValue precedence', () => {
  const lang = 'ar';
  it('a string value wins in BOTH, so it stays auto even when a number is present', () => {
    // The trap: a fact carrying both. formatFactValue returns the STRING, so
    // pinning ltr from the number would pin the wrong branch's direction.
    const fact = { valueString: 'شركة', valueNumber: 42.07, currency: 'USD' };
    expect(formatFactValue(fact, s as any, lang)).toBe('شركة');
    expect(factValueDir(fact)).toBe('auto');
  });

  it('a numeric value pins ltr', () => {
    expect(factValueDir(AMOUNT_FACT)).toBe('ltr');
    expect(formatFactValue(AMOUNT_FACT, s as any, lang)).toMatch(/42/);
  });

  it('an EMPTY string value falls through to the number in both', () => {
    const fact = { valueString: '', valueNumber: 42.07, currency: 'USD' };
    expect(formatFactValue(fact, s as any, lang)).toMatch(/42/);
    expect(factValueDir(fact)).toBe('ltr');
  });

  it('a date value stays auto — it is localized and may be Arabic', () => {
    expect(factValueDir({ valueDate: '2026-07-01T10:00:00Z' })).toBe('auto');
  });

  it('the placeholder stays auto', () => {
    expect(factValueDir({})).toBe('auto');
    expect(factValueDir(null)).toBe('auto');
  });
});

// ── 1 + 2. THE FOUR SITES: dir pinned, and NO isolate inside ────────────────

describe('Review Queue — both amount sites', () => {
  const mount = async () => {
    (documentService.getReviewQueue as any).mockResolvedValue([queueRow]);
    mountQueue('ar');
    await vi.waitFor(() => expect(amountEls().length).toBeGreaterThan(0));
    const els = amountEls();
    // Both branches render (mobile card + desktop table) in the same tree.
    expect(els.length, 'expected both queue amount sites').toBe(2);
    return els;
  };

  // DIRECTION and ISOLATE are separate tests ON PURPOSE. Bundling them would
  // hide the finding: the isolate regression leaves every direction assertion
  // GREEN, and only a test that looks for the element itself goes red.
  it('DIRECTION: both sites pin dir="ltr"', async () => {
    for (const el of await mount()) expect(el.getAttribute('dir')).toBe('ltr');
  });

  it('ISOLATE: neither site wraps the value in an isolate element', async () => {
    // <bdi> is an isolate with dir=auto: it re-runs the detection the pin
    // overrides and restores "$US 42.07" while dir="ltr" still reads correct.
    for (const el of await mount()) {
      expect(el.querySelector('bdi'), 'an isolate element came back inside the amount').toBeNull();
    }
  });
});

describe('Document Detail — both fact-value sites, per value', () => {
  const mountCurrency = async () => {
    (documentService.getDocumentDetail as any).mockResolvedValue(detailDoc);
    mountDetail('ar');
    await vi.waitFor(() => expect(amountEls().length).toBeGreaterThan(0));
    const els = amountEls();
    expect(els.length, 'expected both detail fact sites').toBe(2);
    return els;
  };

  it('DIRECTION: a CURRENCY fact pins ltr at both sites', async () => {
    for (const el of await mountCurrency()) expect(el.getAttribute('dir')).toBe('ltr');
  });

  it('ISOLATE: neither site wraps the currency value in an isolate element', async () => {
    for (const el of await mountCurrency()) {
      expect(el.querySelector('bdi'), 'an isolate element came back inside the amount').toBeNull();
    }
  });

  it('an ARABIC string value on the SAME elements stays auto', async () => {
    // The assertion that separates "fixed" from "broke Arabic prose". A static
    // dir="ltr" at these sites would pass the test above and fail this one.
    (documentService.getDocumentDetail as any).mockResolvedValue(detailDoc);
    mountDetail('ar');
    await vi.waitFor(() => expect(amountEls().length).toBeGreaterThan(0));

    const arabicEls = [...container.querySelectorAll('[dir]')].filter((el) =>
      (el.textContent ?? '').includes('شركة الفواتير')
    );
    expect(arabicEls.length, 'expected both detail fact sites to render the Arabic value').toBe(2);
    for (const el of arabicEls) {
      expect(el.getAttribute('dir')).toBe('auto');
    }
  });
});

// ── 6. WHAT WAS DELIBERATELY NOT SWEPT ──────────────────────────────────────

describe('the sweep stopped where it was supposed to', () => {
  const QUEUE = readSrc('../src/screens/ReviewQueueScreen.tsx');
  const DETAIL = readSrc('../src/screens/DocumentDetailScreen.tsx');
  const TABLE = readSrc('../src/components/ResultTable.tsx');

  it('the truncating name/vendor/type boxes keep dir="auto" — they hold Arabic text', () => {
    expect(QUEUE).toMatch(/truncate text-sm font-semibold text-ink" dir="auto">\{name\}/);
    expect(QUEUE.match(/dir="auto"/g)!.length).toBeGreaterThanOrEqual(4);
    expect(DETAIL).toMatch(/dir="auto"/);
  });

  it('ResultTable is UNTOUCHED — its mobile card is correct by having no isolate', () => {
    // Explicitly out of scope. Named here so a later sweep does not "finish the
    // job" by adding the idiom to the one site that never had it.
    expect(TABLE).not.toMatch(/<bdi>/);
  });

  it('no isolate element wraps a currency value anywhere in the two swept screens', () => {
    for (const src of [QUEUE, DETAIL]) {
      expect(src).not.toMatch(/<bdi>\{amount\}<\/bdi>/);
      expect(src).not.toMatch(/<bdi>\{factValue\(fact\)\}<\/bdi>/);
    }
  });
});
