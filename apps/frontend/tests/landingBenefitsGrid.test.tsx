import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { LandingScreen } from '../src/screens/LandingScreen';

// ============================================================================
// THE BENEFITS GRID, THE SEQUENCE IT DID NOT SWALLOW, AND THE PAGE RHYTHM.
// ============================================================================
// WHY THIS FILE EXISTS, established by mutation rather than assumed. With the
// six-card grid built and the whole landing guard set green at 144/144, one
// mutation was applied to a card:
//
//   "Built-in validation rules flag suspicious data instantly."
//     -> "Trusted by over 4,000 finance teams worldwide."
//
// A fabricated social-proof claim with a number nobody can stand behind. The
// suite reported 87 passed, 0 failed. Nothing on this page could see it: the
// pin guard reads token utilities, the pairing guard reads class strings, the
// header guard reads ids and hrefs, and the hardcoded-text census defers this
// route by product decision. Invented copy on the one page anonymous visitors
// meet was, until this file, entirely unguarded.
//
// ── WHAT EACH HALF IS WORTH, so a green run is not read as more than it is ──
//
//  1. THE FABRICATION SCAN (derived). No digit and no social-proof vocabulary
//     inside this one section. This is the half that catches the CLASS rather
//     than one wording, and it needs no list of approved sentences. Its scope
//     is what makes it correct, so the scope is controlled both ways below:
//     the numbered-steps section three divs later is FULL of digits, and a
//     scanner that fired there would be measuring the wrong thing.
//
//  2. THE COPY AND PAIRING PIN (a restatement, and said so). Six strings and
//     the order they sit in. This cannot prove the copy is TRUE — it is the
//     same text in two places. What it buys is that changing any of it, or
//     re-ordering the pairs, is a deliberate edit to this file rather than a
//     silent one, because the pairing is the section's whole argument and is
//     invisible in the markup.
//
//  3. THE GEOMETRY (derived). Walked off the rendered tree, never asserted
//     from a literal list of sections: a section added or removed moves these
//     numbers by itself.
//
// WHAT NO ASSERTION HERE CAN DO. jsdom applies no stylesheet and resolves no
// var(), so nothing below is a contrast or a layout measurement. And every
// colour in the new section is a token held at its light value by
// `.sa-pin-light` — so this section renders identically in dark mode whether
// its tokenisation is right or wrong. The dark reading is owed when the pin
// comes off, in a browser, and is not claimed here.
// ============================================================================

// U+2019, deliberately: the copy this grid inherited uses a curly apostrophe,
// and an ASCII one would be a copy change rather than a match.
const RSQUO = String.fromCodePoint(0x2019);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root.render(<MemoryRouter><LandingScreen /></MemoryRouter>));
});
afterEach(() => { root.unmount(); container.remove(); });

/** The page root is the pinned wrapper; its DIV children are the content
 *  sections. Walked, so adding or deleting a section changes the answer. */
const sections = () =>
  [...container.firstElementChild!.children].filter((el) => el.tagName === 'DIV') as HTMLElement[];

/** The merged section, located by its own heading rather than by position. */
const gridSection = () =>
  sections().find((s) => s.textContent!.includes('Still typing receipts manually?'))!;

const cards = () => [...gridSection().querySelectorAll('.grid > div')] as HTMLElement[];
const text = (el: Element) => el.textContent!.replace(/\s+/g, ' ').trim();

// ── 1. NOTHING IN THIS SECTION IS A CLAIM WE CANNOT STAND BEHIND ───────────
const FABRICATION = /trusted by|rated|rating|award|testimonial|review(?:s|ed)\b|stars?\b|customers|thousands|millions|worldwide|certified|industry[- ]leading|#1/i;
const hasDigit = (s: string) => /[0-9]/.test(s);

describe('the grid invents nothing', () => {
  it('carries no digit at all — no count, price, percentage or rating', () => {
    const t = text(gridSection());
    expect(hasDigit(t), `a number appeared in the benefits grid: ${t.slice(0, 160)}`).toBe(false);
  });

  it('carries no social-proof vocabulary', () => {
    const m = text(gridSection()).match(FABRICATION);
    expect(m && m[0], 'an unverifiable claim appeared in the benefits grid').toBeFalsy();
  });

  it('and the two scanners actually fire (positive control)', () => {
    // Without this, a typo in either pattern would report "clean" forever and
    // both assertions above would pass against invented copy. These are the
    // exact shapes the mutation used.
    expect(hasDigit('Trusted by over 4,000 finance teams worldwide.')).toBe(true);
    expect(FABRICATION.test('Trusted by over 4,000 finance teams worldwide.')).toBe(true);
    expect(FABRICATION.test('Rated 4.8 stars by 900 reviewers')).toBe(true);
  });

  it('and they are SCOPED to this section, not to the page (negative control)', () => {
    // The numbered steps are three sections away and are nothing but digits.
    // A scanner wide enough to see them would be measuring the wrong surface,
    // and the digit rule above would be impossible to satisfy.
    const steps = container.querySelector('#how-it-works')!;
    expect(hasDigit(text(steps)), 'the step numerals vanished, so this control proves nothing').toBe(true);
    expect(gridSection().contains(steps)).toBe(false);
  });
});

// ── 2. SIX CARDS, AND THE COLUMN PAIRING THAT IS THE ARGUMENT ──────────────
// Row-major DOM: the three costs, then the three answers. At `sm` and above the
// answer sits directly under the cost it answers; below `sm` the grid collapses
// to the order the page already read in, costs then answers.
const PAIRS: ReadonlyArray<readonly [string, string, string]> = [
  [
    `You${RSQUO}re still typing every receipt by hand`,
    'Stop wasting hours on manual entry',
    'Automatic recognition makes typing a thing of the past.',
  ],
  [
    'Receipts with missing amounts break your reports',
    'Get clean data you can actually use',
    'Export validated CSV data ready for your accounting tool.',
  ],
  [
    `You find mistakes only after it${RSQUO}s too late`,
    'Catch errors before they cost you',
    'Built-in validation rules flag suspicious data instantly.',
  ],
];

