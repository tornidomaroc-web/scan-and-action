import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// ============================================================================
// Document detail restyle (PR-D3) — behavioral + copy + token guards
// ============================================================================
// Verifies the File Detail page after its restyle onto the --sa-* token system:
//   - the previously-hardcoded English strings are now real i18n keys (3 locales),
//   - the meta-grid status is reconciled with the Search card (getStatus) so it
//     reads the TRANSLATED label + dot, never the raw enum,
//   - no emoji and no raw Tailwind palette / legacy classes remain in the touched
//     source files,
//   - mixed-direction values are bidi-isolated (dir/bdi) for Arabic RTL,
//   - the shared components still render the Review Queue correctly.
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
    getStats: vi.fn().mockResolvedValue({ totalCount: 0, pendingCount: 0, averageConfidence: 0 }),
  },
}));

import { strings } from '../src/i18n/strings';
import { documentService } from '../src/services/documentService';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';
import { ReviewQueueScreen } from '../src/screens/ReviewQueueScreen';
import { FixActionPanel } from '../src/components/FixActionPanel';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

let container: HTMLDivElement;
let root: Root;

const OutletStub = () => <Outlet context={{ onSuccess: () => {}, refreshCount: 0, onNewScan: () => {}, plan: 'FREE' as const }} />;

function mount(initialPath: string, lang: 'en' | 'fr' | 'ar' = 'en') {
  localStorage.setItem('lang', lang);
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

const text = () => container.textContent ?? '';

const COMPLETED_DOC = {
  id: 'doc-9',
  originalFileName: 'facture-2026.pdf',
  status: 'COMPLETED',
  overallConfidence: 0.96,
  uploadedAt: '2026-06-01T10:00:00Z',
  documentType: 'INVOICE',
  detectedLanguage: 'ar',
  summary: 'Quarterly retainer invoice.',
  facts: [{ key: 'TOTAL_AMOUNT', valueNumber: 4280, currency: 'MAD', confidence: 0.97 }],
  entities: [{ role: 'VENDOR', name: 'Aurora Studios' }],
};

// ── New i18n keys the restyle introduced ──────────────────────────────────
const NEW_KEYS = [
  'toastApproved', 'toastRejected', 'toastUpdateError', 'previewUnavailable',
  'openOriginalSource', 'decisionApprovedDesc', 'decisionFlaggedDesc',
  'fixMarkValid', 'fixSaveNote', 'fixProcessing', 'fixFlaggedDesc',
  'fixErrorAmount', 'fixErrorJustification', 'madUnit',
] as const;

describe('Detail restyle — i18n key parity for the new keys', () => {
  for (const loc of ['en', 'fr', 'ar'] as const) {
    for (const key of NEW_KEYS) {
      it(`strings.${loc}.${key} exists and is non-empty`, () => {
        const v = (strings[loc] as Record<string, unknown>)[key];
        expect(typeof v).toBe('string');
        expect((v as string).length).toBeGreaterThan(0);
      });
    }
  }
});

describe('Detail restyle — status reconciled with the Search card (no raw enum)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (documentService.getDocumentDetail as any).mockResolvedValue({ ...COMPLETED_DOC });
  });
  afterEach(() => { root.unmount(); container.remove(); });

  it('EN: renders the translated status label (Processed), never the COMPLETED enum', async () => {
    mount('/documents/doc-9', 'en');
    await vi.waitFor(() => expect(text()).toContain('facture-2026.pdf'));
    expect(text()).toContain(strings.en.statusProcessed);
    expect(text()).not.toContain('COMPLETED');
  });

  it('AR: renders the Arabic status label, matching the card vocabulary', async () => {
    mount('/documents/doc-9', 'ar');
    await vi.waitFor(() => expect(text()).toContain('facture-2026.pdf'));
    expect(text()).toContain(strings.ar.statusProcessed);
    expect(text()).not.toContain('COMPLETED');
  });

  it('renders no emoji (calm dots + labels only)', async () => {
    mount('/documents/doc-9', 'en');
    await vi.waitFor(() => expect(text()).toContain('facture-2026.pdf'));
    for (const emoji of ['✅', '⚠️', '🚩']) {
      expect(text()).not.toContain(emoji);
    }
  });
});

describe('Detail restyle — Review Queue still renders with the token components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (documentService.getReviewQueue as any).mockResolvedValue([
      { id: 'q-1', originalFileName: 'receipt-alpha.jpg', status: 'NEEDS_REVIEW', overallConfidence: 0.8, date: '2026-06-01' },
    ]);
  });
  afterEach(() => { root.unmount(); container.remove(); });

  it('mounts the queue and shows the doc with the single status-dot label without crashing', async () => {
    mount('/queue', 'en');
    await vi.waitFor(() => expect(text()).toContain('receipt-alpha.jpg'));
    // D4 dropped ReviewBadge from the queue (to remove the double "needs review").
    // The single warning-dot status now carries the translated label. No emoji.
    expect(text()).toContain(strings.en.needsReview);
    for (const emoji of ['✅', '⚠️', '🚩']) {
      expect(text()).not.toContain(emoji);
    }
  });
});

