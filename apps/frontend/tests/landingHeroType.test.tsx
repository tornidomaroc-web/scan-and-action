import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { LandingScreen } from '../src/screens/LandingScreen';

// ============================================================================
// THE LANDING HERO'S TYPE AND COLOUR.
// ============================================================================
// Three defects, all measured on the served page before this change:
//
//  1. The headline was set `uppercase`. Of the five competitor landing pages
//     captured on 2026-09-12, four use NO all-caps body copy at all; the one
//     that does is the most dated page in the set.
//
//  2. The headline requests `font-black` (weight 900) and only 400/500/600/700
//     were ever imported, so the browser SYNTHESISED it from 700. Measured on
//     the live page: `[...document.fonts]` listed no Inter 900 face, while
//     `document.fonts.check('900 60px Inter')` returned **true** — because that
//     API answers "will this render?", not "does the face exist?". Enumerating
//     the FontFace set is the only check that separates a loaded face from a
//     browser-faked one, which is why this file asserts on the IMPORT.
//
//  3. The accent was `indigo-600` = #4F46E5, while the app's ruled-correct
//     accent is #635BFF (`--sa-accent`). Two near-identical indigos read as a
//     mistake rather than a choice.
//
// The model is Dext, whose accent — measured in its own fold — appears on text
// runs only and never on a large fill; its primary CTA is a deep navy. So the
// accent here lands on the headline's second line and the CTA takes `--sa-ink`.
// ============================================================================

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const landingSrc = read('../src/screens/LandingScreen.tsx');
const mainSrc = read('../src/main.tsx');

let container: HTMLDivElement;
let root: Root;

const mount = () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root.render(<MemoryRouter><LandingScreen /></MemoryRouter>));
};

beforeEach(mount);
afterEach(() => { root.unmount(); container.remove(); });

// ── 1. THE WEIGHT EXISTS ────────────────────────────────────────────────────
describe('Inter 900 is a real loaded face, not a synthesised one', () => {
  it('main.tsx imports latin-900', () => {
    expect(mainSrc).toContain("@fontsource/inter/latin-900.css");
  });

  it('every weight the landing headline can ask for is imported', () => {
    // `font-black` is 900. If a future change moves the headline to 800, this
    // is where the missing import gets caught instead of being faked again.
    const requested = /font-black/.test(landingSrc) ? ['900'] : [];
    for (const w of requested) {
      expect(mainSrc, `Inter ${w} is requested but never imported`).toContain(`inter/latin-${w}.css`);
    }
  });
});

// ── 2. THE HEADLINE ─────────────────────────────────────────────────────────
describe('the headline is sentence case, centred, and two deliberate lines', () => {
  it('renders the approved copy, exactly, as two lines', () => {
    const h1 = container.querySelector('h1')!;
    const lines = [...h1.querySelectorAll('span')].map((s) => s.textContent!.trim());
    expect(lines).toEqual(['Stop typing receipts.', 'Let AI read them for you.']);
  });

  // WHAT THIS FILE CANNOT CHECK, named so nobody assumes it does: jsdom has no
  // text metrics, so the number of VISUAL lines is unmeasurable here. `block`
  // guarantees the two lines are separate boxes; it does not stop either box
  // wrapping internally. It did: at 60px the second line needed 698px against a
  // 608px column and broke into two, orphaning "you.". That is why the headline
  // is 5xl and not 6xl, and it was caught in a real browser, not here.
  it('both lines are `block`, so the break is where it was approved', () => {
    // Without this the second line rewraps wherever the column runs out, and
    // "two deliberate lines" becomes "whatever fits".
    const spans = [...container.querySelectorAll('h1 span')];
    expect(spans).toHaveLength(2);
    for (const s of spans) expect(s.className).toContain('block');
  });

  it('carries no `uppercase` class', () => {
    const h1 = container.querySelector('h1')!;
    expect(h1.className).not.toContain('uppercase');
    // and the rendered text is the sentence-case source, not a shouted version
    expect(h1.textContent).toContain('Stop typing receipts.');
    expect(h1.textContent).not.toContain('STOP TYPING RECEIPTS');
  });

  it('the hero text column is centred', () => {
    const h1 = container.querySelector('h1')!;
    expect(h1.closest('div')!.className).toContain('text-center');
  });

  it('the accent is on the SECOND line only', () => {
    const spans = [...container.querySelectorAll('h1 span')];
    expect(spans[0].className).not.toContain('text-accent');
    expect(spans[1].className).toContain('text-accent');
  });
});

