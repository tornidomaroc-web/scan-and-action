import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// THE FLOATING TAB BAR NEVER COVERS THE LAST ROW.
// ============================================================================
// On the owner's iPhone (2026-09-26, Arabic, dark) the last category cards on
// Home sat under the floating tab bar and Detail's Approve / Reject bar was
// pressed against it. The frames that were meant to catch this showed only
// the first screen, never the bottom of a scroll, and had no Safari toolbar.
//
// jsdom lays nothing out, so this is the arithmetic from the sources: the
// space the bar takes above the page bottom, against the padding the shell
// reserves. Both sides are READ from the files, so a change to either fails
// here rather than on a phone. The rendered proof is the harness frame
// scrolled to the bottom with the simulated toolbar (the frames page).
// ============================================================================

const CWD = process.cwd();
const src = (rel: string) => readFileSync(join(CWD, 'src', rel), 'utf8');
const REM = 16;

/** `bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]` -> 12 */
const liftPx = (cls: string) => {
  const m = cls.match(/bottom-\[calc\(env\(safe-area-inset-bottom,0px\)\+([\d.]+)rem\)\]/);
  expect(m, `no safe-area bottom offset in: ${cls}`).not.toBeNull();
  return parseFloat(m![1]) * REM;
};

describe('the phone tab bar and the shell agree', () => {
  const bar = src('components/BottomTabBar.tsx');
  const layout = src('components/Layout.tsx');
  const detail = src('screens/DocumentDetailScreen.tsx');

  // The bar: h-14 scan button (56) inside py-2 (8 + 8) = 72 px.
  const BAR_HEIGHT = 56 + 16;
  const navCls = bar.match(/<nav[\s\S]*?className="([^"]*)"/)![1];
  const lift = liftPx(navCls);

  const mainCls = layout.match(/<main[\s\S]*?className="([^"]*)"/)![1];
  const mainPad = (() => {
    const m = mainCls.match(/pb-\[calc\(env\(safe-area-inset-bottom,0px\)\+([\d.]+)rem\)\]/);
    expect(m, 'the main padding must include the safe-area inset, not a bare rem').not.toBeNull();
    return parseFloat(m![1]) * REM;
  })();

  it('the bar carries the scan circle and lifts above the safe area', () => {
    expect(bar).toMatch(/h-14 w-14[^"]*rounded-nav bg-accent/);
    expect(bar).toMatch(/<nav[\s\S]*?py-2/);
    expect(lift).toBeGreaterThanOrEqual(8);
  });

  it(`the shell reserves more than the bar takes (${mainPad} px vs ${BAR_HEIGHT + lift} px), with room to breathe`, () => {
    expect(mainPad - (BAR_HEIGHT + lift)).toBeGreaterThanOrEqual(24);
  });

  it('Detail: the action bar clears the tab bar, and the screen clears the action bar', () => {
    const barCls = detail.match(/data-detail-actions\s*\n?\s*className="([^"]*)"/)![1];
    const actionsLift = liftPx(barCls);
    // 16 px or more between the tab bar's top and the action bar's bottom.
    expect(actionsLift - (BAR_HEIGHT + lift)).toBeGreaterThanOrEqual(16);
    // The action bar: p-3 (12 + 12) around 44 px buttons = 68 px. The screen
    // adds its own bottom padding under the shell's; the sum must clear the
    // action bar's top with a gap.
    const ACTIONS_HEIGHT = 44 + 24;
    const screenPad = (() => {
      const m = detail.match(/data-detail-screen[^>]*/)![0].match(/pb-(\d+)/) ?? detail.match(/className="[^"]*pb-(\d+)[^"]*"\s+data-detail-screen/);
      expect(m, 'the detail screen has no bottom padding').not.toBeNull();
      return parseInt(m![1], 10) * 4;
    })();
    expect(mainPad + screenPad - (actionsLift + ACTIONS_HEIGHT)).toBeGreaterThanOrEqual(24);
  });

  it('control: the shell padding of the first cut (7rem, no inset) would have failed the safe-area requirement', () => {
    expect(/pb-\[calc\(env\(safe-area-inset-bottom,0px\)\+[\d.]+rem\)\]/.test('pb-28 md:pb-0')).toBe(false);
  });
});

describe("Safari's toolbars take the page surface", () => {
  it('index.html declares a theme-color per scheme in the token surfaces, and the app keeps them on the chosen theme', () => {
    const html = readFileSync(join(CWD, 'index.html'), 'utf8');
    expect(html).toMatch(/<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#F5F6FA" \/>/);
    expect(html).toMatch(/<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#0F1014" \/>/);
    expect(html).not.toContain('#0f172a');
    const tokens = readFileSync(join(CWD, 'src', 'styles', 'tokens.css'), 'utf8');
    expect(tokens).toMatch(/:root \{[\s\S]*?--sa-surface: #F5F6FA;/);
    expect(tokens).toMatch(/\.dark \{[\s\S]*?--sa-surface: #0F1014;/);
    for (const rel of ['hooks/useTheme.ts', 'components/Sidebar.tsx']) expect(src(rel)).toContain('syncThemeColor(');
  });
});
