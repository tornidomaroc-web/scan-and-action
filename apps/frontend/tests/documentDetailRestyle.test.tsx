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
import { formatDateValue } from '../src/lib/formatCellValue';
import { documentService } from '../src/services/documentService';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';
import { ChartPlaceholder } from '../src/components/SharedComponents';
import { ReviewQueueScreen } from '../src/screens/ReviewQueueScreen';
import { FixActionPanel } from '../src/components/FixActionPanel';
import { translateDecisionReasons } from '../src/components/DecisionBanner';

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

// A NEEDS_REVIEW document carrying the data that the D4-review follow-ups fix:
//   - a date fact (raw ISO valueDate) that must render localized,
//   - the rule-engine decision + decision_reason facts that must be FILTERED out
//     of the Extracted Facts table (they are surfaced by the DecisionBanner),
//   - a Latin entity with a raw VENDOR role that must render translated.
const NEEDS_REVIEW_DOC = {
  id: 'doc-nr',
  originalFileName: 'facture-fevrier.pdf',
  status: 'NEEDS_REVIEW',
  overallConfidence: 0.71,
  uploadedAt: '2026-06-02T09:00:00Z',
  documentType: 'INVOICE',
  detectedLanguage: 'ar',
  facts: [
    { key: 'TRANSACTION_DATE', valueDate: '2026-02-08T00:00:00.000Z', confidence: 0.95 },
    { key: 'decision', valueString: 'NEEDS_REVIEW', confidence: 1 },
    { key: 'decision_reason', valueString: 'Missing amount', confidence: 1 },
  ],
  entities: [{ role: 'VENDOR', name: 'ELECTRICITE MARRAKECH SAFI SA' }],
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

// ── Item D (SITE a): the meta-grid upload date is localized to the APP language
//    via the shared formatDateValue helper, not the browser default. ──────────
describe('Detail — meta-grid upload date is localized to the app language', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (documentService.getDocumentDetail as any).mockResolvedValue({ ...COMPLETED_DOC });
  });
  afterEach(() => { root.unmount(); container.remove(); });

  it('EN: renders the date via formatDateValue (localized short date, not raw ISO)', async () => {
    mount('/documents/doc-9', 'en');
    await vi.waitFor(() => expect(text()).toContain('facture-2026.pdf'));
    expect(text()).toContain(formatDateValue(COMPLETED_DOC.uploadedAt, 'en')!);
    expect(text()).not.toContain(COMPLETED_DOC.uploadedAt); // never the raw ISO
  });

  it('AR: renders the Arabic-localized date, not the English one (proves it follows the app language)', async () => {
    mount('/documents/doc-9', 'ar');
    await vi.waitFor(() => expect(text()).toContain('facture-2026.pdf'));
    expect(text()).toContain(formatDateValue(COMPLETED_DOC.uploadedAt, 'ar')!);
    expect(text()).not.toContain(formatDateValue(COMPLETED_DOC.uploadedAt, 'en')!);
  });
});

