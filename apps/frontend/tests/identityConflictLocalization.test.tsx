import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// ============================================================================
// IDENTITY_EMAIL_CONFLICT — the lockout screen, in three locales.
// ============================================================================
// A user whose provisioning hit the email collision was shown a CONNECTION
// diagnosis with a retry button, for a condition no retry can clear.
//
// The screen could not have said anything else. documentService.getStats threw a
// fixed literal and never read the body, and DashboardScreen.fetchData caught
// both failures into `null` and inferred its message from two nulls. The server
// code was destroyed before any catalog was consulted.
//
// Same two-layer style as edgeLeakLocalization.test.tsx, for the same reasons:
//   1. CATALOG, by code point. The terminal reverses Arabic and can hide a wrong
//      letter, a smuggled bidi control or a silent English fallback.
//   2. RENDER. A catalog assertion cannot see a call site that never reads the
//      catalog — which is precisely the defect here.
//
// Plus a THIRD layer this surface needs and the others did not: the SERVICE, at
// the fetch boundary. Every existing dashboard test mocks documentService
// itself, so nothing in the suite has ever exercised the !res.ok branch — the
// asymmetry that caused this could have been reintroduced in silence.
// ============================================================================

// ── Approved Arabic, as CODE POINTS (independent of strings.ts). ────────────
// Presented to Abo Jad as numbers, decoded by him independently, and approved as
// numbers. The arrays are the approved artifact; the glyphs are a rendering of
// it, and are not what was agreed.
const AR_EXPECTED: Record<string, number[]> = {
  // "لا يمكن فتح هذا الحساب"
  accountLockedTitle: [
    1604, 1575, 32, 1610, 1605, 1603, 1606, 32, 1601, 1578, 1581, 32, 1607, 1584, 1575, 32, 1575,
    1604, 1581, 1587, 1575, 1576,
  ],
  // "هذه ليست مشكلة اتصال، ولن تنجح إعادة المحاولة. فريقنا وحده يستطيع إصلاح هذا. راسلنا على support@scan-action.com"
  // 1548 is the ARABIC COMMA, already this catalog's convention (see
  // cameraPermissionDenied). The trailing 115..109 run is the support address:
  // Latin, deliberately not transliterated, and the FINAL token with no
  // punctuation after it — so no bidi control is needed to stop a neutral
  // character reordering at the boundary.
  accountLockedBody: [
    1607, 1584, 1607, 32, 1604, 1610, 1587, 1578, 32, 1605, 1588, 1603, 1604, 1577, 32, 1575, 1578,
    1589, 1575, 1604, 1548, 32, 1608, 1604, 1606, 32, 1578, 1606, 1580, 1581, 32, 1573, 1593, 1575,
    1583, 1577, 32, 1575, 1604, 1605, 1581, 1575, 1608, 1604, 1577, 46, 32, 1601, 1585, 1610, 1602,
    1606, 1575, 32, 1608, 1581, 1583, 1607, 32, 1610, 1587, 1578, 1591, 1610, 1593, 32, 1573, 1589,
    1604, 1575, 1581, 32, 1607, 1584, 1575, 46, 32, 1585, 1575, 1587, 1604, 1606, 1575, 32, 1593,
    1604, 1609, 32, 115, 117, 112, 112, 111, 114, 116, 64, 115, 99, 97, 110, 45, 97, 99, 116, 105,
    111, 110, 46, 99, 111, 109,
  ],
  // "لم نتمكن من حذف هذا الحساب تلقائيًا. يمكن لفريقنا إتمام الحذف نيابة عنك. راسلنا على support@scan-action.com"
  // 1611 is the FATHATAN on تلقائيًا — the same tanween the catalog already
  // carries in dashboardMetricsUnavailable's مؤقتًا. The closer راسلنا على is
  // deliberately identical to accountLockedBody's, so the two messages for this
  // one condition end the same way in the reader's language.
  deleteAccountIdentityConflict: [
    1604, 1605, 32, 1606, 1578, 1605, 1603, 1606, 32, 1605, 1606, 32, 1581, 1584, 1601, 32, 1607,
    1584, 1575, 32, 1575, 1604, 1581, 1587, 1575, 1576, 32, 1578, 1604, 1602, 1575, 1574, 1610,
    1611, 1575, 46, 32, 1610, 1605, 1603, 1606, 32, 1604, 1601, 1585, 1610, 1602, 1606, 1575, 32,
    1573, 1578, 1605, 1575, 1605, 32, 1575, 1604, 1581, 1584, 1601, 32, 1606, 1610, 1575, 1576,
    1577, 32, 1593, 1606, 1603, 46, 32, 1585, 1575, 1587, 1604, 1606, 1575, 32, 1593, 1604, 1609,
    32, 115, 117, 112, 112, 111, 114, 116, 64, 115, 99, 97, 110, 45, 97, 99, 116, 105, 111, 110,
    46, 99, 111, 109,
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

// Section 3 imports the REAL documentService, which reaches lib/supabase through
// apiConfig. Stubbed at the module boundary the other render tests already use
// (edgeLeakLocalization.test.tsx:103), so no network client is constructed and
// getAuthHeaders simply produces no Authorization header.
vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { DashboardScreen } from '../src/screens/DashboardScreen';
import { translateAccountError } from '../src/lib/accountErrors';
import { isIdentityConflict, IDENTITY_EMAIL_CONFLICT } from '../src/lib/identityConflict';

const cps = (s: string) => [...s].map((c) => c.codePointAt(0)!);
const NEW_KEYS = [
  'accountLockedTitle',
  'accountLockedBody',
  'deleteAccountIdentityConflict',
] as const;
// The two message bodies. Both carry the support address and both must refuse
// the retry vocabulary — the title has neither, so it is excluded rather than
// asserted vacuously.
const BODY_KEYS = ['accountLockedBody', 'deleteAccountIdentityConflict'] as const;
// The retry vocabulary, in all three locales. حاول is the
// root the AR catalog uses for both tryAgain and المحاولة.
const RETRY_PHRASE = /try(ing)? again|réessayer|حاول/i;
const isCtrl = (p: number) =>
  (p >= 0x200b && p <= 0x200f) ||
  (p >= 0x202a && p <= 0x202e) ||
  (p >= 0x2066 && p <= 0x2069) ||
  p === 0xfeff;

// ────────────────────────────────────────────────────────────────────────────
// 0. POSITIVE CONTROL for the code-point instrument itself.
// ────────────────────────────────────────────────────────────────────────────
// CLAUDE.md: prove the detector separates a known-bad from a known-good before
// believing any census it produces. Without this, a broken `cps` or a broken
// `isCtrl` would make every assertion below pass vacuously — the exact failure
// shape that file warns about, where the wrong answer is clean and quotable.
describe('the code-point instrument is sound before it is trusted', () => {
  it('reads an Arabic letter, a Latin letter and an RLM as distinct code points', () => {
    expect(cps('a‏ا')).toEqual([97, 8207, 1575]);
  });

  it('the control detector fires on a smuggled RLM and stays silent on clean Arabic', () => {
    expect(cps('a‏ا').some(isCtrl)).toBe(true);
    expect(cps('لا يمكن').some(isCtrl)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 1. CATALOG — code-point exact.
// ────────────────────────────────────────────────────────────────────────────
describe('AR lockout catalog — code-point exact (never trust the terminal)', () => {
  for (const [key, expected] of Object.entries(AR_EXPECTED)) {
    it(`strings.ar.${key} matches the approved code points exactly`, () => {
      expect(strings.ar[key as keyof typeof strings.ar]).toBeTypeOf('string');
      expect(cps(strings.ar[key as keyof typeof strings.ar] as string)).toEqual(expected);
    });
  }

  it('carries NO hidden bidi / zero-width control characters (RLM, LRM, isolates, BOM)', () => {
    for (const key of Object.keys(AR_EXPECTED)) {
      const bad = cps(strings.ar[key as keyof typeof strings.ar] as string).filter(isCtrl);
      expect(bad, `${key} smuggled a hidden control char`).toEqual([]);
    }
  });

  it('every NEW key exists in all three locales (no missing-locale renders-empty)', () => {
    for (const key of NEW_KEYS) {
      for (const lang of ['en', 'fr', 'ar'] as const) {
        const v = strings[lang][key];
        expect(typeof v === 'string' && (v as string).length > 0, `${lang}.${key} missing`).toBe(
          true
        );
      }
    }
  });

  it('EN and FR match the approved text exactly', () => {
    expect(strings.en.accountLockedTitle).toBe('This account cannot be opened');
    expect(strings.en.accountLockedBody).toBe(
      'This is not a connection problem, and trying again will not help. Only our team can fix it. Please email support@scan-action.com'
    );
    expect(strings.fr.accountLockedTitle).toBe('Ce compte ne peut pas être ouvert');
    expect(strings.fr.accountLockedBody).toBe(
      'Il ne s’agit pas d’un problème de connexion, et réessayer n’y changera rien. Seule notre équipe peut le corriger. Écrivez-nous à support@scan-action.com'
    );
    expect(strings.en.deleteAccountIdentityConflict).toBe(
      'We could not delete this account automatically. Our team can finish it for you. Email support@scan-action.com'
    );
    expect(strings.fr.deleteAccountIdentityConflict).toBe(
      'Nous n’avons pas pu supprimer ce compte automatiquement. Notre équipe peut le faire pour vous. Écrivez-nous à support@scan-action.com'
    );
  });

  it('the support address is the FINAL token in every locale, with nothing after it', () => {
    // The one thing that keeps a Latin address intact at the end of an RTL line
    // WITHOUT a bidi control. A period appended here would be a neutral at the
    // boundary and would render on the wrong side of the address.
    for (const key of BODY_KEYS) {
      for (const lang of ['en', 'fr', 'ar'] as const) {
        expect(strings[lang][key], `${lang}.${key}`).toMatch(/support@scan-action\.com$/);
      }
    }
  });

  it('NEITHER body tells the user to try again, in any locale', () => {
    // Asserted rather than trusted to the wording. On the dashboard the retry
    // affordance is removed, so "trying again will not help" is coherent there —
    // but deleteAccountIdentityConflict renders above a still-enabled
    // Permanently delete button, and the phrase must never migrate into it. The
    // pattern covers all three locales' spellings.
    // `try(ing)?` deliberately: the dashboard string says "trying again", which a
    // bare /try again/ does NOT match. Verified by transposing the two strings —
    // before this, EN passed by luck while FR and AR caught the swap.
    for (const lang of ['en', 'fr', 'ar'] as const) {
      expect(strings[lang].deleteAccountIdentityConflict, `${lang} delete copy`).not.toMatch(
        RETRY_PHRASE
      );
      // Positive control: the pattern must FIRE on the string that does say it,
      // or the assertion above is vacuous in that locale.
      expect(strings[lang].accountLockedBody, `${lang} control`).toMatch(RETRY_PHRASE);
    }
  });

  it('no NEW key carries an interpolation placeholder', () => {
    for (const key of NEW_KEYS) {
      for (const lang of ['en', 'fr', 'ar'] as const) {
        expect(strings[lang][key] as string, `${lang}.${key} has a slot`).not.toContain('{');
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. CLASSIFIER — the exact code only, never the status.
// ────────────────────────────────────────────────────────────────────────────
describe('isIdentityConflict recognises the code and nothing else', () => {
  it('matches the code however the service wrapped it', () => {
    expect(isIdentityConflict(new Error(IDENTITY_EMAIL_CONFLICT))).toBe(true);
    expect(isIdentityConflict(IDENTITY_EMAIL_CONFLICT)).toBe(true);
    expect(isIdentityConflict(new Error('  identity_email_conflict  '))).toBe(true);
  });

  it('does NOT match anything else a 409 or a failure can arrive as', () => {
    // Every entry is a real shape from this codebase or from the browser.
    const others: unknown[] = [
      new Error('Failed to fetch document stats'),
      // errorHandler.ts:46 — a BARE 409, no code. Keying on status would eat it.
      new Error('Conflict: A record with that unique value already exists.'),
      new Error('SHARED_WORKSPACE'), // the OTHER 409 on the delete path
      new TypeError('Failed to fetch'),
      new Error(''),
      null,
      undefined,
      {},
    ];
    for (const other of others) {
      expect(isIdentityConflict(other), String(other)).toBe(false);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. SERVICE — getStats must READ THE BODY.
// ────────────────────────────────────────────────────────────────────────────
// Unmocked service, stubbed fetch. This is the layer where the code used to be
// destroyed, and the only layer no other test in the suite touches.
//
// ===========================================================================
// DO NOT DELETE THIS SECTION. It is the ONLY guard on the root defect.
// ===========================================================================
// Thirteen test files in this repository touch getStats. ALL THIRTEEN — this
// one included, and dashboardRestyle and edgeLeakLocalization among them —
// `vi.mock('../src/services/documentService', ...)` at file scope, verified by
// count rather than by impression. They are therefore structurally blind to a regression
// inside it: the mock supplies whatever error the test names, so the question
// this section asks (does getStats read the response body at all?) is one they
// cannot pose.
//
// Measured, not assumed. Reverting getStats to its original
// `if (!res.ok) throw new Error('Failed to fetch document stats')` was run on
// 2026-08-26 against the WHOLE frontend suite: 2501 of 2502 tests passed. The
// single failure was in this section. Every AR render assertion in this file
// stayed green, as did all 51 other test files. So restoring the exact defect
// this PR exists to remove leaves the suite green everywhere a reviewer would
// think to look, and red in one place only — here.
//
// That is the whole danger, and it is why the note is here rather than in the
// pull request: deleting this section produces no failure anywhere, and the
// original bug can then return in silence. A future reader who finds a
// fetch-level test odd in a file of render tests is the person this paragraph
// is addressed to.
// ===========================================================================
describe('documentService.getStats surfaces the server code (the root asymmetry)', () => {
  // importActual, NOT import: the file-level vi.mock above intercepts every
  // ordinary import of this path, so `await import(...)` would hand back the
  // stub and every assertion here would pass against a mock of the very code
  // under test. That is a vacuous-green shape, so it is called out rather than
  // quietly worked around.
  const load = async () =>
    (
      await vi.importActual<typeof import('../src/services/documentService')>(
        '../src/services/documentService'
      )
    ).documentService;

  const respond = (status: number, body: unknown) =>
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status, json: async () => body } as unknown as Response)
    );

  afterEach(() => vi.unstubAllGlobals());

  it('409 WITH the code -> throws the code, so the screen can act on it', async () => {
    const svc = await load();
    respond(409, { error: IDENTITY_EMAIL_CONFLICT, errorId: 'abc' });
    await expect(svc.getStats()).rejects.toThrow(IDENTITY_EMAIL_CONFLICT);
  });

  it('a failure with NO code still throws the generic literal (nothing else changed)', async () => {
    const svc = await load();
    respond(500, {});
    await expect(svc.getStats()).rejects.toThrow('Failed to fetch document stats');
  });

  it('a failure whose body is not JSON does not throw a parse error', async () => {
    // A proxy 502 returns HTML. `.catch(() => ({}))` must absorb it, exactly as
    // getRecentActivity already does — otherwise reading the body would convert
    // a clean failure into a different, unhandled one.
    const svc = await load();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      } as unknown as Response)
    );
    await expect(svc.getStats()).rejects.toThrow('Failed to fetch document stats');
  });
});

// ===========================================================================
// 3b. THE SAME ASYMMETRY, IN THE TWO CALL SITES SECTION 3 DID NOT COVER.
// ===========================================================================
// DO NOT DELETE THIS SECTION EITHER. The banner above section 3 applies here
// word for word, and was re-measured for these two sites rather than assumed:
// reverting getReviewQueue and exportCsv to their original one-line throws was
// run against the WHOLE frontend suite on 2026-08-29. The result is in the PR.
//
// Section 3 is scoped to getStats — all three of its assertions name it — so it
// could not have caught these. getReviewQueue fed ReviewQueueScreen, which
// offers a retry (ReviewQueueScreen.tsx:143) that cannot succeed for a lockout;
// the code it needed to know that was destroyed one layer earlier.
//
// The load/respond helpers are duplicated from section 3 rather than hoisted
// out of it. Hoisting would have edited the block whose own banner says its
// deletion produces no failure anywhere, and two four-line helpers are a
// cheaper price than touching that.
// ===========================================================================
describe('getReviewQueue and exportCsv surface the server code too', () => {
  const load = async () =>
    (
      await vi.importActual<typeof import('../src/services/documentService')>(
        '../src/services/documentService'
      )
    ).documentService;

  const respond = (status: number, body: unknown) =>
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status, json: async () => body } as unknown as Response)
    );

  // A proxy 502 returns HTML, not JSON. `.catch(() => ({}))` must absorb it, or
  // reading the body converts a clean failure into a different, unhandled one.
  const respondNonJson = (status: number) =>
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      } as unknown as Response)
    );

  afterEach(() => vi.unstubAllGlobals());

  it('getReviewQueue: 409 WITH the code -> throws the code', async () => {
    const svc = await load();
    respond(409, { error: IDENTITY_EMAIL_CONFLICT, errorId: 'abc' });
    await expect(svc.getReviewQueue()).rejects.toThrow(IDENTITY_EMAIL_CONFLICT);
  });

  it('getReviewQueue: a failure with NO code still throws the generic literal', async () => {
    const svc = await load();
    respond(500, {});
    await expect(svc.getReviewQueue()).rejects.toThrow('Failed to fetch review queue');
  });

  it('getReviewQueue: a non-JSON body does not throw a parse error', async () => {
    const svc = await load();
    respondNonJson(502);
    await expect(svc.getReviewQueue()).rejects.toThrow('Failed to fetch review queue');
  });

  it('exportCsv: 409 WITH the code -> throws the code', async () => {
    const svc = await load();
    respond(409, { error: IDENTITY_EMAIL_CONFLICT, errorId: 'abc' });
    await expect(svc.exportCsv()).rejects.toThrow(IDENTITY_EMAIL_CONFLICT);
  });

  it('exportCsv: a failure with NO code still throws the generic literal', async () => {
    const svc = await load();
    respond(500, {});
    await expect(svc.exportCsv()).rejects.toThrow('Failed to export CSV');
  });

  it('exportCsv: a non-JSON body does not throw a parse error', async () => {
    const svc = await load();
    respondNonJson(502);
    await expect(svc.exportCsv()).rejects.toThrow('Failed to export CSV');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. RENDER — the real screen, the real ErrorState, the real i18n provider.
// ────────────────────────────────────────────────────────────────────────────
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

/** Wait for the ErrorState carrying `title`, then return its message paragraph. */
async function readErrorFor(title: string): Promise<string> {
  await vi.waitFor(() => {
    const found = [...container.querySelectorAll('h3')].some((e) => e.textContent === title);
    expect(found, `the ErrorState titled "${title}" never rendered`).toBe(true);
  });
  const h3 = [...container.querySelectorAll('h3')].find((e) => e.textContent === title)!;
  return h3.nextElementSibling?.textContent ?? '';
}

// The error branch returns EARLY and renders the ErrorState alone, so every
// button in the container belongs to it. Counting all of them is stricter than
// matching the retry label, which a future restyle could reword.
const buttonCount = () => container.querySelectorAll('button').length;

describe('the lockout RENDERS its own copy and offers no retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });

  for (const lang of ['ar', 'en', 'fr'] as const) {
    it(`${lang}: the conflict renders the lockout title and body ALONE`, async () => {
      h.getStats.mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
      h.getRecentActivity.mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
      mountDashboard(lang);

      const msg = await readErrorFor(strings[lang].accountLockedTitle);

      // EQUALITY, never toContain: a concatenated fragment would satisfy
      // toContain, and that is exactly the regression being guarded.
      expect(msg).toBe(strings[lang].accountLockedBody);
      // The specific lie this PR exists to remove, named so a revert is loud.
      expect(msg).not.toBe(strings[lang].dashboardConnectionError);
      expect([...container.querySelectorAll('h3')].map((e) => e.textContent)).not.toContain(
        strings[lang].connectionError
      );
    });
  }

  it('AR: the RENDERED body carries the approved code points and no bidi control', async () => {
    h.getStats.mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
    h.getRecentActivity.mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
    mountDashboard('ar');

    const msg = await readErrorFor(strings.ar.accountLockedTitle);
    // The DOM is measured, not just the catalog: a call site could still splice
    // something in between the catalog and the screen.
    expect(cps(msg)).toEqual(AR_EXPECTED.accountLockedBody);
    expect(cps(msg).filter(isCtrl)).toEqual([]);
    expect(msg).toMatch(/support@scan-action\.com$/);
  });

  it('the lockout offers NO button at all', async () => {
    h.getStats.mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
    h.getRecentActivity.mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
    mountDashboard('ar');
    await readErrorFor(strings.ar.accountLockedTitle);

    // ErrorState renders its retry button only when onRetry is supplied
    // (ErrorState.tsx:23), so an omitted prop means no button in this subtree.
    expect(buttonCount(), 'a retry button survived the lockout').toBe(0);
    expect(container.textContent).not.toContain(strings.ar.tryAgain);
  });

  // ── The mutations that leave the screen LOOKING right ────────────────────
  it('a 409 arriving WITHOUT the code keeps the connection copy AND the retry', async () => {
    // errorHandler.ts:46 emits exactly this for a bare P2002 409, and a proxy
    // can produce its own conflict page. Keying on STATUS instead of the code
    // would swallow it into the terminal state and strand a user whose retry
    // would have worked.
    const bare = 'Conflict: A record with that unique value already exists.';
    h.getStats.mockRejectedValue(new Error(bare));
    h.getRecentActivity.mockRejectedValue(new Error(bare));
    mountDashboard('ar');

    const msg = await readErrorFor(strings.ar.connectionError);
    expect(msg).toBe(strings.ar.dashboardConnectionError);
    expect(buttonCount(), 'the retry was removed from a retryable failure').toBe(1);
  });

  it('an ordinary transient failure is untouched: connection copy AND retry', async () => {
    h.getStats.mockRejectedValue(new TypeError('Failed to fetch'));
    h.getRecentActivity.mockRejectedValue(new TypeError('Failed to fetch'));
    mountDashboard('ar');

    const msg = await readErrorFor(strings.ar.connectionError);
    expect(msg).toBe(strings.ar.dashboardConnectionError);
    expect(buttonCount()).toBe(1);
  });

  it('the conflict wins over a partial success, because it is a SESSION property', async () => {
    // The middleware raises it before any route handler runs, so one call
    // proving it is enough. Precedence pinned deliberately: without this, a
    // reorder of the branches would quietly restore the metrics copy.
    h.getStats.mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
    h.getRecentActivity.mockResolvedValue([]);
    mountDashboard('ar');

    const msg = await readErrorFor(strings.ar.accountLockedTitle);
    expect(msg).toBe(strings.ar.accountLockedBody);
    expect(msg).not.toBe(strings.ar.dashboardMetricsUnavailable);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. DELETE PATH — the same code, a different transport.
// ────────────────────────────────────────────────────────────────────────────
describe('the delete path translates the code instead of telling the user to retry', () => {
  const t = (lang: 'en' | 'fr' | 'ar') =>
    translateAccountError(IDENTITY_EMAIL_CONFLICT, strings[lang] as Record<string, string>);

  it('maps IDENTITY_EMAIL_CONFLICT to its OWN string in all three locales', () => {
    for (const lang of ['en', 'fr', 'ar'] as const) {
      expect(t(lang)).toBe(strings[lang].deleteAccountIdentityConflict);
    }
  });

  it('does NOT reuse the dashboard lockout copy, which never names the deletion', () => {
    for (const lang of ['en', 'fr', 'ar'] as const) {
      expect(t(lang)).not.toBe(strings[lang].accountLockedBody);
    }
  });

  it('the two strings cannot be transposed: the DASHBOARD still gets its own', () => {
    // Both are correct for this one condition, so a swap would read plausibly on
    // either screen and break neither. Pinning both directions is what makes the
    // pair non-interchangeable.
    for (const lang of ['en', 'fr', 'ar'] as const) {
      expect(strings[lang].accountLockedBody).not.toBe(
        strings[lang].deleteAccountIdentityConflict
      );
    }
  });

  it('no longer falls through to "please try again", the one useless instruction', () => {
    for (const lang of ['en', 'fr', 'ar'] as const) {
      expect(t(lang)).not.toBe(strings[lang].deleteAccountError);
    }
  });

  it('the copy the modal renders carries the address and refuses the retry phrase', () => {
    // Read through the translator, not off the catalog: this is what
    // DeleteAccountModal.tsx:142 actually puts in the DOM.
    for (const lang of ['en', 'fr', 'ar'] as const) {
      expect(t(lang)).toMatch(/support@scan-action\.com$/);
      expect(t(lang)).not.toMatch(RETRY_PHRASE);
    }
  });

  it('AR: the translated string is the approved code points, byte for byte', () => {
    expect(cps(t('ar'))).toEqual(AR_EXPECTED.deleteAccountIdentityConflict);
    expect(cps(t('ar')).filter(isCtrl)).toEqual([]);
  });

  it('the whitelist still absorbs everything else exactly as before', () => {
    const s = strings.ar as Record<string, string>;
    expect(translateAccountError('SHARED_WORKSPACE', s)).toBe(strings.ar.deleteAccountSharedWorkspace);
    expect(translateAccountError('RATE_LIMITED', s)).toBe(strings.ar.deleteAccountRateLimited);
    expect(translateAccountError('DELETE_FAILED', s)).toBe(strings.ar.deleteAccountError);
    expect(translateAccountError('Internal Server Error', s)).toBe(strings.ar.deleteAccountError);
    expect(translateAccountError(null, s)).toBe(strings.ar.deleteAccountError);
  });
});
