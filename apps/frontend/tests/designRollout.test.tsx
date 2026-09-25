import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// The design rollout: Search, Queue, Detail, Activity, Settings and the tab
// bar on the pieces the owner approved on the ledger home (#245).
// ============================================================================
// Two halves. The SOURCE half proves each screen reaches the shared pieces and
// has left the raw palette. The RENDER half proves what a person sees: a
// document with a category gets its coloured tile AND its category name, in
// all three languages, on every list that shows documents; a document with no
// category gets a neutral tile and no invented "Other".
// ============================================================================

const h = vi.hoisted(() => ({
  getReviewQueue: vi.fn(), getAllActivity: vi.fn(), getDocumentDetail: vi.fn(), updateStatus: vi.fn(), getStats: vi.fn(),
  executeQuery: vi.fn(),
}));
vi.mock('../src/services/documentService', () => ({ documentService: h }));
vi.mock('../src/services/searchService', () => ({ searchService: { executeQuery: h.executeQuery } }));
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'rollout@example.com' }, signOut: vi.fn() }),
  AuthProvider: ({ children }: any) => children,
}));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ReviewQueueScreen } from '../src/screens/ReviewQueueScreen';
import { ActivityScreen } from '../src/screens/ActivityScreen';
import { SettingsScreen } from '../src/screens/SettingsScreen';
import { SearchScreen } from '../src/screens/SearchScreen';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';
import { BottomTabBar } from '../src/components/BottomTabBar';
import { getDocumentCategory } from '../src/lib/documentCategory';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];
const SRC = join(process.cwd(), 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

let container: HTMLDivElement;
let root: Root;

function mount(lang: Lang, path: string, routes: React.ReactNode) {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route element={<Outlet context={{ onSuccess: () => {}, refreshCount: 0, plan: 'FREE' }} />}>{routes}</Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}
const text = () => container.textContent ?? '';
const q = (sel: string) => container.querySelector(sel);

const FOOD = {
  id: 'food-1', originalFileName: 'bim-maroc.jpg', name: 'bim-maroc.jpg', status: 'NEEDS_REVIEW', overallConfidence: 0.83,
  uploadedAt: '2026-09-21T10:00:00Z', documentType: 'RECEIPT',
  facts: [
    { key: 'category', factType: 'CATEGORY', valueString: 'Food', confidence: 0.99 },
    { key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 467.85, currency: 'MAD', confidence: 0.99 },
  ],
};
const CARD = { id: 'card-1', originalFileName: 'card.jpg', name: 'card.jpg', status: 'COMPLETED', overallConfidence: 0.99, uploadedAt: '2026-09-20T10:00:00Z', documentType: 'BUSINESS_CARD', facts: [] };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.dir = 'ltr';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.getStats.mockResolvedValue({ totalCount: 2, pendingCount: 1, averageConfidence: 0.9, plan: 'FREE' });
});
afterEach(() => {
  root?.unmount();
  container?.remove();
});

describe('the category reader', () => {
  it('reads the eight categories and nothing else (control: an unknown value and a missing fact are null)', () => {
    expect(getDocumentCategory(FOOD)).toBe('Food');
    expect(getDocumentCategory(CARD)).toBeNull();
    expect(getDocumentCategory({ facts: [{ key: 'category', valueString: 'Groceries' }] })).toBeNull();
    expect(getDocumentCategory(null)).toBeNull();
  });
});

