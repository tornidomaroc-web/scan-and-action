import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// Dynamic Type (design PR 2, 2026-10-13). The phone's text size reaches the
// app through the root font size alone (src/native/textScale.ts), so three
// things must hold: every font size is in rem, the root follows each platform
// up to one cap, and a failed reading changes nothing.
// ============================================================================

const h = vi.hoisted(() => ({ platform: 'web' }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => h.platform, isNativePlatform: () => h.platform !== 'web' },
}));

import {
  TEXT_SCALE_CAP,
  TEXT_SCALE_FLOOR,
  applyTextScale,
  clampScale,
  rootFontSizeFor,
} from '../src/native/textScale';

const APP = join(__dirname, '..');
const F = (rel: string) => readFileSync(join(APP, rel), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// A font size written in px does not follow the root, so it would stay put
// while every other label grows.
const PX_FONT = /text-\[\d+(\.\d+)?px\]|font-size:\s*\d+(\.\d+)?px|fontSize:\s*['"]?\d+(\.\d+)?px/g;

describe('every font size follows the root', () => {
  const files = walk(join(APP, 'src')).filter((p) => /\.(tsx?|css)$/.test(p));

  it('reads the source (control: the walk found the screens and the stylesheet)', () => {
    expect(files.some((p) => p.endsWith('DocumentDetailScreen.tsx'))).toBe(true);
    expect(files.some((p) => p.endsWith('index.css'))).toBe(true);
  });

  it('the pattern catches each px spelling (control)', () => {
    expect('a text-[15px] b'.match(PX_FONT)).toHaveLength(1);
    expect('font-size: 12px;'.match(PX_FONT)).toHaveLength(1);
    expect("style={{ fontSize: '11px' }}".match(PX_FONT)).toHaveLength(1);
    expect('text-[0.9375rem] font-size: 0.75rem'.match(PX_FONT)).toBeNull();
  });

  it('no file in src sets a font size in px', () => {
    // index.css's root rule is the one px value, and it is a cap, not a size;
    // textScale.ts measures with a hidden 100px span, which is never drawn.
    const hits = files.filter((p) => !p.endsWith('textScale.ts')).flatMap((p) =>
      (readFileSync(p, 'utf8').replace(/font-size: min\(100%, [\d.]+px\)/, '').match(PX_FONT) ?? []).map((m) => `${p}: ${m}`),
    );
    expect(hits).toEqual([]);
  });

  it("Tailwind's named steps are in rem", () => {
    const cfg = F('tailwind.config.cjs');
    const block = cfg.slice(cfg.indexOf('fontSize: {'), cfg.indexOf('},', cfg.indexOf('fontSize: {')));
    expect(block).toContain("kpi: ['2rem'");
    expect(block).not.toMatch(/\['\d+px'/);
  });
});

describe('what grows wraps rather than being cut', () => {
  // Amounts, dates and review states are what a reader checks; at the cap an
  // ellipsis on them hides the very thing being checked.
  it.each([
    ['src/screens/DocumentDetailScreen.tsx', '<span className="whitespace-normal">{status.label}</span>'],
    ['src/screens/ReviewQueueScreen.tsx', '<span className="whitespace-normal">{row.status.label}</span>'],
    ['src/screens/ReviewQueueScreen.tsx', 'break-words text-xs font-medium text-ink-muted" dir="auto" data-queue-meta'],
    ['src/screens/ActivityScreen.tsx', '<span className={`text-xs font-medium ${status.text}`}>{status.label}</span>'],
    ['src/screens/SearchScreen.tsx', '<span className="text-center">{monthLabel}</span>'],
    ['src/screens/SearchScreen.tsx', 'break-words text-xs font-medium text-ink-muted" data-search-scope'],
  ])('%s: %s', (file, snippet) => {
    expect(F(file)).toContain(snippet);
  });

  it('no review state, amount or date is inside a truncating box on Detail', () => {
    const src = F('src/screens/DocumentDetailScreen.tsx');
    expect(src).not.toMatch(/truncate[^>]*>\s*\{(status\.label|money\.number|money\.code)\}/);
  });
});

describe('the root rule', () => {
  it('caps the web root at the same scale the native code caps to', () => {
    const m = F('src/index.css').match(/html \{\s*font-size: min\(100%, ([\d.]+)px\);/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeCloseTo(16 * TEXT_SCALE_CAP, 2);
  });

  it('runs before the first render', () => {
    const main = F('src/main.tsx');
    expect(main.indexOf('initTextScale()')).toBeGreaterThan(-1);
    expect(main.indexOf('initTextScale()')).toBeLessThan(main.indexOf('createRoot('));
  });
});

describe('the scale', () => {
  it('is iOS xxxLarge at most and Android 0.85 at least', () => {
    expect(TEXT_SCALE_CAP).toBeCloseTo(23 / 17, 6);
    expect(clampScale(3.12)).toBe(TEXT_SCALE_CAP);
    expect(clampScale(0.5)).toBe(TEXT_SCALE_FLOOR);
    expect(clampScale(1.235)).toBe(1.235);
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(0)).toBe(1);
  });

  it.each([
    // [-apple-system-body px, root]: the iOS content size categories.
    [17, null], // Large, the default: the stylesheet's own 16px
    [19, '17.882px'], // xLarge
    [21, '19.765px'], // xxLarge
    [23, '21.647px'], // xxxLarge, the cap
    [28, '21.647px'], // accessibility Medium, capped
    [53, '21.647px'], // accessibility xxxLarge, capped
    [14, '13.6px'], // xSmall, at the floor
  ])('iOS body %ipx sets the root to %s', (body, root) => {
    expect(rootFontSizeFor('ios', body)).toBe(root);
  });

  it.each([
    // [what the WebView applied, root]: Android leaves its own scale alone up to the cap.
    [1, null],
    [0.85, null],
    [1.3, null],
    [1.5, '14.431px'],
    [2, '10.824px'],
  ])('Android at %d sets the root to %s', (z, root) => {
    expect(rootFontSizeFor('android', z)).toBe(root);
    // What the user sees is the root times the WebView's own factor.
    const seen = (root ? parseFloat(root) : 16) * z;
    expect(seen).toBeLessThanOrEqual(16 * TEXT_SCALE_CAP + 0.01);
  });

  it('a reading that failed leaves the root alone, on every platform', () => {
    for (const p of ['ios', 'android', 'web']) {
      for (const bad of [Number.NaN, 0, -1, Infinity]) expect(rootFontSizeFor(p, bad)).toBeNull();
    }
    expect(rootFontSizeFor('web', 40)).toBeNull();
  });
});

describe('applyTextScale', () => {
  const root = document.documentElement;
  beforeEach(() => {
    root.removeAttribute('style');
    delete root.dataset.textScale;
  });
  afterEach(() => vi.restoreAllMocks());

  it('does nothing on the web', () => {
    h.platform = 'web';
    applyTextScale();
    expect(root.style.fontSize).toBe('');
    expect(root.dataset.textScale).toBeUndefined();
  });

  it('on iOS sets the root from the system body font', () => {
    h.platform = 'ios';
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ fontSize: '21px' } as CSSStyleDeclaration);
    applyTextScale();
    expect(root.style.fontSize).toBe('19.765px');
  });

  it('on iOS clears an earlier reading when the setting returns to Large', () => {
    h.platform = 'ios';
    root.style.fontSize = '21.647px';
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ fontSize: '17px' } as CSSStyleDeclaration);
    applyTextScale();
    expect(root.style.fontSize).toBe('');
    expect(root.dataset.textScale).toBe('system');
  });

  it("on Android pulls the root down only above the cap (jsdom lays nothing out, so it reads 0 and leaves the root alone)", () => {
    h.platform = 'android';
    applyTextScale();
    expect(root.style.fontSize).toBe('');
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 200 } as DOMRect);
    applyTextScale();
    expect(root.style.fontSize).toBe('10.824px');
  });

  it('a reading that throws leaves the root as the stylesheet has it', () => {
    h.platform = 'ios';
    root.style.fontSize = '30px';
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => {
      throw new Error('no layout');
    });
    applyTextScale();
    expect(root.style.fontSize).toBe('');
  });
});