// ── D4-review follow-ups: live data-correctness + RTL guards ───────────────
describe('Detail follow-ups: localized fact date, filtered decision, translated type/role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (documentService.getDocumentDetail as any).mockResolvedValue({ ...NEEDS_REVIEW_DOC });
  });
  afterEach(() => { root.unmount(); container.remove(); });

  it('EN: renders the date fact LOCALIZED, never the raw ISO string (FIX 2a)', async () => {
    mount('/documents/doc-nr', 'en');
    await vi.waitFor(() => expect(text()).toContain('facture-fevrier.pdf'));
    expect(text()).toContain('2026');
    expect(text()).toContain('Feb'); // localized short month, not a raw ISO
    expect(text()).not.toContain('2026-02-08T00:00:00.000Z');
    expect(text()).not.toContain('T00:00:00');
  });

  it('filters the rule-engine decision + decision_reason facts out of the table (FIX 2b)', async () => {
    mount('/documents/doc-nr', 'en');
    await vi.waitFor(() => expect(text()).toContain('facture-fevrier.pdf'));
    // The raw NEEDS_REVIEW enum never appears (the DecisionBanner shows the
    // translated title; the facts table no longer duplicates the raw fact).
    expect(text()).not.toContain('NEEDS_REVIEW');
    // The decision-field label is not rendered as an Extracted-Facts row.
    expect(text()).not.toContain(strings.en.decisionField);
  });

  it('AR: translates the decision reason and shows no raw English "Missing amount" anywhere (FIX 2b + 2c)', async () => {
    mount('/documents/doc-nr', 'ar');
    await vi.waitFor(() => expect(text()).toContain('facture-fevrier.pdf'));
    // Banner shows the translated reason; the raw fact is filtered from the table.
    expect(text()).toContain(strings.ar.reasonMissingAmount);
    expect(text()).not.toContain('Missing amount');
    expect(text()).not.toContain('NEEDS_REVIEW');
  });

  it('EN: renders the translated document type + entity role, never the raw enums (type/role fixes)', async () => {
    mount('/documents/doc-nr', 'en');
    await vi.waitFor(() => expect(text()).toContain('facture-fevrier.pdf'));
    expect(text()).toContain(strings.en.docTypeInvoice); // INVOICE -> Invoice
    expect(text()).not.toContain('INVOICE');
    // The relationships section and its role label are gone (redraw,
    // 2026-09-25): the vendor is the screen's title instead.
    expect(text()).not.toContain(strings.en.entityRoleVendor);
    expect(text()).not.toContain('VENDOR');
  });

  it('AR: type + role read in Arabic (parity), never the Latin enum', async () => {
    mount('/documents/doc-nr', 'ar');
    await vi.waitFor(() => expect(text()).toContain('facture-fevrier.pdf'));
    expect(text()).toContain(strings.ar.docTypeInvoice);
    expect(text()).not.toContain(strings.ar.entityRoleVendor);
    expect(text()).not.toContain('INVOICE');
    expect(text()).not.toContain('VENDOR');
  });
});

// item B (Phase 3): the entity chip renders the human-readable name via the
// chain displayName ?? aliases[0] ?? name (canonicalName fallback), never the
// normalized matching key.
const ALIASED_ENTITY_DOC = {
  id: 'doc-ent',
  originalFileName: 'facture-electricite.pdf',
  status: 'COMPLETED',
  overallConfidence: 0.95,
  uploadedAt: '2026-06-01T10:00:00Z',
  documentType: 'INVOICE',
  detectedLanguage: 'ar',
  facts: [],
  entities: [
    // displayName (real column) is the source of truth: it wins over aliases[0]
    // AND over the mangled `name` key.
    { role: 'VENDOR', displayName: 'Société Régionale Multiservices Marrakech-Safi SA', name: 'SOCIT RGIONALE MULTISERVICES MARRAKECHSAFI SA', aliases: ['SRM legacy alias'] },
    // No displayName -> falls back to aliases[0].
    { role: 'ISSUER', name: 'CONTOSO SA', aliases: ['Contoso SARL'] },
    // No displayName, no alias -> falls back to ent.name (still a real value).
    { role: 'CLIENT', name: 'Fallback Co', aliases: [] },
  ],
};

describe('Detail follow-ups: entity chip shows the human name via the displayName chain (item B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (documentService.getDocumentDetail as any).mockResolvedValue({ ...ALIASED_ENTITY_DOC });
  });
  afterEach(() => { root.unmount(); container.remove(); });

  it('prefers displayName, never the accent-stripped canonicalName key or a stale alias', async () => {
    mount('/documents/doc-ent', 'ar');
    await vi.waitFor(() => expect(text()).toContain('facture-electricite.pdf'));
    expect(text()).toContain('Société Régionale Multiservices Marrakech-Safi SA');
    expect(text()).not.toContain('SOCIT RGIONALE');
    expect(text()).not.toContain('SRM legacy alias');
  });

  it('falls back to aliases[0] when the vendor has no displayName', async () => {
    (documentService.getDocumentDetail as any).mockResolvedValue({ ...ALIASED_ENTITY_DOC, entities: [ALIASED_ENTITY_DOC.entities[1]] });
    mount('/documents/doc-ent', 'ar');
    await vi.waitFor(() => expect(text()).toContain('facture-electricite.pdf'));
    expect(container.querySelector('h1')!.textContent).toBe('Contoso SARL');
    expect(text()).not.toContain('CONTOSO SA');
  });

  it('falls back to ent.name when the vendor has neither displayName nor alias', async () => {
    (documentService.getDocumentDetail as any).mockResolvedValue({ ...ALIASED_ENTITY_DOC, entities: [{ role: 'VENDOR', name: 'Fallback Co', aliases: [] }] });
    mount('/documents/doc-ent', 'ar');
    await vi.waitFor(() => expect(text()).toContain('facture-electricite.pdf'));
    expect(text()).toContain('Fallback Co');
  });
});

