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
// Held here: the two pricing-card plan names, the hero's reassurance line, the
// `/mo` price suffix, the five texts inside the hero mock that were below
// their floor at every width, the closing band's reassurance line and CTA
// label, and the three `!` tiles on the cost cards, each held on its own. With
// the tiles, this file holds no known failure at all: every text below its
// floor on this route has been repaired, so any failure found from here on is
// new. The closing band's CTA is also held for SHAPE (its fill against the
// band, WCAG 1.4.11, floor 3), and the band is held to literals throughout,
// because the ruling that fixed it was that nothing in it may depend on the pin.
//
// WHAT THIS CAN HOLD HONESTLY. jsdom has no layout, so nothing here can say
// whether anything lines up or how a weight reads. A colour PAIR is not a
// layout fact: an element's colour, size, weight and the backgrounds above it
// all resolve from source, through Tailwind's own palette, the pinned token
// values and the `@media (max-width: 767px)` block in index.css, with no
// stylesheet involved.
//
// WHAT IT STILL CANNOT SEE, stated so a green run is not read as more:
//   * inline `style` attributes. The footer sets `fontSize: '13px'` that way and
//     is therefore not holdable here; the browser sweep is what reads it.
//   * RESPONSIVE SIZE VARIANTS. `sm:text-5xl` emits `.sm\:text-5xl`, and the
//     mobile type rule overrides `.text-5xl`, a different selector, so it never
//     applies to the variant. Measured in a browser: the h1 is 48px at a proven
//     700 viewport, not the 28px this file's model would predict. Nothing in
//     HELD carries a `sm:text-*`, and nothing may be added that does.
//   * any cascade override of the colour utilities themselves.
//
// OPACITY IS COMPOSITED NOW, AND THAT IS THE POINT OF THIS REVISION. This file
// used to REFUSE opacity: it asserted that no held path carried an `opacity-*`
// utility, and treated that refusal as safety. It is not safety, it is a blind
// spot, and it is the one the `/mo` suffix shipped through. `text-2xl
// opacity-40` carries NO colour utility at all, so tokenLiteralPairing had
// nothing to inspect either; the pair was invisible to the whole repository
// until a browser measured it at 2.55 against a floor of 3. The fold below
// walks the full ancestor chain, multiplies every `opacity-*` on it, and
// composites both the backgrounds and the text at that product, exactly as the
// browser does. A future `opacity-*` on a held path now moves the RATIO instead
// of tripping a refusal.
//
// THE FLOOR IS DERIVED, NOT TYPED, because it has already been wrong once. Both
// the size and the WEIGHT are re-read per regime out of index.css: below 768 that
// block shrinks `.text-6xl` through `.text-xl` and turns `.font-black` into 700.
// Each element is held to the stricter of its desktop and phone floors.
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
const MOBILE_BLOCK = INDEX_CSS.slice(INDEX_CSS.indexOf('@media (max-width: 767px)'));

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

interface Rgb { r: number; g: number; b: number }

function rgb(hex: string): Rgb {
  let x = hex.replace('#', '');
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  return { r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16) };
}

/** Paint `c` onto `base` at alpha `a`. The whole of the opacity model. */
function over(base: Rgb, c: Rgb, a: number): Rgb {
  return { r: c.r * a + base.r * (1 - a), g: c.g * a + base.g * (1 - a), b: c.b * a + base.b * (1 - a) };
}

