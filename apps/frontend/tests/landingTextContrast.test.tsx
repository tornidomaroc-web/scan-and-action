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
// LANDING TEXT THAT WAS FIXED FOR CONTRAST KEEPS CLEARING ITS FLOOR.
// ============================================================================
// Held here: the two pricing-card plan names, and the hero's reassurance line
// under the main button ("No credit card. Takes 30 seconds.").
//
// WHAT THIS CAN HOLD HONESTLY. jsdom has no layout, so nothing here can say
// whether anything lines up or how a weight reads. A colour PAIR is not a
// layout fact: an element's text utility and the background utility of its
// nearest painted ancestor both resolve from source, through Tailwind's own
// palette and the pinned token values, with no stylesheet involved.
//
// WHAT IT CANNOT SEE, stated so a green run is not read as more: opacity (so it
// asserts none is on the path), inline styles, and any cascade override of the
// colour utilities themselves. The figures were read off the rendered page at
// 1280, 485, 390 and 360 — Free name 4.76, Pro name 4.70, hero line 4.76, each
// replacing a slate-400 that read 2.56 — and this file only keeps the pairs from
// drifting.
//
// THE FLOOR IS DERIVED, NOT TYPED, because it has already been wrong once. A
// plan name is `text-xl`: 20px bold on desktop, large text, floor 3. Below 768
// the "Mobile type scale (<md)" rule in index.css shrinks it to 18px, below the
// 18.66px large-text line, so on a phone its floor is 4.5. The hero line is
// `text-sm`, 14px at every width (that rule does not resize it), so its floor is
// 4.5 everywhere. Each element is held to the stricter of its two floors.
// ============================================================================