// ── TASK 3: data-relationships shows the FULL entity name (no truncation) ─────
// A long vendor name previously clipped at 192px (max-w-[12rem] truncate) so the
// user never saw the whole name — an honesty defect. It must now render in full,
// wrapping onto as many lines as it needs, with role + name both present.
const LONG_NAME = 'Société Générale de Surveillance et Contrôle Technique International SA Marrakech Safi';

const FEW_ENTITIES_DOC = {
  id: 'doc-few',
  originalFileName: 'facture-longue.pdf',
  status: 'COMPLETED',
  overallConfidence: 0.95,
  uploadedAt: '2026-06-01T10:00:00Z',
  documentType: 'INVOICE',
  detectedLanguage: 'ar',
  facts: [],
  entities: [
    { role: 'VENDOR', name: LONG_NAME, aliases: [LONG_NAME] },
    { role: 'ISSUER', name: 'Contoso SARL', aliases: [] },
  ],
};

// Six entities -> the "many" layout (stacked list). Every full name must show.
const MANY_ENTITIES_DOC = {
  id: 'doc-many',
  originalFileName: 'facture-multi.pdf',
  status: 'COMPLETED',
  overallConfidence: 0.95,
  uploadedAt: '2026-06-01T10:00:00Z',
  documentType: 'INVOICE',
  detectedLanguage: 'ar',
  facts: [],
  entities: [
    { role: 'VENDOR', name: LONG_NAME, aliases: [LONG_NAME] },
    { role: 'ISSUER', name: 'Contoso SARL', aliases: [] },
    { role: 'VENDOR', name: 'Aurora Studios International', aliases: [] },
    { role: 'ISSUER', name: 'Globex Corporation Limited', aliases: [] },
    { role: 'VENDOR', name: 'Initech Systems', aliases: [] },
    { role: 'ISSUER', name: 'Umbrella Holdings', aliases: [] },
  ],
};

// The data-relationships section was removed in the 2026-09-25 redraw: the
// vendor is the screen's title (tests above), and no other entity renders.

