import { describe, it, expect } from 'vitest';
import React from 'react';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import {
  BrandMark,
  CUT_THRESHOLD_PX,
  SMALL_CUT_STROKE,
  SMALL_CUT_DOC,
  SMALL_CUT_CHECK,
  INK_WHITE,
  INK_CYAN,
} from '../src/components/BrandMark';
import { LandingScreen } from '../src/screens/LandingScreen';

// ============================================================================
// ONE MARK, TWO WEIGHTS.
// ============================================================================
// There were four hand-drawn marks in this repository across three blues, plus
// three lucide-glyph tiles standing in for a logo. This file exists to stop that
// happening again, and the thing it actually guards is COLOUR IDENTITY and
// WHICH CUT RENDERS AT WHICH SIZE — the two properties that cannot be checked by
// looking at a diff.
//
// WHAT CI CANNOT DO HERE, stated rather than faked: there is no rasterizer in
// this suite, so nothing below renders pixels. The 16px/32px acceptance was
// measured with resvg outside CI and is recorded in the PR body:
//
//     16px : 38 fully-opaque white px, 14 fully-opaque cyan px, edge #FFFFFF
//     32px : 214 fully-opaque white px, 74 fully-opaque cyan px, edge #FFFFFF
//     (the full master at 30px, for contrast: 0 fully-opaque px, edge #47749C)
//
// What CI pins instead is the GEOMETRY that produces those pixels — chiefly
// SMALL_CUT_STROKE, which is 2.0 device px at a 16px render and is the reason
// the white is white. A proxy, named as one.
// ============================================================================

const CWD = process.cwd(); // vitest runs with cwd = apps/frontend
const MASTER_PATH = join(CWD, 'assets', 'scan-action-mark.svg');
// STRIP THE COMMENTS FIRST. The master opens with a 40-line block that NAMES
// colours it does not draw — the splash navy #0f172a among them — and a naive
// scan reads those as part of the artwork. Caught by this file's own colour
// assertion on the first run, which is the only reason it is written down.
const master = readFileSync(MASTER_PATH, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const indexHtml = readFileSync(join(CWD, 'index.html'), 'utf8');

const markup = (size: number) => renderToStaticMarkup(<BrandMark size={size} />);

/** Every `stop-color`, in document order. */
const stopsOf = (svg: string) =>
  [...svg.matchAll(/stop-color=["']([^"']+)["']/g)].map((m) => m[1]);

/** Every `d=` path payload, whitespace-normalised. */
const pathsOf = (svg: string) =>
  [...svg.matchAll(/\sd=["']([^"']+)["']/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());

/** Every colour literal anywhere in the markup. */
const colorsOf = (svg: string) =>
  [...new Set([...svg.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0].toUpperCase()))].sort();

describe('the full cut is the master, verbatim', () => {
  const full = markup(512);

  it('carries the master gradient — all 17 stops, in order, read back off disk', () => {
    const fromMaster = stopsOf(master);
    expect(fromMaster).toHaveLength(17);
    expect(stopsOf(full)).toEqual(fromMaster);
  });

  it('carries every path the master draws', () => {
    const masterPaths = pathsOf(master);
    // doc-outline, doc-fold, sparkle-lg, sparkle-sm, check
    expect(masterPaths).toHaveLength(5);
    for (const d of masterPaths) {
      expect(pathsOf(full), `the master path "${d.slice(0, 28)}..." is missing`).toContain(d);
    }
  });

  it('carries the beam, its bloom filter, and the plate', () => {
    // Read the beam's geometry OUT OF THE MASTER rather than restating it here.
    // A literal typed into this file would be a second source of truth for the
    // one number the file exists to protect.
    const beam = master.match(/id="beam-core"[\s\S]*?\/>/)![0];
    const attrs = [...beam.matchAll(/\s(x|y|width|height)="([\d.]+)"/g)].map(
      (m) => `${m[1]}="${m[2]}"`,
    );
    expect(attrs).toHaveLength(4);
    for (const a of attrs) expect(full, `beam ${a} missing`).toContain(a);
    // both rects: the bloomed one and the core, sharing the same y
    const y = attrs.find((a) => a.startsWith('y='))!;
    expect([...full.matchAll(new RegExp(y.replace('.', '\\.'), 'g'))]).toHaveLength(2);

    const stdDev = master.match(/stdDeviation="([^"]+)"/)![1];
    expect(full).toContain('feGaussianBlur');
    expect(full).toContain(`stdDeviation="${stdDev}"`);
    expect(full).toContain('width="512" height="512"');
  });

  it('introduces no colour the master does not have', () => {
    expect(colorsOf(full)).toEqual(colorsOf(master));
  });
});

