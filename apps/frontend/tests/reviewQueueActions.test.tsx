import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'queue-check@example.com' },
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
import { formatDateValue } from '../src/lib/formatCellValue';
import { documentService } from '../src/services/documentService';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ReviewQueueScreen } from '../src/screens/ReviewQueueScreen';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';

const QUEUE_DOCS = [
  { id: 'doc-1', originalFileName: 'receipt-alpha.jpg', status: 'NEEDS_REVIEW', overallConfidence: 0.8, date: '2026-06-01' },
  { id: 'doc-2', originalFileName: 'invoice-beta.pdf', status: 'NEEDS_REVIEW', overallConfidence: 0.95, date: '2026-06-02' },
];

const DETAIL_DOC = {
  id: 'doc-1',
  originalFileName: 'receipt-alpha.jpg',
  status: 'NEEDS_REVIEW',
  overallConfidence: 0.8,
  uploadedAt: '2026-06-01T10:00:00Z',
  summary: 'A receipt.',
  facts: [{ key: 'TOTAL_AMOUNT', valueString: '42.00', currency: 'USD', confidence: 0.95 }],
  entities: [],
};

let container: HTMLDivElement;
let root: Root;

const OutletStub = () => <Outlet context={{ onSuccess: () => {}, refreshCount: 0, onNewScan: () => {}, plan: 'FREE' as const }} />;

