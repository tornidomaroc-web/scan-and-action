import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ============================================================================
// Activity adopts the IDENTITY_EMAIL_CONFLICT classifier.
// ============================================================================
// Activity is the SIMPLEST of the four adoptions and this file says so rather
// than pretending otherwise: one fetch, one failure surface, no toast, no
// action path, and no second caller that could relabel what the classifier
// decided. There is no analogue of Search's autorun clobber here, because there
// is no second path to clobber from.
//
// What that changes about the test shape: the mutants below are expected to be
// caught by FEWER assertions than on Search or Queue — not because the coverage
// is thinner, but because the surface is. The value of the file is the exact-
// code guard and the direction guard, both of which are real here.
//
// The screen is still driven through its rendered output, never by invoking
// fetchActivity directly: the error card is only reachable if the effect runs
// and the branch is chosen, and asserting on the DOM is what proves that.
// ============================================================================

const h = vi.hoisted(() => ({ getAllActivity: vi.fn() }));
vi.mock('../src/services/documentService', () => ({
  documentService: { getAllActivity: h.getAllActivity },
}));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ActivityScreen } from '../src/screens/ActivityScreen';
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
        <MemoryRouter initialEntries={['/activity']}>
          <Routes>
            <Route path="/activity" element={<ActivityScreen />} />
            <Route path="/documents/:id" element={<div>DOC-STUB</div>} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    );
  });
}

/** The ErrorState card only — nothing else on this screen uses the danger border. */
const errorCard = () => container.querySelector('[class*="border-danger"]');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // The screen logs the caught value on every branch by design. Silence it so a
  // deliberate rejection does not print as a failure; the assertion that the log
  // survives is in its own test below, which installs its own spy.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  root.unmount();
  container.remove();
});

describe('Activity — the one failure surface', () => {
  it('a lockout renders the lockout copy and offers NO button', async () => {
    h.getAllActivity.mockRejectedValue(new Error(IDENTITY_EMAIL_CONFLICT));
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.accountLockedTitle));
    expect(container.textContent).toContain(s.accountLockedBody);
    // The ordinary copy must be GONE, not merely accompanied.
    expect(container.textContent).not.toContain(s.failedActivity);
    // The whole point: a retry that cannot succeed is not offered.
    expect(errorCard()!.querySelectorAll('button').length).toBe(0);
    expect(container.textContent).not.toContain(s.tryAgain);
  });

  it('an ORDINARY failure is UNTOUCHED: its own copy AND its retry', async () => {
    // Direction guard. Without this, the case above is satisfiable by replacing
    // the error branch outright, which would drop the retry for every ordinary
    // failure on this screen — the one regression this adoption could cause.
    h.getAllActivity.mockRejectedValue(new Error('Failed to load activity history'));
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.failedActivity));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
    expect(container.textContent).not.toContain(s.accountLockedBody);
    expect(container.textContent).toContain(s.tryAgain);
    expect(errorCard()!.querySelectorAll('button').length).toBe(1);
  });

  it('the retry on an ordinary failure re-fetches and can RECOVER the screen', async () => {
    // Proves the non-locked button is wired to a live fetch, so "a button is
    // rendered" above is a claim about a working retry and not just markup.
    h.getAllActivity.mockRejectedValueOnce(new Error('Failed to load activity history'));
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.tryAgain));

    h.getAllActivity.mockResolvedValueOnce([]);
    const retry = errorCard()!.querySelector('button') as HTMLButtonElement;
    flushSync(() => retry.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    await vi.waitFor(() => expect(container.textContent).toContain(s.noActivity));
    expect(container.textContent).not.toContain(s.failedActivity);
    expect(h.getAllActivity).toHaveBeenCalledTimes(2);
  });
});

describe('Activity — the rule is EXACT code, never status', () => {
  it('a different 409 code does NOT lock', async () => {
    h.getAllActivity.mockRejectedValue(new Error('SHARED_WORKSPACE'));
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.failedActivity));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
    expect(container.textContent).toContain(s.tryAgain);
  });

  it('a SUPERSTRING of the code does not lock either', async () => {
    // The mutant this exists for: `===` widened to `.includes()`. Every other
    // negative case on this screen is a non-superstring and stays green under
    // that widening, so this is the only assertion here that fails.
    h.getAllActivity.mockRejectedValue(new Error('IDENTITY_EMAIL_CONFLICT_V2'));
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.failedActivity));
    expect(container.textContent).not.toContain(s.accountLockedTitle);
    expect(errorCard()!.querySelectorAll('button').length).toBe(1);
  });
});

describe('Activity — the caught value is still logged on the locked branch', () => {
  it('logs the lockout, because a lockout on a plain read is the anomaly', async () => {
    // Ruled deliberately, not inherited: the log is NOT a durable trace —
    // console breadcrumbs are disabled at the SDK (src/sentry.ts,
    // `breadcrumbsIntegration({ console: false })`), so nothing here reaches
    // Sentry and the line dies with the tab. It is kept because suppressing it
    // would mean adding a branch that buys nothing, and it is guarded here so a
    // later "tidy the console" pass cannot silently drop the locked branch only.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const thrown = new Error(IDENTITY_EMAIL_CONFLICT);
    h.getAllActivity.mockRejectedValue(thrown);
    mount();

    await vi.waitFor(() => expect(container.textContent).toContain(s.accountLockedTitle));
    expect(spy).toHaveBeenCalledWith('[Activity] Fetch failed:', thrown);
  });
});
