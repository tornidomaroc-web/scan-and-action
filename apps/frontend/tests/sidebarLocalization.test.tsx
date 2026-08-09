import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// DESKTOP SIDEBAR — the two English leaks, and the account-name direction
// ============================================================================
// Three things this file guards, all in one component, all changed together:
//
//   1. Sidebar.tsx:107  "New Scan"          -> {s.newScan}
//   2. Sidebar.tsx:213  'Checking Plan...'  -> {s.verifyingAccount}
//   3. Sidebar.tsx:210  the truncating account name -> dir="auto"
//
// WHY A RENDER TEST FOR (1) AND (2). noHardcodedUserFacingText.test.ts scans four
// SINKS (showToast / setError / setErrorMsg / setResetNotice); a bare literal in
// JSX text is structurally outside it, and its own header at :224 lists
// `Sidebar.tsx:107 "New Scan"` as a leak the census found and deliberately did
// not fix. renderScreens.test.tsx mounts this component but only asserts that
// certain catalog strings are PRESENT — it never asserts English is absent. So
// both literals were invisible to CI by construction. A render assertion is the
// layer that sees them, which is the same reason processingToastRenderI18n and
// edgeLeakLocalization exist.
//
// NOT ASSERTED AS CODE POINTS, unlike edgeLeakLocalization.test.tsx. That file
// presents NEW Arabic wording as numbers because glyphs cannot be reviewed in a
// terminal. Nothing new is worded here: both keys already existed and were
// already approved (`newScan` since the dashboard quick actions, and
// `verifyingAccount` from UploadModal.tsx:85). The claim under test is "the call
// site reads the catalog", so comparing against `strings.ar.*` is the right
// assertion and a code-point copy would only create a second place to drift.
//
// WHY (3) IS GUARDED HERE. tests/rtlTruncation.test.ts cannot see that line, and
// twice over — its TRUNCATING_ELEMENT keys on the `truncate` CLASS token while
// this box truncates via inline style, and `userName` is deliberately outside its
// USER_DATA allowlist because the identifier could equally name an i18n label.
// That file says such cases belong "per-screen at the DOM level, where a human
// decided which it is" (:96-97). This is that place. SettingsScreen's copy of the
// same value is guarded the same way, in settingsPreferences.test.tsx:167.
//
// HONEST LIMIT: green means the attribute is PRESENT and the strings come from
// the catalog. It does not mean the ellipsis lands on the correct end — jsdom has
// no layout engine and resolves no bidi. The only live proof of the truncation
// direction in this app came from narrowing /activity by hand in Chrome.
// ============================================================================

const EMAIL = 'abojad.longname@example.com';
const LOCAL_PART = 'abojad.longname';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'ff000000-0000-4000-8000-000000000001', email: EMAIL },
    session: null,
    loading: false,
    signOut: vi.fn(async () => {}),
  }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { Sidebar } from '../src/components/Sidebar';

let container: HTMLDivElement;
let root: Root;

function mount(plan?: 'FREE' | 'PRO') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Sidebar onNewScan={() => {}} plan={plan} onRefreshPlan={() => {}} />
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

function unmount() {
  root.unmount();
  container.remove();
}

describe('Sidebar — the primary action reads the catalog, in every locale', () => {
  afterEach(unmount);

  for (const lang of ['en', 'fr', 'ar'] as const) {
    it(`${lang}: renders strings.${lang}.newScan and never the literal "New Scan"`, () => {
      localStorage.clear();
      localStorage.setItem('lang', lang);
      mount('PRO');
      expect(container.textContent).toContain(strings[lang].newScan);
      if (lang !== 'en') {
        // en's catalog value is "New scan" (lower-case s), so the old literal is
        // still distinguishable from a correct render in every locale.
        expect(container.textContent).not.toContain('New Scan');
      }
    });
  }
});

describe('Sidebar — the unresolved-plan label reads the catalog', () => {
  afterEach(unmount);

  it('AR: plan undefined renders strings.ar.verifyingAccount, not "Checking Plan..."', () => {
    localStorage.clear();
    localStorage.setItem('lang', 'ar');
    // `plan` is undefined on every first paint until Layout.tsx:30 resolves it,
    // which is exactly the window the English literal was visible in.
    mount(undefined);
    expect(container.textContent).toContain(strings.ar.verifyingAccount);
    expect(container.textContent).not.toContain('Checking Plan');
  });

  it('AR: a resolved plan still renders its own label, not the checking state', () => {
    // Guards against the substitution being made unconditionally.
    localStorage.clear();
    localStorage.setItem('lang', 'ar');
    mount('PRO');
    expect(container.textContent).toContain(strings.ar.proPlan);
    expect(container.textContent).not.toContain(strings.ar.verifyingAccount);
  });
});

describe('Sidebar identity row — direction is stated, not inherited (Class B)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('lang', 'ar');
    document.documentElement.dir = 'rtl';
    mount('PRO');
  });

  afterEach(() => {
    unmount();
    document.documentElement.dir = 'ltr';
  });

  const nameEl = () =>
    [...container.querySelectorAll('p')].find((p) => p.textContent === LOCAL_PART);

  it('AR: the account-name <p> carries dir="auto"', () => {
    const p = nameEl();
    expect(p, 'the identity row should render the account name').toBeTruthy();
    expect(p!.getAttribute('dir')).toBe('auto');
  });

  it('AR: that <p> really is a truncating box, so it is in the hazard context', () => {
    // Anchors the assertion above to the reason it exists. This box truncates via
    // inline style rather than the `truncate` class — the exact reason the
    // app-wide source guard cannot see it.
    const p = nameEl()!;
    expect(p.style.textOverflow).toBe('ellipsis');
    expect(p.style.whiteSpace).toBe('nowrap');
    expect(p.style.overflow).toBe('hidden');
  });

  it('AR: the document really is RTL', () => {
    expect(document.documentElement.dir).toBe('rtl');
  });
});
