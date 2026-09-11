import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// ============================================================================
// THE DETAIL SCREEN SHOWS ONLY FACTS A USER CAN READ, AND NEVER CONTRADICTS
// ITSELF.
// ============================================================================
// Reproduced from canary c176c0d5 (Arabic UI, status NEEDS_REVIEW), whose rows
// are copied verbatim below from production on 2026-09-11:
//
//   extraction_model      "models/gemini-3.5-flash -> gemini-3.5-flash"  100%
//   extraction_recovered  valueString NULL  -> rendered "Not available"  100%
//   category              "Other"                                        50%
//   decision              "APPROVED"
//   TOTAL_AMOUNT          84.80                                          99%
//   TRANSACTION_DATE      2018-01-01                                     99%
//
// Three internal keys rendered by their RAW ENGLISH KEY on an Arabic screen,
// one of them with an empty value and a confident-looking pill — and a green
// "Approved / No issues detected" banner sitting beside the status "Needs
// review".
//
// The table is rendered TWICE (DocumentDetailScreen: a stacked mobile list and
// a desktop <table>), and jsdom applies no Tailwind, so both are in the DOM.
// Asserting on the whole document's textContent would let a row that leaked
// into only ONE layout pass. Every assertion below is therefore scoped to a
// layout container, and every leak test runs against BOTH.
// ============================================================================

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'detail-check@example.com' },
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
    reextract: vi.fn(),
    getStats: vi.fn().mockResolvedValue({ totalCount: 0, pendingCount: 0, averageConfidence: 0 }),
  },
}));

import { strings } from '../src/i18n/strings';
import { documentService } from '../src/services/documentService';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';
import { FACT_LABEL_KEY, visibleDetailFacts, detailFactLabel } from '../src/lib/detailFacts';

// ── The canary, verbatim ────────────────────────────────────────────────────
const CANARY = {
  id: 'doc-canary',
  originalFileName: 'canary.jpg',
  status: 'NEEDS_REVIEW',
  overallConfidence: 0.99,
  uploadedAt: '2026-09-10T09:00:00Z',
  processedAt: '2026-09-10T09:00:20Z',
  documentType: 'UNKNOWN_DOCUMENT_TYPE',
  detectedLanguage: 'en',
  facts: [
    { key: 'category', factType: 'CATEGORY', valueString: 'Other', confidence: 0.5 },
    { key: 'decision', factType: 'RULE_RESULT', valueString: 'APPROVED', confidence: 1 },
    { key: 'extraction_model', factType: 'EXTRACTION_MODEL', valueString: 'models/gemini-3.5-flash -> gemini-3.5-flash', confidence: 1 },
    { key: 'extraction_recovered', factType: 'EXTRACTION_RECOVERED', valueString: null, confidence: 1 },
    { key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 84.8, currency: 'USD', confidence: 0.99 },
    { key: 'TRANSACTION_DATE', factType: 'DATE', valueDate: '2018-01-01T00:00:00.000Z', confidence: 0.99 },
  ],
  entities: [],
};

// A healthy document: COMPLETED, decision APPROVED, no rule fired.
const COMPLETED_APPROVED = {
  ...CANARY,
  id: 'doc-ok',
  originalFileName: 'clean.pdf',
  status: 'COMPLETED',
  facts: [
    { key: 'decision', factType: 'RULE_RESULT', valueString: 'APPROVED', confidence: 1 },
    { key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 12.5, currency: 'USD', confidence: 0.99 },
  ],
};

// A document carrying the USER's own facts plus a key invented after this file
// was written — the case an allowlist exists for.
const USER_AUTHORED = {
  ...CANARY,
  id: 'doc-user',
  originalFileName: 'corrected.pdf',
  status: 'NEEDS_REVIEW',
  facts: [
    { key: 'manual_amount', factType: 'AMOUNT', valueNumber: 41.2, currency: 'USD', confidence: 1 },
    { key: 'justification_note', factType: 'TEXT', valueString: 'Client dinner, approved by finance.', confidence: 1 },
    { key: 'TAX_AMOUNT', factType: 'AMOUNT', valueNumber: 3.4, currency: 'USD', confidence: 0.9 },
    { key: 'review_action', factType: 'TEXT', valueString: 'amount_corrected', confidence: 1 },
    // Not a key anyone has written. normalizeFactKey's fallback
    // (`rawKey.toUpperCase().replace(/\s+/g,'_')`) can mint one at any time.
    { key: 'SUPPLIER_TAX_ID', factType: 'TEXT', valueString: 'TAXID-99-ZZ', confidence: 1 },
  ],
};

const DOCS: Record<string, any> = {
  'doc-canary': CANARY,
  'doc-ok': COMPLETED_APPROVED,
  'doc-user': USER_AUTHORED,
};