describe('the cut boundary is the measured one', () => {
  // The master stops drawing below 48px: at 30px it renders zero fully-opaque
  // pixels and its white comes out #47749C. CUT_THRESHOLD_PX is that boundary.
  it('is 48', () => {
    expect(CUT_THRESHOLD_PX).toBe(48);
  });

  it('one px below the threshold renders the SMALL cut', () => {
    const svg = markup(CUT_THRESHOLD_PX - 1);
    expect(svg).toContain(SMALL_CUT_DOC);
    expect(svg).not.toContain('feGaussianBlur');
  });

  it('at the threshold it renders the FULL master', () => {
    const svg = markup(CUT_THRESHOLD_PX);
    expect(svg).toContain('feGaussianBlur');
    expect(svg).not.toContain(SMALL_CUT_DOC);
  });

  it('the two cuts are genuinely different drawings, not the same one scaled', () => {
    // Without this, every other assertion in this file would still pass if the
    // component quietly returned the full master at every size.
    const small = markup(30);
    const full = markup(512);
    expect(small).not.toEqual(full.replace(/(width|height)="512"/g, '$1="30"'));
    expect(pathsOf(small)).not.toEqual(pathsOf(full));
    expect(pathsOf(small)).toHaveLength(2);
    expect(pathsOf(full)).toHaveLength(5);
  });
});

describe('the small cut drops exactly what cannot draw, and keeps the colour', () => {
  const small = markup(30);

  it.each([
    ['the beam', 'x="73.5"'],
    ['the beam bloom', 'feGaussianBlur'],
    ['the large sparkle', 'M 341.39,206.073'],
    ['the small sparkle', 'M 321.112,242.48'],
    ['the fold FLAP', 'M 311.62,100.38'],
    ["the master's hairline stroke", '16.5'],
  ])('drops %s', (_label, needle) => {
    expect(small).not.toContain(needle);
  });

  it('keeps the fold as a chamfer on the outline', () => {
    // the 45deg cut: H 240 then a diagonal L 304,144
    expect(SMALL_CUT_DOC).toContain('H 240 L 304,144');
  });

  it('is exactly two inked paths — the document and the check', () => {
    expect(pathsOf(small)).toEqual([SMALL_CUT_DOC, SMALL_CUT_CHECK]);
  });

  it('uses the MASTER gradient, unmodified — no new blue enters', () => {
    expect(stopsOf(small)).toEqual(stopsOf(master));
  });

  it('inks in the two master colours and nothing else', () => {
    expect(colorsOf(small)).toEqual(colorsOf(master));
    expect(small).toContain(INK_WHITE);
    expect(small).toContain(INK_CYAN);
  });

  it('strokes at or above the 2.0-device-px floor', () => {
    // 2.0 device px is the width at which a band fully covers at least one
    // pixel at ANY subpixel offset. At a 16px render, 2.0px = 2.0*512/16 = 64
    // master units. Below this the mark greys out exactly as the master does.
    expect(SMALL_CUT_STROKE).toBeGreaterThanOrEqual((2.0 * 512) / 16);
    expect(small).toContain(`stroke-width="${SMALL_CUT_STROKE}"`);
  });

  it('keeps the 512 user space, which is what makes the gradient copyable', () => {
    // The gradient is gradientUnits="userSpaceOnUse" with coordinates in the
    // 512 space. A different viewBox would force re-derived numbers.
    expect(small).toContain('viewBox="0 0 512 512"');
    expect(small).toContain('x1="-254.19"');
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

  it('and does NOT match the full cut — the comparison can fail', () => {
    // The positive control. Without it the assertion above would pass just as
    // happily against a toDataUri that returned a constant.
    expect(hrefInHtml()).not.toEqual(toDataUri(markup(512)));
  });

  it('is inline, not a URL that could 404 into the SPA fallback', () => {
    expect(hrefInHtml().startsWith('data:image/svg+xml,')).toBe(true);
  });
});

describe('the header renders the small cut, and AppLogo is gone', () => {
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

  it('the landing header renders the SMALL cut, not the full master', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => root.render(<MemoryRouter><LandingScreen /></MemoryRouter>));
    const svg = container.querySelector('header')!.querySelector('svg')!;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('width')).toBe('30');
    expect(Number(svg.getAttribute('width'))).toBeLessThan(CUT_THRESHOLD_PX);
    expect(svg.outerHTML).toContain(`stroke-width="${SMALL_CUT_STROKE}"`);
    expect(svg.outerHTML).not.toContain('feGaussianBlur');
    root.unmount();
    container.remove();
  });
});