describe('the six cards, and what sits under what', () => {
  it('there are exactly six, in one grid', () => {
    // Also the positive control for `cards()`: a broken selector returning []
    // would make every assertion below pass vacuously.
    expect(cards()).toHaveLength(6);
  });

  it('the first three are the costs, in the order the Problem section had them', () => {
    // Read the <p>, not the card: the card's textContent leads with the "!"
    // from its icon tile, and comparing against that would pin the ornament
    // into the copy assertion.
    expect(cards().slice(0, 3).map((c) => text(c.querySelector('p')!))).toEqual(PAIRS.map((p) => p[0]));
  });

  it('the last three are the answers, each under the cost it answers', () => {
    expect(cards().slice(3, 6).map(text)).toEqual(PAIRS.map((p) => `${p[1]}${p[2]}`));
  });

  it('every answer card leads with a heading, every cost card does not', () => {
    // This is the visual difference between the two rows doing its job in the
    // document outline too: the answers are h3, the costs are body copy.
    const c = cards();
    for (const cost of c.slice(0, 3)) expect(cost.querySelector('h3')).toBeNull();
    for (const answer of c.slice(3, 6)) expect(answer.querySelector('h3')).not.toBeNull();
  });

  it('the section it replaced two of gave it the only heading either of them had', () => {
    const h2 = gridSection().querySelector('h2')!;
    expect(text(h2)).toBe('Still typing receipts manually?');
  });
});

// ── 3. "HOW IT WORKS" IS STILL A NUMBERED SEQUENCE, NOT SIX MORE BENEFITS ──
describe('the sequence survived the merge', () => {
  it('is its own section, and is NOT inside the grid', () => {
    const steps = container.querySelector('#how-it-works')!;
    expect(steps).not.toBeNull();
    expect(sections()).toContain(steps);
  });

  it('renders three steps numbered 1, 2, 3 in that order', () => {
    // The ruling, made durable. Turned into cards among six others these lose
    // the number and the order, which is the one thing the section argues.
    const steps = container.querySelector('#how-it-works')!;
    const numerals = [...steps.querySelectorAll('h3')].map(
      (h) => text(h.previousElementSibling!),
    );
    expect(numerals).toEqual(['1', '2', '3']);
  });

  it('and the accent tiles are here and ONLY here on the page', () => {
    // What keeps the steps legible as a sequence rather than as benefits is
    // that nothing else on the page carries a tinted tile. #208 confined the
    // accent to the hero headline; these three numerals are the other use.
    const steps = container.querySelector('#how-it-works')!;
    const tiles = [...container.querySelectorAll('[class*="bg-accent-tint"]')];
    expect(tiles).toHaveLength(3);
    for (const t of tiles) expect(steps.contains(t)).toBe(true);
  });
});

// ── 4. ONE WIDTH, ONE RHYTHM ────────────────────────────────────────────────
describe('the page has one container width and one vertical rhythm', () => {
  it('five content sections, walked off the tree', () => {
    expect(sections()).toHaveLength(5);
  });

  it('96px opens and closes, 64px for everything between', () => {
    const pad = sections().map((s) => (s.className.match(/\bpy-(\d+)\b/) ?? [])[1]);
    // py-24 = 6rem = 96px, py-16 = 4rem = 64px (resolved from the real config).
    expect(pad).toEqual(['24', '16', '16', '16', '24']);
  });

  it("every section's own container is the 1280 one, bar the closing measure", () => {
    const widths = sections().map((s) => {
      const c = s.firstElementChild as HTMLElement;
      expect(c.className, 'a section stopped centring its container').toContain('mx-auto');
      const m = c.className.match(/\bmax-w-([a-z0-9]+)\b/g) ?? [];
      expect(m, 'a container declares more than one width').toHaveLength(1);
      return m[0];
    });
    // The last is the closing CTA: one centred headline and one button, so its
    // width is a MEASURE on a line of text, not a content edge to align. The
    // reasoning is recorded at the element. An unexplained third width fails.
    expect(widths).toEqual([
      'max-w-7xl', 'max-w-7xl', 'max-w-7xl', 'max-w-7xl', 'max-w-3xl',
    ]);
  });

  it('and no section leaves a margin that would expose the wrapper between bands', () => {
    // The hero carried `mb-12`, which showed 48px of the wrapper's own
    // background above the next band. With that band now on --sa-surface, a
    // strip of #F8FAFC above #F5F7FA would read as a mistake rather than a
    // choice. Contiguous sections are what make the two greys never meet.
    //
    // ANCHORED ON A CLASS BOUNDARY, NOT ON \b, and this is not a style note:
    // `/\bm[bty]?-\d/` matched `scroll-mt-16` — the `m` there is preceded by a
    // hyphen, which is a non-word character, so \b succeeds inside the word.
    // The first draft of this assertion failed on the two anchored sections
    // while reporting a margin that does not exist.
    const MARGIN = /(?:^|\s)m[btxy]?-\d/;
    for (const s of sections()) {
      expect(s.className, `${s.className.slice(0, 40)} reopens the gap`).not.toMatch(MARGIN);
    }
    // and the matcher can see a real margin (positive control), or the loop
    // above proves only that the regex never matches anything.
    expect(MARGIN.test('py-24 px-6 bg-white mb-12 overflow-hidden')).toBe(true);
    expect(MARGIN.test('scroll-mt-16 py-16 px-6')).toBe(false);
  });
});
