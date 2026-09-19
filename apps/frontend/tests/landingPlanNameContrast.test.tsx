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
// THE PRICING CARDS' PLAN NAMES CLEAR THEIR CONTRAST FLOOR — ON A PHONE.
// ============================================================================
// WHAT THIS CAN HOLD HONESTLY, AND WHY IT IS THE ONLY TEST ON THIS CARD. jsdom
// has no layout, so nothing here can say whether the cards line up or how the
// weights read. A colour PAIR is not a layout fact: the name's text utility and
// the card's background utility both resolve from source, through Tailwind's
// own palette and the pinned token values, with no stylesheet involved.
//
// WHAT IT CANNOT SEE, stated so a green run is not read as more: opacity (so
// it asserts none is on the path), inline styles, and any cascade override of
// the colour utilities themselves. The measured figures — 4.76 for the Free name,
// 4.70 for Pro, 2.56 for the slate-400 it replaced — were read off the rendered
// page at 1280, 485, 390 and 360; this file only keeps the pair from drifting.
//
// THE FLOOR IS THE TRAP, which is why it is DERIVED, not typed. At 1280 the name
// is 20px bold, which is large text, floor 3. Below 768 the "Mobile type scale
// (<md)" rule in index.css shrinks `text-xl` to 18px, and 18px bold is below
// the 18.66px large-text line, so the floor there is 4.5. A colour picked to
// clear "3:1 for large text" fails every phone. This file reads both sizes and
// holds the name to the stricter floor.
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

function planNames() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(<MemoryRouter><LandingScreen /></MemoryRouter>));
  const cards = [...container.querySelectorAll('#pricing .grid > div')];
  const out = cards.map((card) => {
    const h3 = card.querySelector('h3')!;
    const classes = h3.className.split(/\s+/);
    const fg = classes.filter((c) => /^text-(?!xs|sm|base|lg|xl|\d?xl|left|center|right)[a-z]/.test(c));
    const size = classes.find((c) => /^text-(xs|sm|base|lg|xl|\dxl)$/.test(c))!;
    const weight = classes.find((c) => c in WEIGHT)!;
    const path: Element[] = [];
    for (let e: Element | null = h3; e && e !== card.parentElement; e = e.parentElement) path.push(e);
    const bg = path.flatMap((e) => e.className.split(/\s+/)).find((c) => /^bg-[a-z]/.test(c));
    const opacity = path.flatMap((e) => e.className.split(/\s+/)).filter((c) => /^opacity-/.test(c));
    return { name: h3.textContent, fg, size, weight, bg, opacity };
  });
  root.unmount();
  container.remove();
  return out;
}

describe('the plan names hold their contrast floor on a phone', () => {
  const names = planNames();

  it('finds both plan names, each with one colour, one size, one weight and a background', () => {
    expect(names.map((n) => n.name)).toEqual(['Free', 'Pro']);
    for (const n of names) {
      expect(n.fg, `${n.name}: expected exactly one text colour utility`).toHaveLength(1);
      expect(n.size, `${n.name}: no text size utility`).toBeDefined();
      expect(n.weight, `${n.name}: no weight utility`).toBeDefined();
      expect(n.bg, `${n.name}: no background utility between the name and its card`).toBeDefined();
    }
  });

  it('nothing on the path applies opacity, which this file cannot see through', () => {
    for (const n of names) expect(n.opacity, n.name!).toEqual([]);
  });

  it.each(['Free', 'Pro'])('%s clears the stricter of its desktop and phone floors', (which) => {
    const n = names.find((x) => x.name === which)!;
    const { desktop, phone } = sizes(n.size);
    const w = WEIGHT[n.weight];
    const floor = Math.max(floorFor(desktop, w), floorFor(phone, w));
    const ratio = contrast(resolve(n.fg[0]), resolve(n.bg!));
    expect(ratio, `${which}: ${n.fg[0]} on ${n.bg} at ${phone}px/${w} on a phone`).toBeGreaterThanOrEqual(floor);
  });

  it('the floor on a phone is 4.5, not 3 — the mobile rule is what makes it so', () => {
    const n = names[0];
    const { desktop, phone } = sizes(n.size);
    expect(desktop).toBe(20);
    expect(phone).toBe(18);
    expect(floorFor(desktop, WEIGHT[n.weight])).toBe(3);
    expect(floorFor(phone, WEIGHT[n.weight])).toBe(4.5);
  });

  it('POSITIVE CONTROL: the colour this replaced fails, so the test can go red', () => {
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