let container: HTMLDivElement;
let root: Root;

const OutletStub = () => <Outlet context={{ onSuccess: () => {}, refreshCount: 0, onNewScan: () => {}, plan: 'FREE' as const }} />;

function mount(id: string, lang: 'en' | 'fr' | 'ar' = 'en') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/documents/${id}`]}>
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

const text = () => container.textContent ?? '';

// The two fact-table layouts, by the classes DocumentDetailScreen renders them
// with. Both must exist, or a "no leak" assertion could pass by querying a
// container that is not there.
const layouts = (): { mobile: HTMLElement; desktop: HTMLElement } => {
  const mobile = container.querySelector('.md\\:hidden') as HTMLElement | null;
  const desktop = container.querySelector('.hidden.md\\:block') as HTMLElement | null;
  expect(mobile, 'mobile fact list not found').not.toBeNull();
  expect(desktop, 'desktop fact table not found').not.toBeNull();
  return { mobile: mobile!, desktop: desktop! };
};

beforeEach(() => {
  vi.clearAllMocks();
  (documentService.getDocumentDetail as any).mockImplementation((id: string) =>
    Promise.resolve(DOCS[id] ?? CANARY)
  );
});
afterEach(() => { root.unmount(); container.remove(); });

// ── 1. THE CANARY, IN BOTH LAYOUTS ─────────────────────────────────────────
describe('the canary row renders no raw key, no empty value and no over-claim', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang.toUpperCase()}: no raw internal key appears in EITHER layout`, async () => {
      mount('doc-canary', lang);
      await vi.waitFor(() => expect(text()).toContain('canary.jpg'));
      const { mobile, desktop } = layouts();
      for (const [name, el] of [['mobile', mobile], ['desktop', desktop]] as const) {
        for (const raw of ['extraction_model', 'extraction_recovered', 'category', 'decision']) {
          expect(el.textContent, `${raw} leaked into ${name}`).not.toContain(raw);
        }
        // The model string itself, not just the key.
        expect(el.textContent, `model value leaked into ${name}`).not.toContain('gemini-3.5-flash');
      }
    });

    it(`${lang.toUpperCase()}: no "not available" row, in EITHER layout`, async () => {
      mount('doc-canary', lang);
      await vi.waitFor(() => expect(text()).toContain('canary.jpg'));
      const { mobile, desktop } = layouts();
      // extraction_recovered had all three value columns null, so formatFactValue
      // returned s.notAvailable. With the row gone, the placeholder goes with it.
      expect(mobile.textContent).not.toContain(strings[lang].notAvailable);
      expect(desktop.textContent).not.toContain(strings[lang].notAvailable);
    });

    it(`${lang.toUpperCase()}: the two real facts DO still render, in BOTH layouts`, async () => {
      mount('doc-canary', lang);
      await vi.waitFor(() => expect(text()).toContain('canary.jpg'));
      const { mobile, desktop } = layouts();
      // The positive half. Without it, every assertion above would pass against a
      // screen that renders no facts at all.
      for (const el of [mobile, desktop]) {
        expect(el.textContent).toContain(strings[lang].totalAmount);
        expect(el.textContent).toContain(strings[lang].transactionDate);
        expect(el.textContent).toContain('84.8');
      }
    });

    it(`${lang.toUpperCase()}: the banner does not claim "no issues" beside Needs review`, async () => {
      mount('doc-canary', lang);
      await vi.waitFor(() => expect(text()).toContain('canary.jpg'));
      // The status is NEEDS_REVIEW and the decision is APPROVED. Both are true;
      // the copy must say how, not assert a verification that never ran.
      expect(text()).toContain(strings[lang].decisionApprovedNeedsReviewDesc);
      expect(text()).not.toContain(strings[lang].decisionApprovedDesc);
      // And the old over-claim is gone from the shipped catalog entirely.
      expect(strings[lang].decisionApprovedDesc).not.toBe('No issues detected.');
    });
  }
});

// ── 2. A COMPLETED + APPROVED DOCUMENT KEEPS ITS BANNER ────────────────────
describe('a COMPLETED + APPROVED document still shows its approved banner', () => {
  it('renders the approved title and the unqualified scoped subtitle', async () => {
    mount('doc-ok', 'en');
    await vi.waitFor(() => expect(text()).toContain('clean.pdf'));
    expect(text()).toContain(strings.en.statusApproved);
    expect(text()).toContain(strings.en.decisionApprovedDesc);
    // The needs-review qualification belongs only to a NEEDS_REVIEW row.
    expect(text()).not.toContain(strings.en.decisionApprovedNeedsReviewDesc);
  });
});

