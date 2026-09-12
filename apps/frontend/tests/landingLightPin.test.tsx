import { describe, it, expect } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { LandingScreen } from '../src/screens/LandingScreen';

// ============================================================================
// THE LANDING ROUTE IS PINNED TO ITS LIGHT TOKEN VALUES.
// ============================================================================
// WHAT THIS FILE CANNOT PROVE, said first so no assertion below is mistaken for
// more than it is: jsdom does not apply linked stylesheets, does not resolve
// var(), and has no cascade for custom properties. Nothing here can show that a
// button's background actually changed colour. THE PROOF THAT THE FIX WORKS IS
// A BROWSER MEASUREMENT, recorded in the PR body, taken with transitions
// disabled — a hidden tab does not advance the animation clock, so
// `transition-all` hands back stale pre-flip values that look clean,
// reproducible and false. That trap produced a completely wrong reading of this
// same defect during diagnosis.
//
// WHAT THIS FILE DOES OWN, and it is the half that rots:
//   1. the pinned values are byte-identical to `:root` — no colour is invented;
//   2. the pinned SET is exactly the differing tokens the route reaches, both
//      sides RECOMPUTED from source, so adding a token utility to the landing
//      page without pinning it fails here rather than on someone's phone;
//   3. the class is actually on the element that owns the subtree;
//   4. nobody "fixes" this later by sprinkling `dark:` variants, which is the
//      step-3 colour migration and needs a dark design frame that does not
//      exist yet (see the `.dark` block's own note in tokens.css).
// ============================================================================

const CWD = process.cwd(); // vitest runs with cwd = apps/frontend
const TOKENS = readFileSync(join(CWD, 'src', 'styles', 'tokens.css'), 'utf8');
const PIN_CLASS = 'sa-pin-light';

/** Pull one top-level block's declarations out of tokens.css, in order. */
function block(selector: string): Record<string, string> {
  const i = TOKENS.indexOf(selector + ' {');
  expect(i, `tokens.css has no "${selector} {" block`).toBeGreaterThan(-1);
  const body = TOKENS.slice(i + selector.length + 2, TOKENS.indexOf('}', i));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--sa-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const root = block(':root');
const dark = block('.dark');
const pin = block('.' + PIN_CLASS);

/** Strip comments before scanning: both source files NAME tokens in prose. */
const source = (rel: string) =>
  readFileSync(join(CWD, 'src', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

const ROUTE_FILES = ['screens/LandingScreen.tsx', 'components/LandingHeader.tsx'];
const routeSrc = ROUTE_FILES.map(source).join('\n');

/**
 * utility name -> CSS variable, DERIVED from tailwind.config.cjs rather than
 * restated. `ink: { DEFAULT: 'var(--sa-ink)', secondary: 'var(--sa-ink-secondary)' }`
 * becomes `ink -> --sa-ink`, `ink-secondary -> --sa-ink-secondary`.
 */
function utilityToVar(): Record<string, string> {
  const req = createRequire(import.meta.url);
  const cfg = req(join(CWD, 'tailwind.config.cjs'));
  const colors = cfg.theme.extend.colors as Record<string, unknown>;
  const out: Record<string, string> = {};
  const add = (name: string, value: unknown) => {
    const m = typeof value === 'string' && value.match(/var\((--sa-[a-z0-9-]+)\)/);
    if (m) out[name] = m[1];
  };
  for (const [group, val] of Object.entries(colors)) {
    if (typeof val === 'string') add(group, val);
    else for (const [k, v] of Object.entries(val as Record<string, unknown>))
      add(k === 'DEFAULT' ? group : `${group}-${k}`, v);
  }
  return out;
}

const PREFIXES = 'bg|text|border|ring|from|to|via|divide|fill|stroke|placeholder|outline|decoration';

/** Which token variables the landing route actually reaches. */
function varsUsedOnRoute(): Set<string> {
  const map = utilityToVar();
  // longest first so `text-ink-secondary` is not matched as `text-ink`
  const names = Object.keys(map).sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\b(?:${PREFIXES})-(${names.join('|')})(?![a-z0-9-])`, 'g');
  const used = new Set<string>();
  for (const m of routeSrc.matchAll(re)) used.add(map[m[1]]);
  return used;
}

describe('the pin invents nothing', () => {
  it('every pinned value is byte-identical to the same property in :root', () => {
    expect(Object.keys(pin).length).toBeGreaterThan(0);
    for (const [prop, value] of Object.entries(pin)) {
      expect(root[prop], `${prop} is not declared in :root`).toBeDefined();
      expect(value, `${prop} was edited away from its :root value`).toBe(root[prop]);
    }
  });

  it('pins only properties that :root and .dark actually disagree about', () => {
    // A pin on a property that does not differ would be dead weight, and would
    // hide the fact that the real difference lives somewhere else.
    for (const prop of Object.keys(pin)) {
      expect(dark[prop], `${prop} is not overridden in .dark, so pinning it does nothing`)
        .toBeDefined();
      expect(root[prop]).not.toBe(dark[prop]);
    }
  });

  it('changes neither :root nor .dark — --sa-ink still flips for the rest of the app', () => {
    expect(root['--sa-ink']).toBe('#1A1F36');
    expect(dark['--sa-ink']).toBe('#F8FAFC');
  });
});

describe('the pinned set is exactly what the route needs', () => {
  it('covers every differing token the landing route reaches, and no others', () => {
    // BOTH sides recomputed: the utilities are scanned out of the two source
    // files, mapped through tailwind.config.cjs, and intersected with the
    // properties :root and .dark disagree about. A hardcoded list here would
    // pass no matter what the route contains.
    const used = varsUsedOnRoute();
    const required = [...used].filter((v) => dark[v] !== undefined && dark[v] !== root[v]).sort();
    expect(required.length, 'the scan found no differing tokens at all — the scanner is broken')
      .toBeGreaterThan(0);
    expect(Object.keys(pin).sort()).toEqual(required);
  });

  it('the scanner can see a token that IS on the route (positive control)', () => {
    // Without this, an over-eager comment strip or a broken regex would report
    // "nothing used", the required set would be empty, and an empty pin block
    // would pass the test above.
    expect(varsUsedOnRoute().has('--sa-ink')).toBe(true);
  });

  it('and does NOT see one that is absent (negative control)', () => {
    // --sa-danger has no utility anywhere on this route.
    expect(varsUsedOnRoute().has('--sa-danger')).toBe(false);
  });
});

describe('the class is on the element that owns the subtree', () => {
  it('the landing route root carries it, so LandingHeader inherits', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const r = createRoot(container);
    flushSync(() => r.render(<MemoryRouter><LandingScreen /></MemoryRouter>));
    const pageRoot = container.firstElementChild!;
    expect(pageRoot.classList.contains(PIN_CLASS)).toBe(true);
    // the header must be INSIDE it — inheritance is the whole mechanism
    const header = container.querySelector('header')!;
    expect(header).not.toBeNull();
    expect(pageRoot.contains(header)).toBe(true);
    r.unmount();
    container.remove();
  });
});

describe('nobody converts this page to dark mode by accident', () => {
  it.each(ROUTE_FILES)('%s carries no `dark:` variant', (rel) => {
    // Giving this page a real dark appearance means eight section backgrounds
    // and the palette usages inside them, against a .dark palette that tokens.css
    // itself records as DERIVED rather than designed. That is step 3.
    expect(source(rel)).not.toMatch(/\bdark:/);
  });
});