describe('Detail follow-ups: decision reason translation helper (FIX 2c, unit)', () => {
  it('translates a single known reason and drops the raw English in Arabic', () => {
    expect(translateDecisionReasons('Missing amount', strings.ar as any, 'ar')).toBe(strings.ar.reasonMissingAmount);
    expect(translateDecisionReasons('Missing amount', strings.ar as any, 'ar')).not.toBe('Missing amount');
  });
  it('maps each part of a joined multi-reason and rejoins them', () => {
    const out = translateDecisionReasons('Amount exceeds threshold, High food expense', strings.fr as any, 'fr');
    expect(out).toContain(strings.fr.reasonAmountExceedsThreshold);
    expect(out).toContain(strings.fr.reasonHighFoodExpense);
  });
  it('uses the Arabic list separator when joining in ar', () => {
    const out = translateDecisionReasons('Missing amount, High food expense', strings.ar as any, 'ar');
    expect(out).toContain('، ');
  });
  it('keeps an unknown reason part verbatim (never fabricates a translation)', () => {
    expect(translateDecisionReasons('Totally unknown reason', strings.en as any, 'en')).toBe('Totally unknown reason');
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
          <FixActionPanel documentId="doc-1" decision="NEEDS_REVIEW" reason="missing amount" currency="MAD" onSuccess={() => {}} />
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
    // The unit is a following sibling carrying the document's own currency as
    // its ISO code (the ledger's rule: never a symbol), and it is NOT an
    // absolutely-positioned overlay (which is what let it hide behind the value).
    const unit = group.querySelector('span') as HTMLElement;
    expect(unit.textContent).toBe('MAD');
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

  // The redraw (2026-09-25): the merchant name is the h1, kept whole (wraps,
  // never cut), inside the shared Panel.
  it('the title is the merchant, wrapping, never truncated, in the shared Panel', () => {
    expect(files.screen).toContain('break-words text-title-lg font-semibold tracking-tight text-ink');
    expect(files.screen).not.toContain('truncate text-title-lg');
    expect(files.screen).toContain('${panelClass}');
  });

  // Bidi isolation is preserved on the wrapping value: dir="auto" sits on the
  // wrapping span with an inner <bdi>, so numerals/Latin in a name do not scramble
  // under Arabic RTL even though the value now wraps freely.

  // Type + role render through the shared translated helpers (no raw enum sites).
  it('detail screen renders the type and the vendor via the shared translated helpers', () => {
    expect(files.screen).toContain('getDocTypeLabel(doc.documentType');
    expect(files.screen).toContain('getVendor(doc)');
    expect(files.screen).not.toContain('getEntityRoleLabel(');
    // The raw `{ent.role}` render site is gone.
    expect(files.screen).not.toContain('>{ent.role}<');
  });
});

// The Dashboard recent-activity type adopts the SAME shared translated helper as
// Queue + Detail, so an Arabic user never sees a raw uppercase type there either.
describe('Detail follow-ups: Dashboard recent activity uses the shared type label (source scan)', () => {
  const dashboard = read('../src/screens/DashboardScreen.tsx');
  it('imports and applies getDocTypeLabel, and drops the raw documentType render', () => {
    expect(dashboard).toContain("import { getDocTypeLabel } from '../lib/searchResultCard'");
    expect(dashboard).toContain('getDocTypeLabel(item.documentType');
    // The old raw render (`${item.documentType} · `) is gone.
    expect(dashboard).not.toContain('${item.documentType}');
  });
});

// ============================================================================
// Class-B RTL hazard in SharedComponents: the chart's category label.
// ============================================================================
// ChartPlaceholder's label is `d.category || d.key` — EXTRACTED data, not an i18n
// string, so its direction is unknown and it must not inherit the page's. The
// amount beside it stays dir="ltr" and is asserted here too, so the pair cannot
// drift apart.
//
// HONEST LIMIT: green means the attributes are present. jsdom has no layout engine
// and no bidi resolution, so this cannot show which end the ellipsis eats. See
// tests/rtlTruncation.test.ts for the hand measurement that established the fix.
describe('SharedComponents ChartPlaceholder — category label states its direction (Class B)', () => {
  let c: HTMLDivElement;
  let r: Root;

  const DATA = [{ category: 'Maroc Telecom SA', key: null, sum: '1234.50', currency: 'MAD' }];

  beforeEach(() => {
    localStorage.setItem('lang', 'ar');
    c = document.createElement('div');
    document.body.appendChild(c);
    r = createRoot(c);
    flushSync(() => {
      r.render(
        <LanguageProvider>
          <ChartPlaceholder data={DATA} />
        </LanguageProvider>
      );
    });
  });

  afterEach(() => {
    r.unmount();
    c.remove();
    localStorage.clear();
  });

  it('AR: the truncating category label carries dir="auto"', () => {
    const label = [...c.querySelectorAll('span')].find(
      (s) => s.textContent === 'Maroc Telecom SA'
    );
    expect(label, 'the chart should render the category label').toBeTruthy();
    expect(label!.className).toContain('truncate');
    expect(label!.getAttribute('dir')).toBe('auto');
  });

  it('AR: the amount beside it stays dir="ltr"', () => {
    const amount = [...c.querySelectorAll('span')].find((s) =>
      s.textContent?.includes('1234.50')
    );
    expect(amount).toBeTruthy();
    expect(amount!.getAttribute('dir')).toBe('ltr');
  });
});