describe('source: every screen in the rollout reaches the shared pieces and has left the raw palette', () => {
  const SCREENS = {
    'screens/SearchScreen.tsx': ['components/ui/IconTile', 'components/ui/Panel'],
    'screens/ReviewQueueScreen.tsx': ['components/ui/DocumentIcon', 'components/ui/CountChip', 'components/ui/Panel'],
    'screens/DocumentDetailScreen.tsx': ['components/ui/DocumentIcon', 'components/ui/IconTile', 'components/ui/Panel'],
    'screens/ActivityScreen.tsx': ['components/ui/DocumentIcon', 'components/ui/CountChip', 'components/ui/Panel'],
    'screens/SettingsScreen.tsx': ['components/ui/IconTile', 'components/ui/CountChip', 'components/ui/Panel'],
    'components/ResultTable.tsx': ['ui/DocumentIcon', 'ui/Panel'],
    'components/BottomTabBar.tsx': [],
    'components/LanguageSwitcher.tsx': [],
  };
  const PALETTE = /\b(?:bg|text|border|ring|shadow)-(?:white|black|slate|gray|zinc|blue|indigo|emerald|green|amber|yellow|red|rose)(?:-\d{2,3}|\b)/;
  // The desktop tables' small-caps column headers keep `uppercase`; it is the
  // phone surfaces that had shouting labels, and those are the ones checked
  // by the render half below.
  const LOUD = ['rounded-[32px]', 'rounded-3xl', 'rounded-2xl', 'shadow-2xl', 'font-black', 'tracking-widest'];

  it('the palette scan can see a literal (control)', () => {
    expect(PALETTE.test('className="bg-white dark:bg-slate-800 text-blue-600"')).toBe(true);
    expect(PALETTE.test('className="bg-surface-raised text-ink"')).toBe(false);
  });

  for (const [file, pieces] of Object.entries(SCREENS)) {
    it(`${file}`, () => {
      const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
      for (const p of pieces) expect(src, `${file} imports ${p}`).toContain(`${p}'`);
      // The approve/reject buttons keep their recorded `text-white` on a semantic fill
      // (tokenLiteralPairing.test.ts KNOWN); CategoryIcon's white glyph on a
      // non-flipping category fill is the one deliberate literal. Nothing else.
      const literals = src.match(new RegExp(PALETTE.source, 'g')) ?? [];
      expect(literals.filter(l => l !== 'text-white'), `${file} raw palette`).toEqual([]);
      for (const l of LOUD) expect(src, `${file} ${l}`).not.toContain(l);
    });
  }

  it('the ledger home still has no raw palette either (the rollout did not regress it)', () => {
    const src = read('screens/LedgerScreen.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src.match(new RegExp(PALETTE.source, 'g')) ?? []).toEqual([]);
  });
});

describe('render: a categorized document shows its tile AND its name; an uncategorized one shows neither', () => {
  for (const lang of LANGS) {
    it(`${lang}: the review queue`, async () => {
      h.getReviewQueue.mockResolvedValue([FOOD, CARD]);
      mount(lang, '/queue', <Route path="/queue" element={<ReviewQueueScreen />} />);
      await vi.waitFor(() => expect(text()).toContain('bim-maroc.jpg'));
      const card = q('article[role="button"]')!;
      expect(card.querySelector('[data-category-icon="Food"]')).not.toBeNull();
      expect(card.textContent).toContain(strings[lang].catFood);
      const other = [...container.querySelectorAll('article[role="button"]')].find(a => a.textContent?.includes('card.jpg'))!;
      expect(other.querySelector('[data-category-icon]')).toBeNull();
      expect(other.querySelector('[data-icon-tile="neutral"]')).not.toBeNull();
      expect(other.textContent).not.toContain(strings[lang].catOther);
      expect(document.documentElement.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
    });

    it(`${lang}: the activity list`, async () => {
      h.getAllActivity.mockResolvedValue([FOOD, CARD]);
      mount(lang, '/activity', <Route path="/activity" element={<ActivityScreen />} />);
      await vi.waitFor(() => expect(text()).toContain('bim-maroc.jpg'));
      const rows = [...container.querySelectorAll('li')];
      const food = rows.find(r => r.textContent?.includes('bim-maroc.jpg'))!;
      expect(food.querySelector('[data-category-icon="Food"]')).not.toBeNull();
      expect(food.textContent).toContain(strings[lang].catFood);
      const card = rows.find(r => r.textContent?.includes('card.jpg'))!;
      expect(card.querySelector('[data-icon-tile="neutral"]')).not.toBeNull();
      expect(card.textContent).not.toContain(strings[lang].catOther);
      // The count is a chip, and it is Western digits.
      expect(text()).toContain(`2 ${strings[lang].records}`);
    });

    it(`${lang}: the search result card`, async () => {
      h.executeQuery.mockResolvedValue({ outputFormat: 'table', data: [FOOD, CARD], resultCount: 2, executionTimeMs: 12 });
      mount(lang, '/search', <Route path="/search" element={<SearchScreen />} />);
      const form = container.querySelector('form')!;
      const input = container.querySelector('input')!;
      flushSync(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, 'food');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      flushSync(() => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
      await vi.waitFor(() => expect(text()).toContain('bim-maroc.jpg'));
      const cards = [...container.querySelectorAll('div.md\\:hidden > button')];
      const food = cards.find(c => c.textContent?.includes('bim-maroc.jpg'))!;
      expect(food.querySelector('[data-category-icon="Food"]')).not.toBeNull();
      const card = cards.find(c => c.textContent?.includes('card.jpg'))!;
      expect(card.querySelector('[data-icon-tile="neutral"]')).not.toBeNull();
    });

    it(`${lang}: the detail names the category in the meta grid, beside the tile`, async () => {
      h.getDocumentDetail.mockResolvedValue({ ...FOOD, reextractable: false });
      mount(lang, '/documents/food-1', <Route path="/documents/:id" element={<DocumentDetailScreen />} />);
      await vi.waitFor(() => expect(text()).toContain('bim-maroc.jpg'));
      expect(q('[data-category-icon="Food"]')).not.toBeNull();
      expect(text()).toContain(strings[lang].categoryLabel);
      expect(text()).toContain(strings[lang].catFood);
      // The language cell is gone: nothing on the screen claims 'EN'.
      expect(text()).not.toContain(strings[lang].docLanguage);
    });

    it(`${lang}: settings renders every section on the pieces, with no promises panel`, () => {
      mount(lang, '/settings', <Route path="/settings" element={<SettingsScreen />} />);
      for (const k of ['preferences', 'language', 'appearance', 'subscriptionBilling', 'freeTier', 'dangerZone', 'signOut'] as const) {
        expect(text(), k).toContain(strings[lang][k]);
      }
      expect(text()).not.toMatch(/API key|Webhook|Coming soon|Bientôt|قريبًا/);
      expect(container.querySelectorAll('[data-icon-tile]').length).toBeGreaterThanOrEqual(6);
      expect(document.documentElement.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
    });
  }

  it('the promises strings are gone from every locale (parity keeps the three catalogues equal)', () => {
    for (const lang of LANGS) {
      for (const k of ['comingSoon', 'systemInfo', 'v1Preview', 'invoiceHistory', 'teamManagement', 'apiKeyGen', 'webhookConfig']) {
        expect((strings[lang] as Record<string, string>)[k], `${lang}.${k}`).toBeUndefined();
      }
    }
    expect(Object.keys(strings.fr).sort()).toEqual(Object.keys(strings.en).sort());
    expect(Object.keys(strings.ar).sort()).toEqual(Object.keys(strings.en).sort());
  });

  it('the tab bar badge is an accent chip on a token foreground, and the active tab wears the tint pill', () => {
    mount('en', '/queue', <Route path="/queue" element={<BottomTabBar pendingCount={8} />} />);
    const badge = q('[data-testid="queue-badge"]')!;
    expect(badge.textContent).toBe('8');
    expect(badge.className).toContain('bg-accent');
    expect(badge.className).not.toContain('text-white');
    const active = container.querySelector('a[aria-current="page"]')!;
    expect(active.querySelector('.bg-accent-tint')).not.toBeNull();
  });
});
