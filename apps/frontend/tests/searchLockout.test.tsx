import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// ============================================================================
// Search adopts the IDENTITY_EMAIL_CONFLICT classifier — and the autorun path
// is the point of this file.
// ============================================================================
// submitQuery used to return a boolean, and handlePromptClick relabelled on
// `!success`. So a lockout classified inside submitQuery was immediately
// OVERWRITTEN with s.autoRunFailed ("Press search to continue") on the autorun
// path — telling a locked user to try again, above a live retry button. The
// return type is now a three-state outcome and the caller relabels only on
// 'error'.
//
// A test that drives only the direct-search path CANNOT see that bug: the
// direct path never passes through the relabel. The autorun cases below are the
// only coverage of it, and they are reached through the one autorun prompt the
// UI actually has — the "Recent activity" gallery card (SearchScreen.tsx:131).
//
// Both directions are guarded on purpose. Without the ordinary-failure autorun
// case, the lockout case could be satisfied by deleting the relabel entirely.
// ============================================================================

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'search-lock@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../src/services/searchService', () => ({
  searchService: { executeQuery: vi.fn() },
}));

import { strings } from '../src/i18n/strings';
import { searchService } from '../src/services/searchService';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { SearchScreen } from '../src/screens/SearchScreen';
import { IDENTITY_EMAIL_CONFLICT } from '../src/lib/identityConflict';

const s = strings.en;

let container: HTMLDivElement;
let root: Root;

function mount() {
  localStorage.setItem('lang', 'en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/search']}>
          <SearchScreen />
        </MemoryRouter>
      </LanguageProvider>
    );
  });
}

const click = (el: Element) =>
  flushSync(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

/** The ErrorState card only — the search form and gallery sit outside it. */
const errorCard = () => container.querySelector('[class*="border-danger"]');

/** The one autorun prompt in the UI: the "Recent activity" gallery card. */
const autorunCard = () =>
  [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(s.recentActivity)
  );

/** Drive the DIRECT search path: type a query, submit the form. */
function directSearch(query: string) {
  const input = container.querySelector('input') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  flushSync(() => {
    setter.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const form = container.querySelector('form') as HTMLFormElement;
  flushSync(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => {
  root.unmount();
  container.remove();
});

// ── THE AUTORUN PATH — the coverage this PR exists to add ────────────────────

describe('Search — the autorun prompt does not relabel a lockout', () => {
  it('a lockout reached through the autorun card keeps the lockout copy and offers no button', async () => {
    (searchService.executeQuery as any).mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
    mount();

    const card = autorunCard();
    expect(card, 'the autorun gallery card must be rendered').toBeTruthy();
    click(card!);

    await vi.waitFor(() => expect(container.textContent).toContain(s.accountLockedTitle));
    expect(container.textContent).toContain(s.accountLockedBody);
    // The clobber: if the caller relabels on anything other than 'error', this
    // is the assertion that fails, and NOTHING on the direct-search path can.
    expect(container.textContent).not.toContain(s.autoRunFailed);
    expect(container.textContent).not.toContain(s.searchFailed);
    expect(errorCard()!.querySelectorAll('button').length).toBe(0);
    expect(container.textContent).not.toContain(s.tryAgain);
  });

  it('an ORDINARY autorun failure still relabels, and keeps its retry', async () => {
    // Direction guard. Without this, the case above is satisfied by deleting the
    // relabel outright, which would silently drop the autorun-specific copy.
    (searchService.executeQuery as any).mockRejectedValue(new Error('Server error during search execution'));
    mount();

    click(autorunCard()!);

    await vi.waitFor(() => expect(container.textContent).toContain(s.autoRunFailed));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
    expect(container.textContent).toContain(s.tryAgain);
    expect(errorCard()!.querySelectorAll('button').length).toBe(1);
  });
});

// ── THE DIRECT SEARCH PATH ───────────────────────────────────────────────────

describe('Search — the direct path', () => {
  it('a lockout renders the lockout copy with NO button', async () => {
    (searchService.executeQuery as any).mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
    mount();

    directSearch('what did I spend');

    await vi.waitFor(() => expect(container.textContent).toContain(s.accountLockedTitle));
    expect(container.textContent).toContain(s.accountLockedBody);
    expect(container.textContent).not.toContain(s.searchFailed);
    expect(errorCard()!.querySelectorAll('button').length).toBe(0);
  });

  it('an ordinary failure is UNTOUCHED: its own copy AND its retry', async () => {
    (searchService.executeQuery as any).mockRejectedValue(new Error('Server error during search execution'));
    mount();

    directSearch('what did I spend');

    await vi.waitFor(() => expect(container.textContent).toContain(s.searchFailed));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
    expect(container.textContent).toContain(s.tryAgain);
    expect(errorCard()!.querySelectorAll('button').length).toBe(1);
  });

  it('a DIFFERENT 409 code does NOT lock — the rule is exact code, never status', async () => {
    (searchService.executeQuery as any).mockRejectedValue(new Error('SHARED_WORKSPACE'));
    mount();

    directSearch('what did I spend');

    await vi.waitFor(() => expect(container.textContent).toContain(s.searchFailed));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
    expect(container.textContent).toContain(s.tryAgain);
  });

  it('a lookalike code does not lock either', async () => {
    (searchService.executeQuery as any).mockRejectedValue(new Error('IDENTITY_EMAIL_CONFLICT_V2'));
    mount();

    directSearch('what did I spend');

    await vi.waitFor(() => expect(container.textContent).toContain(s.searchFailed));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
  });
});