function mount(initialPath: string) {
  localStorage.setItem('lang', 'en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route element={<OutletStub />}>
                <Route path="/queue" element={<ReviewQueueScreen />} />
                <Route path="/documents/:id" element={<DocumentDetailScreen />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

function click(el: Element) {
  flushSync(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('Review queue — touch wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (documentService.getReviewQueue as any).mockResolvedValue([...QUEUE_DOCS]);
    (documentService.getDocumentDetail as any).mockResolvedValue({ ...DETAIL_DOC });
    (documentService.updateStatus as any).mockResolvedValue({});
    localStorage.clear();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('renders queue docs as cards with always-visible 44px actions (no hover-reveal)', async () => {
    mount('/queue');
    await vi.waitFor(() => expect(container.textContent).toContain('receipt-alpha.jpg'));

    // hover-reveal regression guard: nothing in the queue hides actions behind opacity-0
    expect(container.innerHTML).not.toContain('opacity-0');

    const approveButtons = container.querySelectorAll('button[aria-label^="Approve"]');
    // one per doc in the card list + one per doc in the desktop table
    expect(approveButtons.length).toBe(4);
    for (const btn of approveButtons) {
      expect(btn.className).toContain('min-h-[44px]');
    }
  });

  it('tapping a queue card navigates to the document detail', async () => {
    mount('/queue');
    await vi.waitFor(() => expect(container.textContent).toContain('receipt-alpha.jpg'));

    const card = container.querySelector('article[role="button"]')!;
    expect(card).toBeTruthy();
    click(card);

    await vi.waitFor(() => expect(documentService.getDocumentDetail).toHaveBeenCalledWith('doc-1'));
  });

  it('approve fires PATCH wiring and removes the card without navigating', async () => {
    mount('/queue');
    await vi.waitFor(() => expect(container.textContent).toContain('receipt-alpha.jpg'));

    click(container.querySelector('button[aria-label="Approve receipt-alpha.jpg"]')!);

    await vi.waitFor(() => expect(documentService.updateStatus).toHaveBeenCalledWith('doc-1', 'COMPLETED'));
    await vi.waitFor(() => expect(container.textContent).not.toContain('receipt-alpha.jpg'));
    // stopPropagation: the card tap must not have fired navigation
    expect(documentService.getDocumentDetail).not.toHaveBeenCalled();
    expect(container.textContent).toContain('invoice-beta.pdf');
  });

  it('reject fires PATCH wiring with REJECTED', async () => {
    mount('/queue');
    await vi.waitFor(() => expect(container.textContent).toContain('invoice-beta.pdf'));

    click(container.querySelector('button[aria-label="Reject invoice-beta.pdf"]')!);

    await vi.waitFor(() => expect(documentService.updateStatus).toHaveBeenCalledWith('doc-2', 'REJECTED'));
  });
});

// ============================================================================
// D4 data-correctness guards — the three real bugs the redesign fixes.
// Each asserts the screen reads the REAL DTO field and NEVER fabricates a value.
// ============================================================================
describe('Review queue — data correctness (D4 bug fixes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (documentService.updateStatus as any).mockResolvedValue({});
    localStorage.clear();
  });
  afterEach(() => { root.unmount(); container.remove(); });

  it('TYPE: renders the real documentType as a TRANSLATED label, never raw or a hardcoded "Invoice"', async () => {
    (documentService.getReviewQueue as any).mockResolvedValue([
      { id: 'd-type', originalFileName: 'scan.pdf', status: 'NEEDS_REVIEW', overallConfidence: 0.8, documentType: 'RECEIPT', uploadedAt: '2026-06-01T10:00:00Z' },
    ]);
    mount('/queue');
    await vi.waitFor(() => expect(container.textContent).toContain('scan.pdf'));
    // The real type is shown as its translated, sentence-case label...
    expect(container.textContent).toContain(strings.en.docTypeReceipt); // 'Receipt'
    // ...never the raw uppercase enum, and never the old 'Invoice' fallback.
    expect(container.textContent).not.toContain('RECEIPT');
    expect(container.textContent).not.toContain('Invoice');
  });

  it('TYPE: a known INVOICE type shows the translated label, not raw uppercase', async () => {
    (documentService.getReviewQueue as any).mockResolvedValue([
      { id: 'd-inv', originalFileName: 'scan.pdf', status: 'NEEDS_REVIEW', overallConfidence: 0.8, documentType: 'INVOICE', uploadedAt: '2026-06-01T10:00:00Z' },
    ]);
    mount('/queue');
    await vi.waitFor(() => expect(container.textContent).toContain('scan.pdf'));
    expect(container.textContent).toContain(strings.en.docTypeInvoice); // 'Invoice'
    expect(container.textContent).not.toContain('INVOICE'); // raw enum gone
  });

  it('TYPE: an unknown/free-form type falls back humanized, never raw uppercase', async () => {
    (documentService.getReviewQueue as any).mockResolvedValue([
      { id: 'd-po', originalFileName: 'scan.pdf', status: 'NEEDS_REVIEW', overallConfidence: 0.8, documentType: 'PURCHASE_ORDER', uploadedAt: '2026-06-01T10:00:00Z' },
    ]);
    mount('/queue');
    await vi.waitFor(() => expect(container.textContent).toContain('scan.pdf'));
    expect(container.textContent).toContain('Purchase order');
    expect(container.textContent).not.toContain('PURCHASE_ORDER');
  });

  it('TYPE: hides the type line entirely when documentType is null (no placeholder, no guess)', async () => {
    (documentService.getReviewQueue as any).mockResolvedValue([
      { id: 'd-notype', originalFileName: 'scan.pdf', status: 'NEEDS_REVIEW', overallConfidence: 0.8, documentType: null, uploadedAt: '2026-06-01T10:00:00Z' },
    ]);
    mount('/queue');
    await vi.waitFor(() => expect(container.textContent).toContain('scan.pdf'));
    expect(container.textContent).not.toContain('Invoice');
  });

  it('DATE: reads uploadedAt (not the non-existent doc.date), formatted', async () => {
    const uploadedAt = '2026-06-01T10:00:00Z';
    (documentService.getReviewQueue as any).mockResolvedValue([
      { id: 'd-date', originalFileName: 'scan.pdf', status: 'NEEDS_REVIEW', overallConfidence: 0.8, uploadedAt },
    ]);
    mount('/queue');
    await vi.waitFor(() => expect(container.textContent).toContain('scan.pdf'));
    // The date is now localized to the active app language via the shared
    // formatDateValue helper ("Jun 1, 2026"), not the browser-default numeric
    // toLocaleDateString(). Mount is 'en', so assert the en-localized form.
    expect(container.textContent).toContain(formatDateValue(uploadedAt, 'en')!);
  });

  it('DATE: a legacy doc.date (no uploadedAt) is NOT used and never fabricated', async () => {
    const legacy = '2020-01-15T10:00:00Z';
    (documentService.getReviewQueue as any).mockResolvedValue([
      // Only the dead `date` field, no uploadedAt: the old code showed this date.
      { id: 'd-legacy', originalFileName: 'scan.pdf', status: 'NEEDS_REVIEW', overallConfidence: 0.8, date: legacy },
    ]);
    mount('/queue');
    await vi.waitFor(() => expect(container.textContent).toContain('scan.pdf'));
    // The dead doc.date path must not resurface as a real date (in the new
    // localized format either)...
    expect(container.textContent).not.toContain(formatDateValue(legacy, 'en')!);
    // ...and a genuinely absent date shows the calm placeholder instead.
    expect(container.textContent).toContain(strings.en.notAvailable);
  });

  it('CONFIDENCE: no || 0.92 fabrication — a doc without confidence shows "not available", not 92%', async () => {
    (documentService.getReviewQueue as any).mockResolvedValue([
      { id: 'd-noconf', originalFileName: 'scan.pdf', status: 'NEEDS_REVIEW', uploadedAt: '2026-06-01T10:00:00Z' },
    ]);
    mount('/queue');
    await vi.waitFor(() => expect(container.textContent).toContain('scan.pdf'));
    expect(container.textContent).not.toContain('92%');
    expect(container.textContent).toContain(strings.en.notAvailable);
  });

  it('CONFIDENCE: a real confidence renders as its own percent + meter, distinct from the status', async () => {
    (documentService.getReviewQueue as any).mockResolvedValue([
      { id: 'd-conf', originalFileName: 'scan.pdf', status: 'NEEDS_REVIEW', overallConfidence: 0.83, uploadedAt: '2026-06-01T10:00:00Z' },
    ]);
    mount('/queue');
    await vi.waitFor(() => expect(container.textContent).toContain('scan.pdf'));
    // Confidence percent is present...
    expect(container.textContent).toContain('83%');
    // ...and the single status label appears exactly once per row surface
    // (mobile card + desktop row = 2), NOT duplicated by a second confidence-tier
    // label. Count leaf spans only (the status wrapper span also carries the text).
    const leaves = [...container.querySelectorAll('span')].filter(
      (n) => n.children.length === 0 && n.textContent?.trim() === strings.en.needsReview
    );
    expect(leaves.length).toBe(2);
  });
});

// ============================================================================
// D4 source guard — the touched queue screen is on --sa-* tokens: no raw palette
// literals, no dark: variants, no legacy classes, emoji-free, and per-value
// bidi-isolated with logical CSS. Mirrors the D3 detail source scan.
// ============================================================================
const readSrc = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('Review queue — touched source is on tokens, bidi-isolated (source scan)', () => {
  const src = readSrc('../src/screens/ReviewQueueScreen.tsx');

  const RAW_PALETTE = [
    'bg-white', 'dark:bg-slate', 'text-slate-', 'bg-slate-',
    'text-blue-', 'bg-blue-', 'text-emerald-', 'bg-emerald-',
    'text-red-', 'bg-red-', 'text-amber-', 'bg-amber-',
    'text-rose-', 'bg-rose-', 'dark:text-', 'dark:border-', 'dark:',
  ];
  const LEGACY = ['saas-table', 'saas-card', 'btn-primary', 'nav-item'];
  const EMOJI = ['✅', '⚠️', '🚩'];
  const LOUD = ['rounded-[32px]', 'rounded-3xl', 'rounded-2xl', 'shadow-2xl', 'font-black', 'tracking-widest', 'animate-pulse', 'group-hover:scale-110', 'group-hover:rotate-3'];

  it('no raw Tailwind palette literals / dark: variants', () => {
    for (const p of RAW_PALETTE) expect(src).not.toContain(p);
  });
  it('no legacy classes', () => {
    for (const c of LEGACY) expect(src).not.toContain(c);
  });
  it('no emoji', () => {
    for (const e of EMOJI) expect(src).not.toContain(e);
  });
  it('no loud/oversized vocabulary', () => {
    for (const l of LOUD) expect(src).not.toContain(l);
  });
  it('the dead Filter import and fabricated fallbacks are gone', () => {
    expect(src).not.toMatch(/\bFilter\b/);
    expect(src).not.toContain("'Invoice'");
    expect(src).not.toContain('|| 0.92');
    expect(src).not.toContain('doc.date');
    expect(src).not.toContain('doc.type');
  });
  it('reads the real DTO fields', () => {
    expect(src).toContain('doc.documentType');
    expect(src).toContain('doc.uploadedAt');
    expect(src).toContain('doc.overallConfidence');
  });
  it('surfaces vendor + amount via the shared search-card helpers', () => {
    expect(src).toContain('getVendor');
    expect(src).toContain('getAmount');
  });
  it('per-value bidi isolation + logical CSS present', () => {
    expect(src).toMatch(/dir="auto"/);
    expect(src).toContain('<bdi');
    expect(src).toContain('rtl:-scale-x-100');
    // logical spacing/alignment, no physical pl-/mr-/ml-auto/text-left/text-right
    expect(src).not.toMatch(/\bpl-\d/);
    expect(src).not.toMatch(/\bmr-\d/);
    expect(src).not.toContain('ml-auto');
    expect(src).not.toContain('text-left');
    expect(src).not.toContain('text-right');
  });
});

describe('Document detail — sticky review actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (documentService.getReviewQueue as any).mockResolvedValue([...QUEUE_DOCS]);
    (documentService.getDocumentDetail as any).mockResolvedValue({ ...DETAIL_DOC });
    (documentService.updateStatus as any).mockResolvedValue({});
    localStorage.clear();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('shows the sticky approve/reject bar for NEEDS_REVIEW docs and approve round-trips then returns to queue', async () => {
    mount('/documents/doc-1');
    await vi.waitFor(() => expect(container.textContent).toContain('receipt-alpha.jpg'));

    const approve = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Approve'
    )!;
    expect(approve).toBeTruthy();
    expect(approve.className).toContain('min-h-[44px]');

    click(approve);
    await vi.waitFor(() => expect(documentService.updateStatus).toHaveBeenCalledWith('doc-1', 'COMPLETED'));
    // navigated back to the queue screen
    await vi.waitFor(() => expect(documentService.getReviewQueue).toHaveBeenCalled());
  });

  it('hides the sticky bar for already-resolved documents', async () => {
    (documentService.getDocumentDetail as any).mockResolvedValue({ ...DETAIL_DOC, status: 'COMPLETED' });
    mount('/documents/doc-1');
    await vi.waitFor(() => expect(container.textContent).toContain('receipt-alpha.jpg'));

    const approve = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Approve'
    );
    expect(approve).toBeUndefined();
  });
});
