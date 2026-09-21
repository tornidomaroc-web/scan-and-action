import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// THE CONTRAST INSTRUMENTS KEEP THE PROPERTIES THEY WERE CORRECTED INTO HAVING.
// ============================================================================
// `scripts/contrastSweep.browser.js` and `scripts/contrastShapeSweep.browser.js`
// are browser-pasted tools. CI cannot run them, and this file does not pretend
// to: it holds the three source properties that a session already got WRONG once
// each, and that nothing else in the repository would notice.
//
//   1. The interactive-role list must not admit NON-interactive ARIA roles.
//      The shape sweep's first run disagreed with its own cross-check 13 to 12,
//      and the extra element was the BrandMark `<svg role="presentation">`. The
//      test had been `hasAttribute('role')`. `presentation` REMOVES semantics, so
//      an element carrying it is the opposite of a UI component. Re-admitting any
//      such role silently re-inflates the WCAG 1.4.11 population.
//
//   2. No published figure may appear in EXECUTABLE code. The instruments are
//      run against pages whose expected ratios are written in the source they
//      read and on the board. A constant like 3.75 or 1.10 sitting in the
//      instrument turns convergence into self-confirmation. Comments may quote
//      figures, because a comment cannot tune arithmetic.
//
//   3. The only floor the shape instrument compares against is 3, the WCAG
//      1.4.11 non-text floor. A second threshold appearing here means someone
//      has started grading, which is the judgement the file explicitly refuses.
//
// WHY SOURCE ASSERTIONS AND NOT BEHAVIOUR: these files touch `window`, an iframe
// and a live layout, none of which exists in jsdom. Asserting on their TEXT is
// the honest half. The behaviour half is the instruments' own four controls,
// which run in the browser and are named in their headers.
// ============================================================================

const SCRIPTS = join(process.cwd(), 'scripts');
const BASE = readFileSync(join(SCRIPTS, 'contrastSweep.browser.js'), 'utf8');
const SHAPE = readFileSync(join(SCRIPTS, 'contrastShapeSweep.browser.js'), 'utf8');

/** Source with comments removed. A figure in prose cannot tune arithmetic. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

const BASE_CODE = codeOnly(BASE);
const SHAPE_CODE = codeOnly(SHAPE);

/** The interactive-role regex, taken from the file rather than restated here. */
function interactiveRoleRe(): RegExp {
  const m = SHAPE.match(/const INTERACTIVE_ROLE = (\/\^\([^\n]*?\)\$\/);/);
  expect(m, 'contrastShapeSweep.browser.js no longer declares INTERACTIVE_ROLE').not.toBeNull();
  // eslint-disable-next-line no-new-func
  return new Function('return ' + m![1])() as RegExp;
}

describe('the shape instrument scopes WCAG 1.4.11 to INTERACTIVE roles', () => {
  const NOT_COMPONENTS = ['presentation', 'none', 'img', 'banner', 'contentinfo', 'navigation',
    'main', 'region', 'heading', 'paragraph', 'list', 'listitem', 'separator', 'group', 'generic'];
  const COMPONENTS = ['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'combobox',
    'listbox', 'slider', 'spinbutton', 'textbox', 'searchbox', 'menuitem'];

  it.each(NOT_COMPONENTS)('does NOT treat role="%s" as a UI component', (role) => {
    expect(interactiveRoleRe().test(role)).toBe(false);
  });

  it.each(COMPONENTS)('DOES treat role="%s" as a UI component', (role) => {
    expect(interactiveRoleRe().test(role)).toBe(true);
  });

  it('POSITIVE CONTROL: the regex was really read from the file and really matches something', () => {
    const re = interactiveRoleRe();
    expect(re.source).toContain('button');
    expect(re.test('button')).toBe(true);
    expect(re.test('zzz-not-a-role')).toBe(false);
  });

  it('the population is never widened back to "any role at all"', () => {
    // `hasAttribute('role')` with no role filter is the exact defect the
    // cross-check caught. It must not reappear in either instrument.
    expect(BASE_CODE).not.toMatch(/hasAttribute\(\s*['"]role['"]\s*\)/);
    expect(SHAPE_CODE).not.toMatch(/hasAttribute\(\s*['"]role['"]\s*\)(?!\s*\|\|\s*'')/);
  });
});

describe('no published figure can sit in the instruments and be converged on', () => {
  // Every figure either instrument is run against and could tune itself toward:
  // text pairs from LandingScreen.tsx and the board, and the shape anchors.
  const PUBLISHED = ['4.7588', '4.76', '3.7514', '3.75', '2.56', '2.5500', '2.55',
    '4.8424', '5.4346', '7.2425', '4.697', '3.4401', '3.44', '16.239', '16.24',
    '1.0994', '1.0955', '1.10', '1.073', '1.193', '17.06', '6.96'];

  it.each(['contrastSweep.browser.js', 'contrastShapeSweep.browser.js'])('%s executable code carries none of them', (name) => {
    const code = name.indexOf('Shape') === -1 ? BASE_CODE : SHAPE_CODE;
    const hits = PUBLISHED.filter((f) => code.includes(f));
    expect(hits, `${name} contains published figures in executable code: ${hits.join(', ')}`).toEqual([]);
  });

  it('NEGATIVE CONTROL: the same search DOES find a figure when one is present', () => {
    // Without this, a broken comment-stripper would report "clean" for a file
    // that is nothing but figures.
    const planted = codeOnly('const x = 3.7514;\n// 1.10 in a comment must not count\n');
    const hits = PUBLISHED.filter((f) => planted.includes(f));
    expect(hits, 'the figure in CODE must be found').toContain('3.7514');
    expect(hits, 'the figure in a COMMENT must not be').not.toContain('1.10');
  });

  it('POSITIVE CONTROL: the stripper keeps real code and drops real comments', () => {
    expect(BASE_CODE).toContain('0.03928');          // sRGB linearisation survives
    expect(BASE_CODE.length).toBeLessThan(BASE.length); // something was actually stripped
    expect(SHAPE_CODE).not.toContain('REMOVES semantics');
  });
});

describe('the shape instrument compares against exactly one floor', () => {
  it('and that floor is 3', () => {
    const thresholds = Array.from(SHAPE_CODE.matchAll(/(?:cue|ratio|fvb|bvb)\s*[<>]=?\s*([0-9.]+)/g)).map((m) => m[1]);
    expect(thresholds.length, 'no threshold comparison found at all, so this proves nothing').toBeGreaterThan(0);
    expect(Array.from(new Set(thresholds))).toEqual(['3']);
  });

  it('states its own scope limit in the object it returns, not only in prose', () => {
    // A reader who only ever sees the returned summary must still be told that a
    // P2 row is not a defect and that silence is not a pass.
    expect(SHAPE_CODE).toMatch(/SCOPE:/);
    expect(SHAPE_CODE).toMatch(/not a defect/);
    expect(SHAPE_CODE).toMatch(/silence is not a pass/);
  });

  it('names the exclusions it cannot measure rather than being silently short', () => {
    expect(SHAPE_CODE).toMatch(/svgPaintedNotMeasured/);
    expect(SHAPE).toMatch(/SVG PAINT IS INVISIBLE HERE/);
  });
});

describe('both instruments still parse', () => {
  it.each([['base', BASE], ['shape', SHAPE]])('%s is syntactically valid JavaScript', (_name, src) => {
    // eslint-disable-next-line no-new-func
    expect(() => new Function(src as string)).not.toThrow();
  });
});
