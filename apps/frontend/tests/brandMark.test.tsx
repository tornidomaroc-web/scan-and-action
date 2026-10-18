import { describe, it, expect } from 'vitest';
import React from 'react';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../src/i18n/LanguageContext';

import { BrandMark, CORNER_STROKE, CHECK_STROKE, INK_WHITE, INK_CYAN } from '../src/components/BrandMark';
import { LandingScreen } from '../src/screens/LandingScreen';

// ============================================================================
// ONE MARK, ONE DRAWING.
// ============================================================================
// There were four hand-drawn marks in this repository across three blues, then
// one mark in two drawings (a full cut and a small cut). Concept A, chosen on
// 2026-10-12, is one drawing at every size. This file guards the two things a
// diff cannot show: COLOUR IDENTITY with the master that every app icon is
// generated from, and that the app, the favicon and the master are the SAME
// drawing.
//
// WHAT CI CANNOT DO HERE, stated rather than faked: there is no rasterizer in
// this suite, so nothing below renders pixels. The size ladder (60, 40, 29, 20,
// 16px at 1x) was rendered outside CI for the icon round and the PR. What CI
// pins is the geometry and colour that produce those pixels.
// ============================================================================

const CWD = process.cwd(); // vitest runs with cwd = apps/frontend
// STRIP THE COMMENTS FIRST: the master's header names colours and numbers in
// prose, and a naive scan would read them as artwork.
const master = readFileSync(join(CWD, 'assets', 'scan-action-mark.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const indexHtml = readFileSync(join(CWD, 'index.html'), 'utf8');

const markup = (size: number) => renderToStaticMarkup(<BrandMark size={size} />);

/** Every `stop-color`, in document order. */
const stopsOf = (svg: string) => [...svg.matchAll(/stop-color=["']([^"']+)["']/g)].map((m) => m[1]);

/** Every `d=` path payload, whitespace-normalised. */
const pathsOf = (svg: string) =>
  [...svg.matchAll(/\sd=["']([^"']+)["']/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());

/** Every colour literal anywhere in the markup. */
const colorsOf = (svg: string) =>
  [...new Set([...svg.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0].toUpperCase()))].sort();

/** One attribute's value off the first element that carries it. */
const attrOf = (svg: string, name: string) => svg.match(new RegExp(`\\s${name}="([^"]+)"`))?.[1];

describe('the component is the master, verbatim', () => {
  const svg = markup(512);

  it('carries both master gradients: every stop, in order, read back off disk', () => {
    const fromMaster = stopsOf(master);
    // the plate's three stops (navy, middle, teal) and the lift's two
    expect(fromMaster).toEqual(['#00286D', '#006784', '#00BB9F', '#FFFFFF', '#FFFFFF']);
    expect(stopsOf(svg)).toEqual(fromMaster);
  });

  it('draws exactly the master paths: four corners and a check', () => {
    expect(pathsOf(master)).toHaveLength(5);
    expect(pathsOf(svg)).toEqual(pathsOf(master));
  });

  it('strokes at the master widths, in the master inks', () => {
    expect(master).toContain(`stroke-width="${CORNER_STROKE}"`);
    expect(master).toContain(`stroke-width="${CHECK_STROKE}"`);
    expect(svg).toContain(`stroke-width="${CORNER_STROKE}"`);
    expect(svg).toContain(`stroke-width="${CHECK_STROKE}"`);
    expect(svg).toContain(`stroke="${INK_WHITE}"`);
    expect(svg).toContain(`stroke="${INK_CYAN}"`);
  });

  it('carries the soft shadow exactly as the master does, and the plate', () => {
    expect(svg).toContain('feDropShadow');
    for (const a of ['dy', 'stdDeviation', 'flood-opacity']) {
      const v = attrOf(master, a);
      expect(v, `master has no ${a}`).toBeDefined();
      expect(attrOf(svg, a)).toBe(v);
    }
    expect(svg).toContain('width="512" height="512"');
  });

  it('introduces no colour the master does not have', () => {
    expect(colorsOf(svg)).toEqual(colorsOf(master));
  });

  it('the previous mark is gone from the master and the component', () => {
    // its document outline, its scan beam and its small-cut chamfer
    for (const old of ['M 378.855,227.6', 'x="73.5"', 'H 240 L 304,144']) {
      expect(master).not.toContain(old);
      expect(svg).not.toContain(old);
    }
  });
});

describe('one drawing at every size', () => {
  it('a 16px mark and a 512px mark differ only in their width and height', () => {
    const at = (n: number) => markup(n).replace(/ (width|height)="\d+"/, '').replace(/ (width|height)="\d+"/, '');
    expect(at(16)).toEqual(at(512));
    expect(at(30)).toEqual(at(512));
  });

  it('states the 16px stroke honestly: 1.31 device px at 1x, over 2.0 at 2x', () => {
    // 2.0 device px is the width at which a band fully covers at least one
    // pixel at any subpixel offset. The corners miss it at a 1x 16px render
    // (they anti-alias lighter) and clear it at 2x. BrandMark.tsx says so.
    expect((CORNER_STROKE * 16) / 512).toBeCloseTo(1.3125, 4);
    expect((CORNER_STROKE * 32) / 512).toBeGreaterThanOrEqual(2.0);
  });

  it('keeps the 512 user space, which is what makes the gradients copyable', () => {
    expect(markup(16)).toContain('viewBox="0 0 512 512"');
    expect(markup(16)).toContain('gradientUnits="userSpaceOnUse"');
  });
});

describe("index.html's favicon IS this component, byte for byte", () => {
  const toDataUri = (svg: string) =>
    'data:image/svg+xml,' +
    svg
      .replace(/"/g, "'")
      .replace(/[<>#%]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));

  const hrefInHtml = () => {
    const m = indexHtml.match(/<link rel="icon"[^>]*href="([^"]*)"/);
    expect(m, 'no rel="icon" link in index.html').not.toBeNull();
    return m![1];
  };

  it('matches <BrandMark size={32} /> exactly', () => {
    expect(hrefInHtml()).toEqual(toDataUri(markup(32)));
  });

  it('and does NOT match a 33px one: the comparison can fail', () => {
    // The positive control. Without it the assertion above would pass just as
    // happily against a toDataUri that returned a constant.
    expect(hrefInHtml()).not.toEqual(toDataUri(markup(33)));
  });

  it('is inline, not a URL that could 404 into the SPA fallback', () => {
    expect(hrefInHtml().startsWith('data:image/svg+xml,')).toBe(true);
  });
});

describe('the header renders the mark, and AppLogo is gone', () => {
  const srcFiles = (): string[] => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/[.]tsx?$/.test(e.name)) out.push(p);
      }
    };
    walk(join(CWD, 'src'));
    return out;
  };

  it('AppLogo.tsx does not exist and nothing in src/ names it', () => {
    expect(existsSync(join(CWD, 'src', 'components', 'AppLogo.tsx'))).toBe(false);
    const offenders = srcFiles().filter((p) => {
      const s = readFileSync(p, 'utf8');
      return s.includes('AppLogo') || s.includes('AppFavicon');
    });
    expect(offenders).toEqual([]);
  });

  it('the landing header renders the mark at 30px, the same drawing as the master', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    // The landing is on the catalog since 2026-09-26, so it needs the provider.
    flushSync(() => root.render(<LanguageProvider><MemoryRouter><LandingScreen /></MemoryRouter></LanguageProvider>));
    const svg = container.querySelector('header')!.querySelector('svg')!;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('width')).toBe('30');
    expect(pathsOf(svg.outerHTML)).toEqual(pathsOf(master));
    root.unmount();
    container.remove();
  });
});