const CWD = process.cwd(); // vitest runs with cwd = apps/frontend
const req = createRequire(import.meta.url);
const palette = req(req.resolve('tailwindcss/colors', { paths: [CWD] })) as Record<string, unknown>;
const defaultTheme = req(req.resolve('tailwindcss/defaultTheme', { paths: [CWD] })) as {
  fontSize: Record<string, [string, unknown]>;
};
const config = req(join(CWD, 'tailwind.config.cjs'));
const TOKENS = readFileSync(join(CWD, 'src', 'styles', 'tokens.css'), 'utf8');
const INDEX_CSS = readFileSync(join(CWD, 'src', 'index.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const i = TOKENS.indexOf(selector + ' {');
  expect(i, `tokens.css has no "${selector} {" block`).toBeGreaterThan(-1);
  const body = TOKENS.slice(i + selector.length + 2, TOKENS.indexOf('}', i));
  return Object.fromEntries([...body.matchAll(/(--sa-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
// The landing route is pinned light (.sa-pin-light), so a token resolves to its
// pinned value, falling back to :root for anything the pin does not re-declare.
const tokenValues = { ...block(':root'), ...block('.sa-pin-light') };

/** `text-slate-500` / `bg-white` / `text-accent` -> a 6-digit hex, or throw. */
function resolve(utility: string): string {
  const name = utility.replace(/^(text|bg)-/, '');
  if (name === 'white') return '#ffffff';
  if (name === 'black') return '#000000';
  const lit = name.match(/^([a-z]+)-(\d{2,3})$/);
  if (lit && typeof palette[lit[1]] === 'object') {
    const hex = (palette[lit[1]] as Record<string, string>)[lit[2]];
    if (hex) return hex;
  }
  const colors = config.theme.extend.colors as Record<string, unknown>;
  const [group, ...rest] = name.split('-');
  const entry = colors[group];
  const raw = typeof entry === 'string' ? (rest.length ? undefined : entry)
    : (entry as Record<string, string> | undefined)?.[rest.length ? rest.join('-') : 'DEFAULT'];
  const v = raw?.match(/var\((--sa-[a-z0-9-]+)\)/)?.[1];
  if (v && tokenValues[v]) return tokenValues[v];
  throw new Error(`cannot resolve colour utility "${utility}"`);
}

function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    let x = h.replace('#', '');
    if (x.length === 3) x = x.split('').map((c) => c + c).join('');
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const c = parseInt(x.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Rendered px of a `text-*` size utility, desktop (Tailwind default) and below 768 (index.css). */
function sizes(utility: string): { desktop: number; phone: number } {
  const key = utility.replace(/^text-/, '');
  const desktop = parseFloat(defaultTheme.fontSize[key][0]) * 16;
  const mobile = INDEX_CSS.slice(INDEX_CSS.indexOf('@media (max-width: 767px)'));
  const m = mobile.match(new RegExp(`\\.text-${key}\\s*\\{\\s*font-size:\\s*([\\d.]+)rem`));
  return { desktop, phone: m ? parseFloat(m[1]) * 16 : desktop };
}

const WEIGHT: Record<string, number> = { 'font-medium': 500, 'font-semibold': 600, 'font-bold': 700, 'font-black': 900 };
/** WCAG: large text is >= 24px, or >= 18.66px (14pt) at bold. */
const floorFor = (px: number, weight: number) => (px >= 24 || (px >= 18.66 && weight >= 700) ? 3 : 4.5);

interface Inspected { label: string; fg: string[]; size: string; weight: string; bg?: string; opacity: string[]; inDarkBand: boolean }

/** An element's own colour, size and weight, and the background of its nearest ancestor that paints one. */
function inspect(label: string, el: Element): Inspected {
  const classes = el.className.split(/\s+/);
  const fg = classes.filter((c) => /^text-(?!xs|sm|base|lg|xl|\d?xl|left|center|right)[a-z]/.test(c));
  const size = classes.find((c) => /^text-(xs|sm|base|lg|xl|\dxl)$/.test(c))!;
  const weight = classes.find((c) => c in WEIGHT)!;
  const opacity: string[] = [];
  let bg: string | undefined;
  for (let e: Element | null = el; e && !bg; e = e.parentElement) {
    const cls = e.className.split(/\s+/);
    opacity.push(...cls.filter((c) => /^opacity-/.test(c)));
    bg = cls.find((c) => /^bg-[a-z]/.test(c));
  }
  return { label, fg, size, weight, bg, opacity, inDarkBand: !!el.closest('.bg-slate-900') };
}

const SENTENCE = 'No credit card. Takes 30 seconds.';

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(<MemoryRouter><LandingScreen /></MemoryRouter>));
  const names = [...container.querySelectorAll('#pricing .grid > div')].map((card) => {
    const h3 = card.querySelector('h3')!;
    return inspect(h3.textContent!, h3);
  });
  const withSentence = [...container.querySelectorAll('p')].filter((p) => p.textContent?.trim() === SENTENCE);
  // The HERO copy is the one in the headline's own column, located through the
  // h1 so the closing band's copy of the same sentence can never stand in for it.
  const heroColumn = container.querySelector('h1')!.parentElement!;
  const hero = withSentence.filter((p) => heroColumn.contains(p)).map((p) => inspect('hero line', p));
  const twin = withSentence.filter((p) => p.closest('.bg-slate-900')).map((p) => inspect('closing-band line', p));
  root.unmount();
  container.remove();
  return { names, hero, twin, sentenceCount: withSentence.length };
}

const page = render();
const HELD: Inspected[] = [...page.names, ...page.hero];

function ratioAndFloor(n: Inspected) {
  const { desktop, phone } = sizes(n.size);
  const w = WEIGHT[n.weight];
  return { ratio: contrast(resolve(n.fg[0]), resolve(n.bg!)), floor: Math.max(floorFor(desktop, w), floorFor(phone, w)), desktop, phone, w };
}

describe('fixed landing text holds its contrast floor at every width', () => {
  it('finds exactly what it holds: both plan names and ONE hero line', () => {
    expect(page.names.map((n) => n.label)).toEqual(['Free', 'Pro']);
    expect(page.hero, 'the hero reassurance line was not found in the headline column').toHaveLength(1);
    expect(page.hero[0].inDarkBand, 'the hero line resolved inside the dark closing band').toBe(false);
  });

  it('each held element has one colour, one size, one weight and a painted background', () => {
    for (const n of HELD) {
      expect(n.fg, `${n.label}: expected exactly one text colour utility`).toHaveLength(1);
      expect(n.size, `${n.label}: no text size utility`).toBeDefined();
      expect(n.weight, `${n.label}: no weight utility`).toBeDefined();
      expect(n.bg, `${n.label}: no background utility on it or any ancestor`).toBeDefined();
    }
  });

  it('nothing on any held path applies opacity, which this file cannot see through', () => {
    for (const n of HELD) expect(n.opacity, n.label).toEqual([]);
  });

  it.each(['Free', 'Pro', 'hero line'])('%s clears the stricter of its desktop and phone floors', (which) => {
    const n = HELD.find((x) => x.label === which)!;
    const { ratio, floor, phone, w } = ratioAndFloor(n);
    expect(ratio, `${which}: ${n.fg[0]} on ${n.bg} at ${phone}px/${w}`).toBeGreaterThanOrEqual(floor);
  });

  it('a plan name floor is 4.5 only because the mobile rule shrinks it', () => {
    const n = page.names[0];
    const { desktop, phone } = sizes(n.size);
    expect(desktop).toBe(20);
    expect(phone).toBe(18);
    expect(floorFor(desktop, WEIGHT[n.weight])).toBe(3);
    expect(floorFor(phone, WEIGHT[n.weight])).toBe(4.5);
  });

  it('the hero line floor is 4.5 at every width, and the mobile rule does not touch its size', () => {
    const { desktop, phone, w, floor } = ratioAndFloor(page.hero[0]);
    expect(desktop).toBe(14);
    expect(phone).toBe(14);
    expect(w).toBe(700);
    expect(floor).toBe(4.5);
  });

  it('POSITIVE CONTROL: the colour these replaced fails, so the test can go red', () => {
    const r = contrast(resolve('text-slate-400'), resolve('bg-white'));
    expect(r).toBeCloseTo(2.56, 2);
    expect(r).toBeLessThan(4.5);
  });

  it('NEGATIVE CONTROL: an unknown utility throws instead of resolving to something that passes', () => {
    expect(() => resolve('text-not-a-colour-500')).toThrow(/cannot resolve/);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#767676', '#fff')).toBeCloseTo(4.54, 2);
  });
});

// ── KNOWN, NOT FIXED HERE, AND TWO-WAY ─────────────────────────────────────
// The closing band carries the SAME sentence, `text-slate-500` on `bg-slate-900`,
// measured 3.75 against a 4.5 floor at 1280, 485, 390 and 360. It belongs to the
// board's closing-section entry, which rules that band is decided as a whole, so
// it is recorded here rather than repaired. This assertion goes red the moment
// that line clears its floor: when it does, move it into HELD above and delete
// this block, so the record cannot outlive the defect.
describe('the closing band copy of the sentence is a known failure, owned by the board', () => {
  it('still fails its floor (move it into HELD when this goes red)', () => {
    expect(page.sentenceCount, 'the sentence should appear exactly twice: hero and closing band').toBe(2);
    expect(page.twin).toHaveLength(1);
    const { ratio, floor } = ratioAndFloor(page.twin[0]);
    expect(floor).toBe(4.5);
    expect(ratio).toBeLessThan(floor);
  });
});