function contrast(a: Rgb, b: Rgb): number {
  const lum = (c: Rgb) => {
    const ch = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** A class name as index.css would have to spell it, then escaped for RegExp. */
function cssSelectorRe(utility: string): string {
  const asWritten = '.' + utility.replace(/[[\]().]/g, (c) => '\\' + c);
  return asWritten.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Rendered px of a `text-*` size utility, desktop (Tailwind) and below 768 (index.css). */
function sizes(utility: string): { desktop: number; phone: number } {
  const key = utility.replace(/^text-/, '');
  const arbitrary = key.match(/^\[([\d.]+)(px|rem)\]$/);
  const desktop = arbitrary
    ? parseFloat(arbitrary[1]) * (arbitrary[2] === 'rem' ? 16 : 1)
    : parseFloat(defaultTheme.fontSize[key][0]) * 16;
  const m = MOBILE_BLOCK.match(new RegExp(cssSelectorRe(utility) + '\\s*\\{\\s*font-size:\\s*([\\d.]+)(rem|px)'));
  return { desktop, phone: m ? parseFloat(m[1]) * (m[2] === 'rem' ? 16 : 1) : desktop };
}

const WEIGHT: Record<string, number> = { 'font-medium': 500, 'font-semibold': 600, 'font-bold': 700, 'font-black': 900 };

/** Numeric weight of a `font-*` utility, desktop and below 768. */
function weights(utility: string): { desktop: number; phone: number } {
  const desktop = WEIGHT[utility];
  const m = MOBILE_BLOCK.match(new RegExp(cssSelectorRe(utility) + '\\s*\\{\\s*font-weight:\\s*(\\d+)'));
  return { desktop, phone: m ? Number(m[1]) : desktop };
}

/** WCAG: large text is >= 24px, or >= 18.66px (14pt) at bold. */
const floorFor = (px: number, weight: number) => (px >= 24 || (px >= 18.66 && weight >= 700) ? 3 : 4.5);

const SIZE_RE = /^text-(xs|sm|base|lg|xl|\dxl|\[[\d.]+(px|rem)\])$/;
const COLOUR_RE = /^text-(?!xs|sm|base|lg|xl|\d?xl|left|center|right)[a-z]/;

const classesOf = (el: Element) =>
  (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean);

function chainOf(el: Element): Element[] {
  const out: Element[] = [];
  for (let e: Element | null = el; e; e = e.parentElement) out.unshift(e);
  return out;
}

interface Inspected {
  label: string;
  el: Element;
  fg: string[];
  fgFrom: 'self' | 'inherited';
  size?: string;
  weight?: string;
  bg?: string;
  opacities: string[];
  unresolvedBg: string[];
  inDarkBand: boolean;
}

/**
 * An element's colour, size and weight, taking the first one found walking up
 * (which is what inheritance does), plus every `opacity-*` on the path and the
 * backgrounds above it.
 */
function inspect(label: string, el: Element): Inspected {
  const own = classesOf(el);
  let fg = own.filter((c) => COLOUR_RE.test(c));
  let fgFrom: 'self' | 'inherited' = 'self';
  let size = own.find((c) => SIZE_RE.test(c));
  let weight = own.find((c) => c in WEIGHT);
  const opacities: string[] = [];
  const unresolvedBg: string[] = [];
  let bg: string | undefined;

  for (const e of chainOf(el).reverse()) {
    const cls = classesOf(e);
    if (e !== el) {
      if (fg.length === 0) { const f = cls.filter((c) => COLOUR_RE.test(c)); if (f.length) { fg = f; fgFrom = 'inherited'; } }
      if (!size) size = cls.find((c) => SIZE_RE.test(c));
      if (!weight) weight = cls.find((c) => c in WEIGHT);
    }
    opacities.push(...cls.filter((c) => /^opacity-\d+$/.test(c)));
    if (!bg) bg = cls.find((c) => /^bg-[a-z]/.test(c));
  }
  return { label, el, fg, fgFrom, size, weight, bg, opacities, unresolvedBg, inDarkBand: !!el.closest('.bg-slate-900') };
}

/**
 * The composited background under an element and the opacity product applied to
 * it, folded from the document root downwards exactly as the browser paints:
 * every background contributes at the running opacity product, and the text is
 * then painted at the same product.
 */
function paint(n: Inspected): { bg: Rgb; product: number } {
  let bg: Rgb = { r: 255, g: 255, b: 255 };
  let product = 1;
  for (const e of chainOf(n.el)) {
    for (const c of classesOf(e)) {
      const m = c.match(/^opacity-(\d+)$/);
      if (m) product *= Number(m[1]) / 100;
    }
    const bgu = classesOf(e).find((c) => /^bg-[a-z]/.test(c));
    if (bgu) {
      try { bg = over(bg, rgb(resolve(bgu)), product); }
      catch { n.unresolvedBg.push(bgu); }
    }
  }
  return { bg, product };
}

function ratioAndFloor(n: Inspected) {
  const s = sizes(n.size!);
  const w = weights(n.weight!);
  const { bg, product } = paint(n);
  const text = over(bg, rgb(resolve(n.fg[0])), product);
  return {
    ratio: contrast(text, bg),
    floor: Math.max(floorFor(s.desktop, w.desktop), floorFor(s.phone, w.phone)),
    desktopPx: s.desktop, phonePx: s.phone,
    desktopWeight: w.desktop, phoneWeight: w.phone,
    product,
  };
}

const SENTENCE = 'No credit card. Takes 30 seconds.';

/** The hero mock's card: located by walking UP from its own heading. */
function mockRoot(container: Element): Element {
  const h3 = [...container.querySelectorAll('h3')].find((h) => h.textContent?.trim() === 'Starbucks Receipt');
  expect(h3, 'the hero mock heading was not found').toBeDefined();
  for (let e: Element | null = h3!; e; e = e.parentElement) {
    if (classesOf(e).some((c) => c === 'rounded-[32px]')) return e;
  }
  throw new Error('the hero mock card was not found above its heading');
}

/** The one element inside `root` whose own text is exactly `text`. */
function only(root: Element, selector: string, text: string, label: string): Element {
  const hits = [...root.querySelectorAll(selector)].filter((e) => e.textContent?.trim() === text);
  expect(hits, `${label}: expected exactly one "${text}"`).toHaveLength(1);
  return hits[0];
}

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(<MemoryRouter><LandingScreen /></MemoryRouter>));

  const cards = [...container.querySelectorAll('#pricing .grid > div')];
  const names = cards.map((card) => { const h3 = card.querySelector('h3')!; return inspect(h3.textContent!, h3); });

  // The `/mo` suffix: the span inside the Pro card's price, reached through the
  // card whose NAME is Pro, never through a class string that two cards share.
  const pro = cards.find((c) => c.querySelector('h3')?.textContent?.trim() === 'Pro')!;
  const priceDiv = [...pro.querySelectorAll('div')].find((d) => classesOf(d).includes('text-5xl'))!;
  const moSpan = priceDiv.querySelector('span')!;
  const mo = inspect('/mo', moSpan);

  const withSentence = [...container.querySelectorAll('p')].filter((p) => p.textContent?.trim() === SENTENCE);
  // The HERO copy is the one in the headline's own column, located through the
  // h1 so the closing band's copy of the same sentence can never stand in for it.
  const heroColumn = container.querySelector('h1')!.parentElement!;
  const hero = withSentence.filter((p) => heroColumn.contains(p)).map((p) => inspect('hero line', p));
  const twin = withSentence.filter((p) => p.closest('.bg-slate-900')).map((p) => inspect('closing-band line', p));

  // The closing band and its one link, located through the band's own literal.
  const bands = [...container.querySelectorAll('.bg-slate-900')];
  const bandLinks = bands.flatMap((b) => [...b.querySelectorAll('a')]);
  const cta = bandLinks.map((a) => inspect('closing CTA label', a));

  const mock = mockRoot(container);
  const ths = [...mock.querySelectorAll('th')];
  const mockup = [
    inspect('AI Extraction', only(mock, 'p', 'AI Extraction', 'mock eyebrow')),
    inspect('Needs Review', only(mock, 'div', 'Needs Review', 'mock status chip')),
    inspect('! badge', only(mock, 'div', '!', 'mock decision badge')),
    inspect('Label', ths[0]),
    inspect('Value', ths[1]),
  ];

  const tiles = [...container.querySelectorAll('.bg-red-50')].map((t, i) => inspect(`red ! tile ${i + 1}`, t));

  root.unmount();
  container.remove();
  return {
    names, mo, hero, twin, cta, mockup, tiles,
    bandCount: bands.length, thCount: ths.length, sentenceCount: withSentence.length,
  };
}

const page = render();
const HELD: Inspected[] = [
  ...page.names, page.mo, ...page.hero, ...page.twin, ...page.cta, ...page.mockup, ...page.tiles,
];

describe('the sweep found what it holds', () => {
  it('finds both plan names, BOTH reassurance lines, the /mo suffix, the closing CTA, the five mock texts and the three tiles', () => {
    expect(page.names.map((n) => n.label)).toEqual(['Free', 'Pro']);
    expect(page.sentenceCount, 'the sentence should appear exactly twice: hero and closing band').toBe(2);
    expect(page.hero, 'the hero reassurance line was not found in the headline column').toHaveLength(1);
    expect(page.hero[0].inDarkBand, 'the hero line resolved inside the dark closing band').toBe(false);
    expect(page.twin, 'the closing band copy of the sentence was not found in the band').toHaveLength(1);
    expect(page.bandCount, 'there should be exactly one bg-slate-900 band').toBe(1);
    expect(page.cta, 'the closing band should carry exactly one link').toHaveLength(1);
    expect(page.cta[0].el.textContent?.trim()).toBe('Start Free with 10 Scans Included');
    expect(page.mo.el.textContent, 'the /mo span is empty, so the catalog suffix moved').toBeTruthy();
    expect(page.thCount, 'the mock table no longer has exactly two headers').toBe(2);
    expect(page.mockup.map((n) => n.label)).toEqual(['AI Extraction', 'Needs Review', '! badge', 'Label', 'Value']);
    expect(page.tiles.map((n) => n.label)).toEqual(['red ! tile 1', 'red ! tile 2', 'red ! tile 3']);
    expect(page.tiles.map((n) => n.el.textContent?.trim())).toEqual(['!', '!', '!']);
    expect(HELD).toHaveLength(14);
  });

  it('every held element resolves a colour, a size, a weight and a background', () => {
    for (const n of HELD) {
      expect(n.fg, `${n.label}: expected exactly one text colour utility`).toHaveLength(1);
      expect(n.size, `${n.label}: no text size utility on it or any ancestor`).toBeDefined();
      expect(n.weight, `${n.label}: no weight utility on it or any ancestor`).toBeDefined();
      expect(n.bg, `${n.label}: no background utility on it or any ancestor`).toBeDefined();
    }
  });

  it('no held element carries a `sm:` size variant, which this file cannot model', () => {
    // `sm:text-5xl` emits `.sm\:text-5xl` and escapes the index.css override of
    // `.text-5xl` entirely. Measured in a browser: 48px at a proven 700 viewport.
    for (const n of HELD) {
      for (const e of chainOf(n.el)) {
        expect(classesOf(e).filter((c) => /^(sm|md|lg|xl):text-(xs|sm|base|lg|xl|\dxl)$/.test(c)),
          `${n.label}: a responsive size variant is on its path`).toEqual([]);
      }
    }
  });

  it('every background on every held path resolves to a colour', () => {
    for (const n of HELD) { ratioAndFloor(n); expect(n.unresolvedBg, n.label).toEqual([]); }
  });

  it.each(['Free', 'Pro', 'hero line', 'closing-band line', 'closing CTA label', '/mo',
    'AI Extraction', 'Needs Review', '! badge', 'Label', 'Value',
    'red ! tile 1', 'red ! tile 2', 'red ! tile 3'])(
    '%s clears the stricter of its desktop and phone floors', (which) => {
      const n = HELD.find((x) => x.label === which)!;
      const r = ratioAndFloor(n);
      expect(r.ratio, `${which}: ${n.fg[0]} on ${n.bg} at ${r.phonePx}px/${r.phoneWeight}, opacity ${r.product}`)
        .toBeGreaterThanOrEqual(r.floor);
    });
});

describe('the floors are derived per regime, not typed', () => {
  it('a plan name floor is 4.5 only because the mobile rule shrinks it', () => {
    const n = page.names[0];
    const s = sizes(n.size!), w = weights(n.weight!);
    expect(s.desktop).toBe(20);
    expect(s.phone).toBe(18);
    expect(floorFor(s.desktop, w.desktop)).toBe(3);
    expect(floorFor(s.phone, w.phone)).toBe(4.5);
  });

  it('the hero line floor is 4.5 at every width, and the mobile rule does not touch its size', () => {
    const r = ratioAndFloor(page.hero[0]);
    expect(r.desktopPx).toBe(14);
    expect(r.phonePx).toBe(14);
    expect(r.desktopWeight).toBe(700);
    expect(r.floor).toBe(4.5);
  });

  it('/mo inherits its weight, and the mobile rule drops that weight from 900 to 700', () => {
    // The span carries `text-2xl` and no weight of its own. Before this file
    // walked the chain it could not have held this element at all.
    expect(page.mo.weight).toBe('font-black');
    const w = weights('font-black');
    expect(w.desktop).toBe(900);
    expect(w.phone).toBe(700);
    const r = ratioAndFloor(page.mo);
    expect(r.desktopPx).toBe(24);
    expect(r.phonePx).toBe(20);
    expect(r.floor).toBe(3); // large at both: 24px, and 20px at 700
  });

  it('the mock eyebrow is sized by an ARBITRARY utility the mobile rule never touches', () => {
    const n = HELD.find((x) => x.label === 'AI Extraction')!;
    expect(n.size).toBe('text-[10px]');
    const s = sizes('text-[10px]');
    expect(s.desktop).toBe(10);
    expect(s.phone).toBe(10);
    expect(floorFor(s.desktop, 700)).toBe(4.5);
  });
});

describe('controls', () => {
  it('POSITIVE CONTROL: the colour the hero and eyebrow replaced fails, so this can go red', () => {
    const r = contrast(rgb(resolve('text-slate-400')), rgb(resolve('bg-white')));
    expect(r).toBeCloseTo(2.56, 2);
    expect(r).toBeLessThan(4.5);
  });

  it('POSITIVE CONTROL: opacity is COMPOSITED, and ignoring it flips the verdict', () => {
    // This is the pair `/mo` shipped as: slate-900 inherited, at opacity-40, on
    // white. Read without the opacity it is one of the strongest pairs on the
    // page. Read with it, it is below the floor its own size earns. A single
    // assertion on either number alone proves nothing; the DIFFERENCE is the control.
    const white = rgb('#ffffff');
    const ink = rgb(resolve('text-slate-900'));
    expect(contrast(ink, white), 'ignoring opacity').toBeGreaterThan(15);
    expect(contrast(over(white, ink, 0.4), white), 'compositing opacity').toBeLessThan(3);
  });

  it('POSITIVE CONTROL: the fold reaches a background two ancestors up', () => {
    // `Label` sits in a <th> inside <thead> inside <table> inside the div that
    // paints. If the walk stopped at the element the background would be white
    // and the ratio would be wrong in the SAFE direction, which is the direction
    // that hides defects.
    const n = HELD.find((x) => x.label === 'Label')!;
    expect(n.bg).toBe('bg-slate-50');
    expect(paint(n).bg).not.toEqual(rgb('#ffffff'));
  });

  it('NEGATIVE CONTROL: an unknown utility throws instead of resolving to something that passes', () => {
    expect(() => resolve('text-not-a-colour-500')).toThrow(/cannot resolve/);
    expect(contrast(rgb('#000000'), rgb('#ffffff'))).toBeCloseTo(21, 5);
    expect(contrast(rgb('#767676'), rgb('#ffffff'))).toBeCloseTo(4.54, 2);
  });

  it('NEGATIVE CONTROL: a size utility that is not one is not mistaken for one', () => {
    expect(SIZE_RE.test('text-slate-500')).toBe(false);
    expect(SIZE_RE.test('text-center')).toBe(false);
    expect(SIZE_RE.test('text-[10px]')).toBe(true);
    expect(COLOUR_RE.test('text-[10px]')).toBe(false);
    expect(COLOUR_RE.test('text-slate-500')).toBe(true);
  });
});

// ── THE CLOSING BAND, RULED AS A WHOLE ─────────────────────────────────────
// Its CTA used to be `bg-ink` (the pinned #1A1F36) on this band's #0F172A:
// SHAPE 1.10 against a floor of 3, a button with no edge. The ruling kept the
// band dark and made everything in it a palette LITERAL, because none of the
// 31 colour tokens is dark in both themes and none is a surface, so any token
// in this band depends on the pin, and that dependence is what hid the defect.

/**
 * SHAPE: an element's own fill against the composited backdrop of its
 * ancestors, WCAG 1.4.11. The same fold as paint(), stopped one step early.
 * `hover:` and `active:` variants do not match and are deliberately not
 * modelled: this is the resting state.
 */
function shape(el: Element): { ratio: number; fill: string; backdrop: string } {
  const fillUtility = classesOf(el).find((c) => /^bg-[a-z]/.test(c));
  expect(fillUtility, 'the element paints no background of its own, so it has no fill to measure').toBeDefined();
  let backdrop: Rgb = { r: 255, g: 255, b: 255 };
  let backdropUtility = 'none';
  let product = 1;
  for (const e of chainOf(el)) {
    for (const c of classesOf(e)) {
      const m = c.match(/^opacity-(\d+)$/);
      if (m) product *= Number(m[1]) / 100;
    }
    if (e === el) break;
    const bgu = classesOf(e).find((c) => /^bg-[a-z]/.test(c));
    if (bgu) { backdrop = over(backdrop, rgb(resolve(bgu)), product); backdropUtility = bgu; }
  }
  const fill = over(backdrop, rgb(resolve(fillUtility!)), product);
  return { ratio: contrast(fill, backdrop), fill: fillUtility!, backdrop: backdropUtility };
}

/** True when a colour utility resolves through a `var(--sa-*)`, i.e. is a token. */
function isToken(utility: string): boolean {
  const name = utility.replace(/^(text|bg)-/, '');
  if (name === 'white' || name === 'black') return false;
  const lit = name.match(/^([a-z]+)-(\d{2,3})$/);
  if (lit && typeof palette[lit[1]] === 'object' && (palette[lit[1]] as Record<string, string>)[lit[2]]) return false;
  resolve(utility); // throws on anything that is neither
  return true;
}

describe('the closing band CTA has an edge', () => {
  it('its fill clears the 3:1 non-text floor against the band', () => {
    const s = shape(page.cta[0].el);
    expect(s.backdrop, 'the CTA no longer sits directly on the dark band').toBe('bg-slate-900');
    expect(s.ratio, `${s.fill} on ${s.backdrop}`).toBeGreaterThanOrEqual(3);
  });

  it('POSITIVE CONTROL: the fill it replaced fails that floor, so this can go red', () => {
    const r = contrast(rgb(resolve('bg-ink')), rgb(resolve('bg-slate-900')));
    // 1.10 with the earlier ink (#1A1F36); 1.06 with the ink of the language
    // chosen 2026-09-26 (#0F1014). Either way, nowhere near an edge.
    expect(r).toBeCloseTo(1.065, 2);
    expect(r).toBeLessThan(3);
  });

  it('NEGATIVE CONTROL: a fill equal to its backdrop measures exactly 1', () => {
    const band = page.cta[0].el.closest('.bg-slate-900')!;
    expect(contrast(rgb(resolve('bg-slate-900')), rgb(resolve('bg-slate-900')))).toBe(1);
    expect(band.contains(page.cta[0].el)).toBe(true);
  });
});

describe('nothing in the closing band depends on the pin', () => {
  it('the band, its CTA fill and label, and its reassurance line are all palette literals', () => {
    // Under the pin a token here can PASS every ratio above and still be wrong:
    // `bg-surface-raised text-ink` would read as white and navy today and flip
    // with the theme the day the pin is removed. That is the dependence this
    // band was ruled out of, so it is held here rather than left to step 3.
    const cta = page.cta[0];
    const twin = page.twin[0];
    const used = {
      band: 'bg-slate-900',
      'CTA fill': classesOf(cta.el).find((c) => /^bg-[a-z]/.test(c))!,
      'CTA label': cta.fg[0],
      'reassurance line': twin.fg[0],
    };
    for (const [role, utility] of Object.entries(used)) {
      expect(utility, `${role}: no colour utility found`).toBeDefined();
      expect(isToken(utility), `${role}: ${utility} is a token, so it depends on the pin`).toBe(false);
    }
  });

  it('POSITIVE CONTROL: the classifier does call a token a token', () => {
    expect(isToken('bg-ink')).toBe(true);
    expect(isToken('text-surface-raised')).toBe(true);
    expect(isToken('bg-white')).toBe(false);
    expect(isToken('text-slate-400')).toBe(false);
  });
});

// ── THE `!` TILES: WHY THEIR FLOOR IS 4.5, AND WHAT THEY REPLACED ───────────
// They were the last known failure in this file, held two-way until repaired.
// They are held as TEXT at 4.5, not as icons at 3: an icon floor would have
// left a permanent exception in the route's own baseline.

describe('the three ! tiles are held at the phone floor', () => {
  it('their floor is 4.5 only because the mobile rule shrinks them below large text', () => {
    // `font-black text-xl`: 20px/900 at >= 768, large text, floor 3. Below 768
    // the index.css mobile rule makes it 18px/700, under the 18.66px bold line.
    expect(page.tiles).toHaveLength(3);
    for (const t of page.tiles) {
      const s = sizes(t.size!), w = weights(t.weight!);
      expect(floorFor(s.desktop, w.desktop), `${t.label}: desktop floor`).toBe(3);
      expect(floorFor(s.phone, w.phone), `${t.label}: phone floor`).toBe(4.5);
      expect(ratioAndFloor(t).floor, `${t.label}: held floor`).toBe(4.5);
    }
  });

  it('POSITIVE CONTROL: the colour they replaced clears the desktop floor and misses this one', () => {
    // Without this, a model that silently used the desktop floor would pass the
    // old colour too, and the held assertions above would prove nothing.
    const r = contrast(rgb(resolve('text-red-500')), rgb(resolve('bg-red-50')));
    expect(r).toBeGreaterThanOrEqual(3);
    expect(r).toBeLessThan(4.5);
  });
});
