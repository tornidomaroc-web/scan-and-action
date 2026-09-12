import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { LandingScreen } from '../src/screens/LandingScreen';
import { HEADER_ANCHORS } from '../src/components/LandingHeader';

// ============================================================================
// THE LANDING PAGE HAS A HEADER.
// ============================================================================
// Measured on the served page 2026-09-12, before this change:
//
//     document.querySelector('header') -> null
//     document.querySelector('nav')    -> null
//     links in the top 120px           -> []
//
// The page opened directly on a headline with nothing above it. All five
// competitor landing pages captured that day carry a header, because it is what
// makes a page read as a company rather than as something someone deployed.
//
// WHAT THIS FILE PINS, beyond "a header exists":
//   - the anchors point at sections that ACTUALLY EXIST on this page. An anchor
//     to a missing id scrolls nowhere and reports no error, which is exactly the
//     write-key/read-key failure this repo has hit three times in other guises.
//   - both actions route to /login, the one place signup lives.
//   - the accent does not appear in the header. #208 confined #635BFF to the
//     headline's second line and that has to survive new chrome.
//   - the anchored sections carry `scroll-mt` matching the header height, so a
//     sticky bar does not land on top of the heading it just scrolled to.
// ============================================================================

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const headerSrcRaw = read('../src/components/LandingHeader.tsx');
// Strip comments before scanning. The component's own doc comment NAMES the
// colours it deliberately avoids, and a naive source scan reads that as a
// violation — the check would fail on the explanation rather than the code.
const headerSrc = headerSrcRaw.replace(/\/\*[\s\S]*?\*\//g, '').split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(String.fromCharCode(10));
const landingSrc = read('../src/screens/LandingScreen.tsx');
// vitest runs with cwd = apps/frontend, so this needs no URL resolution at all.
const SRC_DIR = join(process.cwd(), 'src');
const filesMentioning = (needle: string): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/[.]tsx?$/.test(e.name) && readFileSync(p, 'utf8').includes(needle)) out.push(p);
    }
  };
  walk(SRC_DIR);
  return out.map((p) => p.slice(SRC_DIR.length + 1).split(String.fromCharCode(92)).join('/'));
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root.render(<MemoryRouter><LandingScreen /></MemoryRouter>));
});
afterEach(() => { root.unmount(); container.remove(); });

const header = () => container.querySelector('header')!;

describe('the header exists and carries what it should', () => {
  it('a <header> element is rendered', () => {
    expect(header()).not.toBeNull();
  });

  it('the logo is present at the left and links home', () => {
    const logo = header().querySelector('a')!;
    expect(logo).not.toBeNull();
    expect(logo.getAttribute('href')).toBe('/');
    expect(logo.getAttribute('aria-label')).toMatch(/home/i);
    // the mark itself — an inline <svg> from BrandMark, never an <img>: the
    // mark must not be a second network request that can 404 into the SPA
    // fallback, and brandMark.test.tsx pins which CUT a size-30 call renders.
    expect(logo.querySelector('svg')).not.toBeNull();
  });

  it('both centre anchors are rendered, in order', () => {
    const anchors = [...header().querySelectorAll('nav a')].map((a) => ({
      href: a.getAttribute('href'),
      label: a.textContent!.trim(),
    }));
    expect(anchors).toEqual([
      { href: '#how-it-works', label: 'How it works' },
      { href: '#pricing', label: 'Pricing' },
    ]);
  });

  it('both actions are rendered and BOTH route to /login', () => {
    const actions = [...header().querySelectorAll('a')]
      .filter((a) => /Log in|Start free/.test(a.textContent || ''))
      .map((a) => ({ label: a.textContent!.trim(), href: a.getAttribute('href') }));
    expect(actions).toEqual([
      { label: 'Log in', href: '/login' },
      { label: 'Start free', href: '/login' },
    ]);
  });
});

describe('the anchors point at sections that exist', () => {
  it.each(HEADER_ANCHORS.map((a) => a.href))('%s resolves to a real element on this page', (href) => {
    const id = href.slice(1);
    const target = container.querySelector(`#${id}`);
    expect(target, `no element with id "${id}" — this anchor scrolls nowhere`).not.toBeNull();
  });

  it('and a made-up anchor does NOT resolve', () => {
    // The positive control. Without it, the assertion above would pass just as
    // happily if querySelector were returning something for everything.
    expect(container.querySelector('#no-such-section')).toBeNull();
  });

  it('each anchored section carries scroll-mt so the sticky bar does not cover its heading', () => {
    for (const a of HEADER_ANCHORS) {
      const el = container.querySelector(a.href)!;
      expect(el.className, `${a.href} has no scroll-mt`).toMatch(/scroll-mt-/);
    }
  });
});

