import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// ============================================================================
// FAILURE-ONLY EDGE LEAKS (Class A) — audit #7 PR 2.
// ============================================================================
// Four hardcoded English literals that only ever appeared on a FAILURE path, so
// no locale ever saw them translated and no happy-path test ever rendered them:
//
//   components/Sidebar.tsx        showToast('Checking for your PRO upgrade...')
//   screens/DashboardScreen.tsx   setError('We could not connect to the ...')
//   screens/DashboardScreen.tsx   setError('Intelligence metrics are ...')
//   screens/DashboardScreen.tsx   setError('An unexpected error occurred ...')
//
// These were the four KNOWN_PENDING_PR2 pins in noHardcodedUserFacingText.test.ts;
// that list is emptied in the same commit as this file lands.
//
// This file lives APART from scanUploadCompletionLocalization.test.tsx (PR 1) on
// purpose: that file's header declares its scope locked to the scan/upload
// completion surface, and appending dashboard keys to its AR_EXPECTED would make
// that statement false. The style here is deliberately identical — same `cps`
// helper, same literal-array contract, same bidi-control and all-locales checks.
//
// TWO LAYERS, because either alone is insufficient:
//   1. CATALOG, by code point. The terminal reverses Arabic and can hide a wrong
//      letter, a smuggled bidi control, or a silent English fallback. Glyphs are
//      never trusted; the arrays below are the contract.
//   2. RENDER. A catalog assertion cannot see a call site that never reads the
//      catalog — exactly the blindness the D1 render guard
//      (processingToastRenderI18n.test.tsx) exists to cover. So the real
//      components are mounted under lang=ar, driven down their real failure
//      paths, and the DISPLAYED text is compared with toBe() — EQUALITY, never
//      toContain(), which would still pass if English were concatenated on.
// ============================================================================

// ── Approved Arabic, as CODE POINTS (independent of strings.ts). ────────────
// Presented to Abo Jad as numbers, not glyphs, and approved as numbers.
const AR_EXPECTED: Record<string, number[]> = {
  // "تعذّر الاتصال بخادم الذكاء. قد تكون هذه مشكلة اتصال مؤقتة."
  // تعذّر carries the SHADDA (1617) exactly as the existing scanFailed key does.
  dashboardConnectionError: [
    1578, 1593, 1584, 1617, 1585, 32, 1575, 1604, 1575, 1578, 1589, 1575, 1604, 32, 1576, 1582,
    1575, 1583, 1605, 32, 1575, 1604, 1584, 1603, 1575, 1569, 46, 32, 1602, 1583, 32, 1578, 1603,
    1608, 1606, 32, 1607, 1584, 1607, 32, 1605, 1588, 1603, 1604, 1577, 32, 1575, 1578, 1589, 1575,
    1604, 32, 1605, 1572, 1602, 1578, 1577, 46,
  ],
  // "مقاييس الذكاء غير متاحة مؤقتًا. بيانات نشاطك لا تزال ظاهرة."
  // مؤقتًا carries the FATHATAN (1611) on the ت.
  dashboardMetricsUnavailable: [
    1605, 1602, 1575, 1610, 1610, 1587, 32, 1575, 1604, 1584, 1603, 1575, 1569, 32, 1594, 1610,
    1585, 32, 1605, 1578, 1575, 1581, 1577, 32, 1605, 1572, 1602, 1578, 1611, 1575, 46, 32, 1576,
    1610, 1575, 1606, 1575, 1578, 32, 1606, 1588, 1575, 1591, 1603, 32, 1604, 1575, 32, 1578, 1586,
    1575, 1604, 32, 1592, 1575, 1607, 1585, 1577, 46,
  ],
  // "حدث خطأ غير متوقع أثناء تحميل لوحة القيادة."
  // لوحة القيادة is the SAME wording as the existing strings.ar.dashboard key,
  // so the error names the screen the user is actually looking at.
  dashboardUnexpectedError: [
    1581, 1583, 1579, 32, 1582, 1591, 1571, 32, 1594, 1610, 1585, 32, 1605, 1578, 1608, 1602, 1593,
    32, 1571, 1579, 1606, 1575, 1569, 32, 1578, 1581, 1605, 1610, 1604, 32, 1604, 1608, 1581, 1577,
    32, 1575, 1604, 1602, 1610, 1575, 1583, 1577, 46,
  ],
  // "جارٍ التحقق من ترقية PRO الخاصة بك..."
  // جارٍ (with KASRATAN 1613) is lifted from the existing verifyingAccount key —
  // the catalog's established opener for an in-progress check. 80,82,79 are the
  // Latin letters P,R,O: a brand token, deliberately NOT transliterated.
  planRefreshChecking: [
    1580, 1575, 1585, 1613, 32, 1575, 1604, 1578, 1581, 1602, 1602, 32, 1605, 1606, 32, 1578, 1585,
    1602, 1610, 1577, 32, 80, 82, 79, 32, 1575, 1604, 1582, 1575, 1589, 1577, 32, 1576, 1603, 46,
    46, 46,
  ],
};

