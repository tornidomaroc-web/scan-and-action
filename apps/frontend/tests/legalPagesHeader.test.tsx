import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { PrivacyPolicy } from '../src/screens/PrivacyPolicy';
import { TermsOfService } from '../src/screens/TermsOfService';
import { RefundPolicy } from '../src/screens/RefundPolicy';
import { DeleteAccountInfo } from '../src/screens/DeleteAccountInfo';

// ============================================================================
// THE FOUR LEGAL ROUTES HAVE A HEADER, AND ARE NOT PINNED.
// ============================================================================
// Measured on production 2026-09-12, before this change: on /privacy,
// `document.querySelector('header')` and `a[href="/"]` both returned null. A
// visitor who tapped a footer link landed with no header, no logo and no way
// back.
//
// ── WHY THESE ROUTES ARE NOT PINNED, WHICH IS THE OPPOSITE OF /  ───────────
// These pages set NO background of their own. `body` paints them from
// `var(--background)` -> `--sa-surface`, which flips #F5F7FA -> #0F172A, and
// each page carries its own `dark:` variants. So they are ALREADY correct in
// dark mode, and the header agrees with them — measured, #1E293B header on a
// #0F172A body is 1.22, no seam.
//
// `sa-pin-light` would BREAK them. The pin sits on an element inside `body`,
// but `body`'s own background resolves outside that subtree, so the pin would
// hold the header at #FFFFFF while the page stayed #0F172A — a 17.85 seam, the
// exact thing #211 removed from the landing route — and `dark:text-slate-200`
// would still fire on pinned white surfaces at 1.23:1. The pin is the right
// tool for a light-only page. These are not light-only pages.
//
// What CI cannot do here is the same as in landingLightPin.test.tsx: jsdom
// applies no stylesheet and resolves no var(), so nothing below proves a
// colour. The per-route browser measurements are in the PR body. This file
// pins the STRUCTURE and the two decisions.
// ============================================================================

const CWD = process.cwd(); // vitest runs with cwd = apps/frontend

const ROUTES = [
  ['/privacy', 'PrivacyPolicy', PrivacyPolicy],
  ['/terms', 'TermsOfService', TermsOfService],
  ['/refund', 'RefundPolicy', RefundPolicy],
  ['/delete-account', 'DeleteAccountInfo', DeleteAccountInfo],
] as const;

const source = (name: string) =>
  readFileSync(join(CWD, 'src', 'screens', `${name}.tsx`), 'utf8');

/** Source with comments stripped — every one of these files NAMES `sa-pin-light`
 *  and `dark:` in prose explaining why they are absent/present. A naive scan
 *  reads the explanation as the code. */
const code = (name: string) =>
  source(name)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

let container: HTMLDivElement;
let root: Root;
const render = (el: React.ReactElement) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root.render(<MemoryRouter>{el}</MemoryRouter>));
};
afterEach(() => {
  root?.unmount();
  container?.remove();
});

describe.each(ROUTES)('%s', (path, name, Screen) => {
  it('renders a <header>', () => {
    render(<Screen />);
    expect(container.querySelector('header')).not.toBeNull();
  });

  it('the way back is a link to "/" carrying the mark and the wordmark', () => {
    // Asserted as an AFFORDANCE, not as "a header exists": the complaint was
    // that there is no way back to the landing page, and this is it.
    render(<Screen />);
    const home = container.querySelector('header a[href="/"]') as HTMLAnchorElement | null;
    expect(home, 'no link to / in the header — there is still no way back').not.toBeNull();
    expect(home!.getAttribute('aria-label')).toMatch(/home/i);
    expect(home!.querySelector('svg'), 'the mark should be inside the home link').not.toBeNull();
    expect(home!.textContent).toContain('Scan&Action');
  });

  it('renders NO centre anchors, because their targets do not exist here', () => {
    // `#how-it-works` and `#pricing` are landing-page sections. An anchor to a
    // missing id scrolls nowhere and reports no error.
    render(<Screen />);
    expect(container.querySelector('header nav')).toBeNull();
    for (const href of ['#how-it-works', '#pricing']) {
      expect(container.querySelector(`a[href="${href}"]`), `${href} resolves to nothing here`).toBeNull();
    }
    expect(container.querySelector('#how-it-works')).toBeNull();
    expect(container.querySelector('#pricing')).toBeNull();
  });

  it('the header comes before the page content in the tree', () => {
    // MemoryRouter renders no DOM element, so the screen's fragment children
    // ARE container.children — header first, then the content wrapper.
    render(<Screen />);
    const kids = [...container.children];
    expect(kids.map((k) => k.tagName.toLowerCase())).toEqual(['header', 'div']);
    expect(kids[1].className).toContain('max-w-4xl');
  });

  it('passes showAnchors={false} explicitly rather than relying on a default', () => {
    expect(code(name)).toMatch(/<LandingHeader\s+showAnchors=\{false\}\s*\/>/);
  });

  it('is NOT pinned — sa-pin-light must not appear in the code', () => {
    // The ruling. Pinning would put a #FFFFFF header on a #0F172A body (17.85)
    // and fire dark:text-slate-200 on white (1.23:1).
    expect(code(name)).not.toContain('sa-pin-light');
  });

  it('keeps its own dark: variants, which is WHY it needs no pin', () => {
    const v = code(name).match(/dark:[^\s"']+/g) ?? [];
    expect(v.length, 'this page lost its dark: variants; it can no longer be dark-correct').toBeGreaterThan(0);
    expect(v).toContain('dark:text-slate-200');
  });
});

describe('the two policies do not drift into each other', () => {
  it('the landing route IS pinned and the four legal routes are NOT', () => {
    // Stated as one assertion so the contrast is visible in the failure output.
    const landing = readFileSync(join(CWD, 'src', 'screens', 'LandingScreen.tsx'), 'utf8');
    expect(landing).toContain('sa-pin-light');
    const pinned = ROUTES.filter(([, n]) => code(n).includes('sa-pin-light')).map(([p]) => p);
    expect(pinned).toEqual([]);
  });

  it('and the scanner can tell them apart (positive control)', () => {
    // Without this, a broken `code()` returning '' would make every
    // "not pinned" assertion above pass vacuously.
    const landing = readFileSync(join(CWD, 'src', 'screens', 'LandingScreen.tsx'), 'utf8');
    expect(landing).toContain('sa-pin-light');
    expect(code('PrivacyPolicy').length).toBeGreaterThan(500);
  });
});