// ── 3. AN UNKNOWN KEY DOES NOT RENDER; USER-AUTHORED FACTS DO ──────────────
describe('a fact key nobody anticipated renders nowhere', () => {
  it('hides SUPPLIER_TAX_ID and review_action in BOTH layouts, and keeps the user\'s own facts', async () => {
    mount('doc-user', 'en');
    await vi.waitFor(() => expect(text()).toContain('corrected.pdf'));
    const { mobile, desktop } = layouts();
    for (const el of [mobile, desktop]) {
      // Fails closed: neither the key nor its value reaches the screen.
      expect(el.textContent).not.toContain('SUPPLIER_TAX_ID');
      expect(el.textContent).not.toContain('TAXID-99-ZZ');
      expect(el.textContent).not.toContain('review_action');
      expect(el.textContent).not.toContain('amount_corrected');
      // The positive half: what the USER themselves entered is still shown,
      // labelled, so "hide by default" has not swallowed their own work.
      expect(el.textContent).toContain(strings.en.correctedAmount);
      expect(el.textContent).toContain(strings.en.reviewNote);
      expect(el.textContent).toContain('Client dinner, approved by finance.');
      expect(el.textContent).toContain(strings.en.taxAmount);
    }
  });
});

// ── 4. THE ALLOWLIST ITSELF ────────────────────────────────────────────────
describe('detailFacts fails closed', () => {
  const s = strings.en as Record<string, string>;

  it('every key that exists in production is either allowlisted or hidden, deliberately', () => {
    // The full production census, 2026-09-11. Listing it here means a key that
    // appears later is an EXPLICIT decision rather than a silent default.
    const HIDDEN = [
      'decision', 'decision_reason', 'category', 'extraction_model',
      'extraction_error', 'review_action', 'extraction_recovered',
    ];
    const SHOWN = ['TOTAL_AMOUNT', 'TRANSACTION_DATE', 'TAX_AMOUNT', 'manual_amount', 'justification_note'];
    for (const k of HIDDEN) expect(detailFactLabel(k, s), `${k} must be hidden`).toBeNull();
    for (const k of SHOWN) expect(detailFactLabel(k, s), `${k} must be shown`).toBeTruthy();
    expect(Object.keys(FACT_LABEL_KEY).sort()).toEqual([...SHOWN].sort());
  });

  it('an unknown key, a blank key and a non-string key all resolve to null', () => {
    for (const k of ['SUPPLIER_TAX_ID', 'totally_new', '', 'TOTAL_AMOUNT ', 'total_amount']) {
      expect(detailFactLabel(k, s)).toBeNull();
    }
    expect(detailFactLabel(undefined, s)).toBeNull();
    expect(detailFactLabel(null, s)).toBeNull();
    expect(detailFactLabel(42, s)).toBeNull();
  });

  it('visibleDetailFacts drops unknown keys and preserves order of the rest', () => {
    const out = visibleDetailFacts(
      [{ key: 'extraction_model' }, { key: 'TOTAL_AMOUNT' }, { key: 'zzz' }, { key: 'TRANSACTION_DATE' }],
      s
    );
    expect(out.map((f) => f.key)).toEqual(['TOTAL_AMOUNT', 'TRANSACTION_DATE']);
    expect(visibleDetailFacts(null, s)).toEqual([]);
    expect(visibleDetailFacts(undefined, s)).toEqual([]);
    expect(visibleDetailFacts([{}, { key: undefined }] as any, s)).toEqual([]);
  });

  it('every allowlisted label, and both banner strings, exist in EN, FR and AR', () => {
    // This is what makes the filter locale-INDEPENDENT: detailFactLabel returns
    // null when a locale lacks the string, which would hide a row for Arabic
    // users only. Proving parity here is what keeps that branch unreachable.
    for (const loc of ['en', 'fr', 'ar'] as const) {
      const L = strings[loc] as Record<string, string>;
      for (const labelKey of Object.values(FACT_LABEL_KEY)) {
        expect(typeof L[labelKey], `${loc}.${labelKey}`).toBe('string');
        expect(L[labelKey].length, `${loc}.${labelKey}`).toBeGreaterThan(0);
      }
      for (const k of ['decisionApprovedDesc', 'decisionApprovedNeedsReviewDesc']) {
        expect(typeof L[k], `${loc}.${k}`).toBe('string');
        expect(L[k].length, `${loc}.${k}`).toBeGreaterThan(0);
      }
      // FR and AR must not be the English text (a copy-paste placeholder).
      if (loc !== 'en') {
        for (const k of ['taxAmount', 'correctedAmount', 'reviewNote', 'decisionApprovedDesc', 'decisionApprovedNeedsReviewDesc']) {
          expect(L[k], `${loc}.${k} is still English`).not.toBe((strings.en as Record<string, string>)[k]);
        }
      }
    }
  });
});