// ── FIX 1 (PR-D3 follow-up): the MAD unit is a flex-sibling addon inside an
//    LTR input-group, NOT an absolute overlay that can sit on top of the digits.
describe('Detail restyle — MAD correction input is a non-overlapping input-group', () => {
  function mountPanel() {
    localStorage.setItem('lang', 'ar'); // exercise the RTL locale where the overlap bit
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => {
      root.render(
        <LanguageProvider>
          <FixActionPanel documentId="doc-1" decision="NEEDS_REVIEW" reason="missing amount" onSuccess={() => {}} />
        </LanguageProvider>
      );
    });
  }
  afterEach(() => { root.unmount(); container.remove(); });

  it('renders the unit as an LTR sibling addon of the input, not an absolute overlay', () => {
    mountPanel();
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const group = input.parentElement as HTMLElement;
    // The group is forced LTR so digits + unit read left-to-right in Arabic too.
    expect(group.getAttribute('dir')).toBe('ltr');
    // Border + focus ring moved onto the wrapper.
    expect(group.className).toContain('focus-within:');
    // The unit is a following sibling carrying the MAD label, and it is NOT an
    // absolutely-positioned overlay (which is what let it hide behind the value).
    const unit = group.querySelector('span') as HTMLElement;
    expect(unit.textContent).toContain(strings.ar.madUnit);
    expect(unit.className).not.toContain('absolute');
    // The old overlay reserved space with pe-16 on the input; that is gone.
    expect(input.className).not.toContain('pe-16');
    expect(input.className).not.toContain('border');
  });
});

// ── Source-level guards: no raw palette / legacy classes / emoji remain, and
//    bidi isolation is present in the detail source. ────────────────────────
describe('Detail restyle — touched source is on tokens, bidi-isolated (source scan)', () => {
  const files = {
    screen: read('../src/screens/DocumentDetailScreen.tsx'),
    banner: read('../src/components/DecisionBanner.tsx'),
    fix: read('../src/components/FixActionPanel.tsx'),
    shared: read('../src/components/SharedComponents.tsx'),
  };

  const RAW_PALETTE = [
    'bg-white', 'dark:bg-slate', 'text-slate-', 'bg-slate-',
    'text-blue-', 'bg-blue-', 'text-emerald-', 'bg-emerald-',
    'text-red-', 'bg-red-', 'text-amber-', 'bg-amber-',
    'text-rose-', 'bg-rose-', 'dark:text-', 'dark:border-',
  ];
  const LEGACY = ['btn-primary', 'saas-card', 'saas-table', 'nav-item'];
  const EMOJI = ['✅', '⚠️', '🚩'];

  for (const [name, src] of Object.entries(files)) {
    it(`${name}: no raw Tailwind palette literals`, () => {
      for (const p of RAW_PALETTE) expect(src).not.toContain(p);
    });
    it(`${name}: no legacy classes`, () => {
      for (const c of LEGACY) expect(src).not.toContain(c);
    });
    it(`${name}: no emoji`, () => {
      for (const e of EMOJI) expect(src).not.toContain(e);
    });
    it(`${name}: no rounded-[40px]/[32px] mega-card or font-black`, () => {
      expect(src).not.toContain('rounded-[40px]');
      expect(src).not.toContain('rounded-[32px]');
      expect(src).not.toContain('font-black');
    });
  }

  it('detail screen bidi-isolates mixed-direction values (dir/bdi present)', () => {
    expect(files.screen).toMatch(/dir="auto"/);
    expect(files.screen).toContain('<bdi');
    // The back-arrow icon flips in RTL (logical, not a literal arrow char).
    expect(files.screen).toContain('rtl:-scale-x-100');
  });

  // FIX 2: the title wrapper is bounded in the mobile column layout so the
  // existing truncate can ellipsize a long file name inside the card.
  it('title wrapper is width-bounded on mobile (self-stretch) with truncate kept', () => {
    expect(files.screen).toContain('min-w-0 self-stretch');
    expect(files.screen).toContain('truncate text-title-lg');
    // The main card was NOT given overflow-hidden as a shortcut.
    expect(files.screen).toContain('rounded-card border border-line bg-surface-raised p-5 shadow-card md:p-8');
  });

  // FIX 3: entity chip names are capped + truncated so a long vendor name
  // ellipsizes instead of pushing the layout (bidi kept).
  it('entity chip name is capped and truncated', () => {
    expect(files.screen).toContain('max-w-[12rem] truncate');
  });
});