const h = vi.hoisted(() => ({
  getStats: vi.fn(),
  getRecentActivity: vi.fn(),
  getAllActivity: vi.fn(),
  exportCsv: vi.fn(),
}));

vi.mock('../src/services/documentService', () => ({
  documentService: {
    getStats: h.getStats,
    getRecentActivity: h.getRecentActivity,
    getAllActivity: h.getAllActivity,
    exportCsv: h.exportCsv,
  },
}));

// Sidebar reads the signed-in user for its footer. Mocked at the same boundary
// the other render tests use; nothing about the toast path is stubbed.
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'ac1d0000-0000-4000-8000-000000000001', email: 'edge-check@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { DashboardScreen } from '../src/screens/DashboardScreen';
import { Sidebar } from '../src/components/Sidebar';

const cps = (s: string) => [...s].map((c) => c.codePointAt(0)!);
const NEW_KEYS = Object.keys(AR_EXPECTED) as (keyof typeof strings.en)[];

// ────────────────────────────────────────────────────────────────────────────
// 1. AR catalog — code-point exact for every NEW key.
// ────────────────────────────────────────────────────────────────────────────
describe('AR edge-leak catalog — code-point exact (never trust the terminal)', () => {
  for (const [key, expected] of Object.entries(AR_EXPECTED)) {
    it(`strings.ar.${key} matches the approved code points exactly`, () => {
      expect(strings.ar[key as keyof typeof strings.ar]).toBeTypeOf('string');
      expect(cps(strings.ar[key as keyof typeof strings.ar] as string)).toEqual(expected);
    });
  }

  it('carries NO hidden bidi / zero-width control characters (RLM, LRM, isolates, BOM)', () => {
    const isCtrl = (p: number) =>
      (p >= 0x200b && p <= 0x200f) || (p >= 0x202a && p <= 0x202e) || (p >= 0x2066 && p <= 0x2069) || p === 0xfeff;
    for (const key of Object.keys(AR_EXPECTED)) {
      const bad = cps(strings.ar[key as keyof typeof strings.ar] as string).filter(isCtrl);
      expect(bad, `${key} smuggled a hidden control char`).toEqual([]);
    }
  });

  it('every NEW key exists in all three locales (no missing-locale renders-empty)', () => {
    for (const key of NEW_KEYS) {
      for (const lang of ['en', 'fr', 'ar'] as const) {
        const v = strings[lang][key];
        expect(typeof v === 'string' && (v as string).length > 0, `${lang}.${key} missing`).toBe(true);
      }
    }
  });

  // The EN text is byte-identical to the literal it replaced. This PR routes
  // strings; it does not reword them, so an English user sees no change at all.
  it('EN text is byte-identical to the four retired literals', () => {
    expect(strings.en.dashboardConnectionError).toBe(
      'We could not connect to the intelligence server. This might be a temporary connection issue.'
    );
    expect(strings.en.dashboardMetricsUnavailable).toBe(
      'Intelligence metrics are temporarily unavailable. Your activity data is still visible.'
    );
    expect(strings.en.dashboardUnexpectedError).toBe(
      'An unexpected error occurred while loading your dashboard.'
    );
    expect(strings.en.planRefreshChecking).toBe('Checking for your PRO upgrade...');
  });

  // No interpolation slot: these are static sentences. A '{' would mean a
  // filename or count could be spliced into Arabic — ruling D1.
  it('no NEW key carries an interpolation placeholder (D1)', () => {
    for (const key of NEW_KEYS) {
      for (const lang of ['en', 'fr', 'ar'] as const) {
        expect(strings[lang][key] as string, `${lang}.${key} has a slot`).not.toContain('{');
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. RENDER — DashboardScreen failure paths under lang=ar.
// ────────────────────────────────────────────────────────────────────────────
// Only the SERVICE boundary is mocked (the same boundary dashboardRestyle.test.tsx
// already mocks). The component, its error branches, ErrorState and the i18n
// provider are all real, so the thing under test — does the failure path read the
// catalog? — is never stubbed away.
let container: HTMLDivElement;
let root: Root;

function mountDashboard(lang: 'en' | 'fr' | 'ar') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route element={<Outlet context={{ refreshCount: 0, onNewScan: () => {} }} />}>
              <Route path="/dashboard" element={<DashboardScreen />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    );
  });
}

/**
 * Read the ErrorState's message paragraph.
 *
 * Anchored on the <h3> that carries the known title and then its next sibling —
 * NOT on a Tailwind class, which a restyle could rename without any localization
 * regression. Returns the message text verbatim, whitespace included.
 */
async function readErrorMessage(titleKey: 'connectionError', lang: 'en' | 'fr' | 'ar'): Promise<string> {
  await vi.waitFor(() => {
    const found = [...container.querySelectorAll('h3')].some(
      (e) => e.textContent === strings[lang][titleKey]
    );
    expect(found, 'the ErrorState never rendered').toBe(true);
  });
  const h3 = [...container.querySelectorAll('h3')].find(
    (e) => e.textContent === strings[lang][titleKey]
  )!;
  return h3.nextElementSibling?.textContent ?? '';
}

describe('DashboardScreen failure paths RENDER the AR catalog exactly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });

  it('both fetches fail -> renders exactly strings.ar.dashboardConnectionError', async () => {
    // Both service calls reject. Each has its own .catch() returning null, so
    // statsData and activityData are both null -> the first error branch.
    h.getStats.mockRejectedValue(new Error('stats down'));
    h.getRecentActivity.mockRejectedValue(new Error('activity down'));
    mountDashboard('ar');

    const msg = await readErrorMessage('connectionError', 'ar');

    // EQUALITY, not toContain: a concatenated English fragment would still
    // satisfy toContain, and that is precisely the regression being guarded.
    expect(
      msg,
      'The dashboard connection error must render the catalog string ALONE. Anything ' +
        'else means the literal came back or a value was concatenated at the call site.'
    ).toBe(strings.ar.dashboardConnectionError);
    expect(msg, 'the retired English literal is back').not.toContain('intelligence server');
  });

  it('stats fails, activity returns empty -> renders exactly strings.ar.dashboardMetricsUnavailable', async () => {
    // An empty array is TRUTHY, so activityData is not null and the second
    // branch is taken; recentActivity stays length 0 so the ErrorState shows.
    h.getStats.mockRejectedValue(new Error('stats down'));
    h.getRecentActivity.mockResolvedValue([]);
    mountDashboard('ar');

    const msg = await readErrorMessage('connectionError', 'ar');
    expect(msg).toBe(strings.ar.dashboardMetricsUnavailable);
    expect(msg).not.toContain('Intelligence metrics');
  });

  it('a synchronous throw -> renders exactly strings.ar.dashboardUnexpectedError', async () => {
    // Throwing SYNCHRONOUSLY is what reaches the outer catch: the .catch() on
    // line 120 is never attached because the call itself throws first.
    h.getStats.mockImplementation(() => {
      throw new Error('sync boom');
    });
    h.getRecentActivity.mockResolvedValue([]);
    mountDashboard('ar');

    const msg = await readErrorMessage('connectionError', 'ar');
    expect(msg).toBe(strings.ar.dashboardUnexpectedError);
    expect(msg).not.toContain('unexpected error occurred');
  });

  it('the same path under lang=en renders the EN catalog string alone', async () => {
    h.getStats.mockRejectedValue(new Error('stats down'));
    h.getRecentActivity.mockRejectedValue(new Error('activity down'));
    mountDashboard('en');

    const msg = await readErrorMessage('connectionError', 'en');
    expect(msg).toBe(strings.en.dashboardConnectionError);
  });

  it('the same path under lang=fr renders the FR catalog string alone (no English fallback)', async () => {
    h.getStats.mockRejectedValue(new Error('stats down'));
    h.getRecentActivity.mockRejectedValue(new Error('activity down'));
    mountDashboard('fr');

    const msg = await readErrorMessage('connectionError', 'fr');
    expect(msg).toBe(strings.fr.dashboardConnectionError);
    expect(msg).not.toContain('intelligence server');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. RENDER — Sidebar plan-refresh toast under lang=ar.
// ────────────────────────────────────────────────────────────────────────────
// Drivable with no change to the component: the refresh affordance is rendered
// whenever plan === 'FREE' and onRefreshPlan is supplied, both plain props.
describe('Sidebar plan-refresh toast RENDERS the AR catalog exactly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });

  function mountSidebar(lang: 'en' | 'ar') {
    localStorage.setItem('lang', lang);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => {
      root.render(
        <LanguageProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/dashboard']}>
              <Sidebar onNewScan={() => {}} onRefreshPlan={() => {}} plan="FREE" />
            </MemoryRouter>
          </ToastProvider>
        </LanguageProvider>
      );
    });
  }

  /** Click the plan-refresh button and return the rendered toast text verbatim. */
  async function clickRefreshAndReadToast(): Promise<string> {
    const btn = container.querySelector(
      'button[title="Refresh subscription status"]'
    ) as HTMLButtonElement;
    expect(btn, 'the plan-refresh button did not render').toBeTruthy();
    flushSync(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await vi.waitFor(() => {
      expect(document.querySelector('.toast-message')).toBeTruthy();
    });
    return document.querySelector('.toast-message')!.textContent ?? '';
  }

  it('under lang=ar, renders exactly strings.ar.planRefreshChecking', async () => {
    mountSidebar('ar');
    const rendered = await clickRefreshAndReadToast();
    expect(
      rendered,
      'The plan-refresh toast must render the catalog string ALONE.'
    ).toBe(strings.ar.planRefreshChecking);
    expect(rendered, 'the retired English literal is back').not.toContain('Checking for your');
  });

  it('under lang=en, renders exactly strings.en.planRefreshChecking', async () => {
    mountSidebar('en');
    const rendered = await clickRefreshAndReadToast();
    expect(rendered).toBe(strings.en.planRefreshChecking);
  });
});
