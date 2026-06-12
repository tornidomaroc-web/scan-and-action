import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
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