describe('Android resource XML', () => {
  // aapt rejects "--" inside an XML comment, and nothing else in CI builds the
  // Android app: colors.xml carried `--sa-accent` in a comment from #309 until
  // this PR, and `gradlew assembleDebug` failed on main with "The string "--"
  // is not permitted within comments".
  const res = join(APP, 'android', 'app', 'src', 'main');
  const xml = walk(res).filter((p) => p.endsWith('.xml'));
  const bad = (s: string) => [...s.matchAll(/<!--([\s\S]*?)-->/g)].filter((m) => m[1].includes('--'));

  it('reads the resources (control: colors.xml is among them, and the reading catches a planted comment)', () => {
    expect(xml.some((p) => p.endsWith('colors.xml'))).toBe(true);
    expect(bad('<a><!-- the --sa-accent token --></a>')).toHaveLength(1);
  });

  it('no comment carries a double hyphen', () => {
    expect(xml.filter((p) => bad(readFileSync(p, 'utf8')).length > 0)).toEqual([]);
  });
});

describe('Android: the native text zoom cap and the web fallback', () => {
  // MainActivity caps the WebView's text zoom at TEXT_ZOOM_CAP_PERCENT, so
  // controls keep their size. rootFontSizeFor('android', z) measures the zoom
  // actually applied and acts only above TEXT_SCALE_CAP: with the native cap in
  // effect it does nothing; if the native cap is not applied, it holds the text
  // at the cap as #311 did.
  const java = readFileSync(
    join(APP, 'android', 'app', 'src', 'main', 'java', 'com', 'scanaction', 'app', 'MainActivity.java'),
    'utf8',
  );
  const nativeCap = Number(java.match(/TEXT_ZOOM_CAP_PERCENT = (\d+);/)![1]);

  it('the native cap never exceeds the web cap, so the web layer stays idle under it', () => {
    expect(nativeCap / 100).toBeLessThanOrEqual(TEXT_SCALE_CAP);
    expect(rootFontSizeFor('android', nativeCap / 100)).toBeNull();
  });

  it('control: a zoom just above the web cap makes the web layer act', () => {
    expect(rootFontSizeFor('android', TEXT_SCALE_CAP + 0.01)).not.toBeNull();
  });

  it('the fallback: with no native cap, font scale 2.0 still lands on the web cap', () => {
    const root = parseFloat(rootFontSizeFor('android', 2)!);
    expect(root * 2).toBeCloseTo(16 * TEXT_SCALE_CAP, 2);
  });

  it('a failure in MainActivity is caught and leaves the WebView as it was', () => {
    expect(java).toMatch(/try \{[\s\S]*setTextZoom\(zoom\)[\s\S]*\} catch \(RuntimeException e\)/);
  });
});