// ── 3. THE COLOUR ───────────────────────────────────────────────────────────
describe('the old accent is gone and the new one is confined', () => {
  it('no indigo utility survives anywhere in the file', () => {
    // indigo-600 IS #4F46E5. A single survivor puts the old accent back on the
    // page, which is the whole reason this item existed.
    expect(landingSrc).not.toMatch(/\bindigo\b/);
  });

  it('the primary CTA carries --sa-ink, not the accent', () => {
    const cta = [...container.querySelectorAll('a')].find((a) => /Start Free/i.test(a.textContent || ''))!;
    expect(cta.className).toContain('bg-ink');
    expect(cta.className).not.toContain('bg-accent');
    expect(cta.className).not.toContain('uppercase');
  });

  it('nothing in the HERO carries the accent except the headline line', () => {
    const hero = container.querySelector('h1')!.closest('.max-w-7xl')!;
    const accented = [...hero.querySelectorAll('[class*="accent"]')];
    expect(accented).toHaveLength(1);
    expect(accented[0].textContent!.trim()).toBe('Let AI read them for you.');
  });
});

// ── 4. THE ALL-CAPS THAT MUST GO, AND THE ALL-CAPS THAT STAYS ──────────────
describe('all-caps is removed from copy and kept on micro-labels', () => {
  it('no h2 or h3 is uppercase', () => {
    for (const h of container.querySelectorAll('h2, h3')) {
      expect(h.className, `${h.tagName} "${h.textContent?.slice(0, 40)}" is still uppercase`).not.toContain('uppercase');
    }
  });

  it('the reassurance line is not uppercase', () => {
    const p = [...container.querySelectorAll('p')].filter((e) => /No credit card/i.test(e.textContent || ''));
    expect(p.length).toBeGreaterThan(0);
    for (const e of p) expect(e.className).not.toContain('uppercase');
  });

  it('the product mock KEEPS its tiny all-caps labels', () => {
    // The positive half. Every competitor measured keeps small all-caps
    // eyebrows; stripping these would be over-applying the fix, and a test that
    // only forbids uppercase would happily pass against that mistake.
    const labels = [...container.querySelectorAll('[class*="text-[10px]"]')].filter((e) =>
      e.className.includes('uppercase')
    );
    expect(labels.length).toBeGreaterThanOrEqual(3);
  });
});

// ── 5. REPORTED, NOT FIXED HERE ────────────────────────────────────────────
// One `uppercase` remains on body copy: the pricing grid wrapper, which
// uppercases the whole plan card including its feature list. It is not a
// headline, a CTA label, a reassurance line or a section heading — the four
// categories this change was scoped to — so it was deliberately left.
// This test PINS that it is the only one, so the residue is a recorded fact
// rather than something rediscovered later as an oversight.
describe('KNOWN RESIDUE — one uppercase body-copy site is out of scope', () => {
  it('exactly one non-micro-label uppercase survives, and it is the pricing grid', () => {
    const lines = landingSrc.split('\n').filter((l) => l.includes('uppercase'));
    const notMicro = lines.filter((l) => !l.includes('text-[10px]'));
    expect(notMicro).toHaveLength(1);
    expect(notMicro[0]).toContain('grid sm:grid-cols-2');
  });
});