describe('the header is sticky, layered, and introduces no colour', () => {
  it('is sticky at the top on the named chrome layer', () => {
    const cls = header().className;
    expect(cls).toContain('sticky');
    expect(cls).toContain('top-0');
    // z-chrome is the token ladder's own name for a layout header.
    expect(cls).toContain('z-chrome');
  });

  it('uses token surfaces only — no raw palette anywhere in the component', () => {
    expect(headerSrc).not.toMatch(/\b(?:bg|text|border)-(?:slate|gray|blue|indigo|violet|sky|zinc)-\d{2,3}\b/);
  });

  it('the accent appears nowhere in the header', () => {
    // #208 confined #635BFF to the headline's second line. New chrome must not
    // reintroduce it, and must not put it on a fill.
    expect([...header().querySelectorAll('[class*="accent"]')]).toHaveLength(0);
    expect(headerSrc).not.toContain('accent');
  });

  it('the one filled action is on --sa-ink, matching the hero CTA', () => {
    const filled = [...header().querySelectorAll('a')].find((a) => /Start free/.test(a.textContent || ''))!;
    expect(filled.className).toContain('bg-ink');
  });

  it('the filled action pairs TWO TOKENS — never a token background with a literal foreground', () => {
    // `bg-ink text-white` was 1.05:1 in dark mode: bg-ink inverts under .dark and
    // text-white cannot. That is fine only on a route pinned light, and this
    // header now mounts on four routes that are deliberately NOT pinned. The
    // foreground must therefore invert with the background.
    const filled = [...header().querySelectorAll('a')].find((a) => /Start free/.test(a.textContent || ''))!;
    expect(filled.className).toContain('text-surface-raised');
    for (const literal of ['text-white', 'text-black']) {
      expect(filled.className, `${literal} cannot invert; pair a token instead`).not.toContain(literal);
    }
  });
});

describe('what the header does at phone width', () => {
  // jsdom evaluates no media queries, so this asserts the CLASSES that decide
  // the behaviour rather than claiming to have measured 430px. The real 430px
  // reading is in the PR body, taken in a browser.
  it('the centre anchors are hidden below `sm`, the logo and both actions are not', () => {
    const nav = header().querySelector('nav')!;
    expect(nav.className).toContain('hidden');
    expect(nav.className).toContain('sm:flex');
    for (const a of [...header().querySelectorAll('a')]) {
      if (nav.contains(a)) continue;
      expect(a.className).not.toContain('hidden');
    }
  });
});

describe('the header is unregistered-routes-only', () => {
  // WIDENED DELIBERATELY in the legal-pages PR, from ['screens/LandingScreen.tsx']
  // to the five unregistered screens. The list is still WALKED, not asserted from
  // a literal — a hardcoded array would pass no matter what the tree contains —
  // and the guard's real job is unchanged: the header must not reach the app
  // shell, where Sidebar and BottomTabBar already own the chrome.
  const UNREGISTERED = [
    'screens/DeleteAccountInfo.tsx',
    'screens/LandingScreen.tsx',
    'screens/PrivacyPolicy.tsx',
    'screens/RefundPolicy.tsx',
    'screens/TermsOfService.tsx',
  ];

  it('exactly the five unregistered screens import it', () => {
    const importers = filesMentioning('LandingHeader')
      .filter((p) => p !== 'components/LandingHeader.tsx')
      .sort();
    expect(importers).toEqual([...UNREGISTERED].sort());
  });

  it('and NOT the app shell or any authenticated screen', () => {
    // The positive assertion above already implies this, but only while the
    // literal list stays correct. This states the invariant directly, so
    // widening the list again cannot quietly re-admit the shell.
    const AUTHENTICATED = [
      'components/Layout.tsx', 'components/Sidebar.tsx', 'components/BottomTabBar.tsx',
      'screens/DashboardScreen.tsx', 'screens/SettingsScreen.tsx', 'screens/SearchScreen.tsx',
      'screens/ActivityScreen.tsx', 'screens/ReviewQueueScreen.tsx',
      'screens/DocumentDetailScreen.tsx', 'screens/AuthScreen.tsx',
    ];
    const importers = filesMentioning('LandingHeader');
    for (const p of AUTHENTICATED) {
      expect(importers, `${p} must not mount the landing header`).not.toContain(p);
    }
  });

  it('this page still mounts no portal and no overlay, so the ladder is untouched', () => {
    // The sticky header sits on z-chrome. That is only safe because this page
    // participates in neither the modal ladder nor the back-button LIFO.
    expect(landingSrc).not.toContain('createPortal');
    expect(landingSrc).not.toContain('overlayStack');
    expect(landingSrc).not.toContain('useBackDismiss');
  });
});
