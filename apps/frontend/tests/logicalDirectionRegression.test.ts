import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// LOGICAL DIRECTION — regression guard for the sites fixed in this PR
// ============================================================================
// Five of these were confirmed by eye on production in Arabic; four could not be
// (they live in the FREE billing branch, and the only available account is PRO).
// Either way the class token itself is checkable from source, and without a
// check it can be reverted with every gate green — the failure shape that let
// #142 ship four attributes and miss a fifth.
//
// DELIBERATELY NARROW, and narrow in a specific direction: this is a BLOCKLIST of
// the exact tokens this PR removed, per file. It is NOT the "no physical
// direction properties anywhere in this file" rule that d8bModalRestyle.test.ts
// applies to the migrated modal set (see its PHYSICAL_DIRECTION table).
//
// That wider rule cannot be applied to these files and must not be faked:
//   * AuthScreen.tsx:160 `top-0 left-0 w-full h-full` is a decorative overlay
//     sized to its box, so it is direction-neutral — a `left-*` ban would fire
//     on it and the honest fix would be an exclusion.
//   * ProcessingTray.tsx:45 positions the status chip `left-1/2 -translate-x-1/2`
//     (centred on mobile) and `md:right-8` (bottom-right on desktop). Whether
//     bottom-right is correct in an RTL page is a design call, not a defect, and
//     it was explicitly left open. A ban would force it closed by accident.
// An exclusion list per file is a whitelist-driven guard — the shape
// noHardcodedUserFacingText.test.ts:218 names as a TRAP — so it is not built.
// These files are UNMIGRATED (raw palette, font-black, physical utilities); the
// day one is migrated onto tokens is the day it earns the wider rule.
//
// HONEST LIMIT: green means the token was not reverted. It says NOTHING about
// where the accent bar, the ellipsis or the arrow actually lands. jsdom has no
// layout engine and resolves no bidi, so no test in this repo can establish
// that; the five confirmed sites were established in Chrome, by eye, on
// production. This guard only stops them being undone silently.
// ============================================================================

const SRC = join(process.cwd(), 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

// Comments are stripped before matching. Two of the fixed sites carry a comment
// naming the OLD token ("the `border-l-4 … rounded-r-2xl` shape was found
// pinning the bar to the physical left"), which is exactly the note a future
// reader needs and exactly what a naive substring scan would trip over. A guard
// that punishes its own documentation gets the documentation deleted.
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// Per file: the physical tokens this PR removed, and the logical form that
// replaced each. The message names the fix, so a failure is actionable without
// opening this file.
const BLOCKED: Record<string, Array<[RegExp, string]>> = {
  'screens/AuthScreen.tsx': [
    [/\btext-left\b/, ':236 lg:text-left → lg:text-start (headline was left-aligned in RTL)'],
    [/(?<!-)\bright-4\b/, ':299 right-4 → end-4 (password eye sat over the start of the Arabic input)'],
    [/\bml-2\b/, ':355 ml-2 → ms-2 (gap fell on the wrong side of the inline button)'],
    [/\bpl-1\b/, ':247 pl-1 → ps-1'],
    [/group-hover:translate-x-1/, ':337 dropped — physical axis; see the note at the site'],
  ],
  'screens/SettingsScreen.tsx': [
    [/\bborder-l-\d/, ':183/:201 border-l-4 → border-s-4 (bar pinned to the trailing edge in Arabic)'],
    [/\brounded-r-/, ':183/:201 rounded-r-2xl → rounded-e-2xl'],
    [/\btext-left\b/, ':183/:201/:206 text-left → text-start'],
    [/group-hover:translate-x-1/, ':225 dropped — physical axis'],
  ],
};

// Reading-direction icons must state their RTL behaviour. Scoped to the files
// this PR touched, where every occurrence was checked by hand — NOT app-wide:
// ActivityScreen.tsx:64-67 writes the same icon across four lines with the class
// on its own line, so an app-wide regex would silently pass files it cannot
// parse. A guard with a known false-negative class is worse than none, because
// green would then read as coverage.
const DIRECTIONAL_ICON = /<(ChevronRight|ChevronLeft|ArrowRight|ArrowLeft)\b[^>]*>/g;
const STATES_RTL = /rtl:-scale-x-100|rtl:rotate-180/;

const ICON_FILES = ['components/ProcessingTray.tsx', 'screens/AuthScreen.tsx', 'screens/SettingsScreen.tsx'];

describe('logical direction — the physical tokens fixed in this PR stay fixed', () => {
  for (const [rel, rules] of Object.entries(BLOCKED)) {
    const src = stripComments(read(rel));

    it(`${rel}: carries none of the physical tokens this PR removed`, () => {
      for (const [re, fix] of rules) {
        expect(re.test(src), `physical direction token is back — ${rel}${fix}`).toBe(false);
      }
    });

    it(`${rel}: the logical replacements are actually present`, () => {
      // Asserting only ABSENCE would pass if someone deleted the attribute
      // outright instead of reverting it, so the positive form is asserted too.
      expect(src).toMatch(/\btext-start\b/);
    });
  }

  it('SettingsScreen: both amber callouts use the logical bar and radius', () => {
    const src = stripComments(read('screens/SettingsScreen.tsx'));
    expect(src.match(/\bborder-s-4\b/g) ?? [], 'both FREE-branch callouts (:183 native, :201 web)').toHaveLength(2);
    expect(src.match(/\brounded-e-2xl\b/g) ?? []).toHaveLength(2);
  });

  it('AuthScreen: the password toggle is positioned by the logical end edge', () => {
    expect(stripComments(read('screens/AuthScreen.tsx'))).toMatch(/absolute end-4\b/);
  });
});

describe('logical direction — reading-direction icons state their RTL behaviour', () => {
  for (const rel of ICON_FILES) {
    it(`${rel}: every directional icon carries rtl:-scale-x-100 (or rtl:rotate-180)`, () => {
      const src = stripComments(read(rel));
      const tags = [...src.matchAll(DIRECTIONAL_ICON)].map((m) => m[0]);
      // If the count ever drops to zero the rule has stopped testing anything,
      // so the presence of at least one is asserted rather than assumed.
      expect(tags.length, `${rel}: expected at least one directional icon to exist`).toBeGreaterThan(0);
      const bare = tags.filter((t) => !STATES_RTL.test(t));
      expect(bare, `${rel}: directional icon(s) with no stated RTL behaviour`).toEqual([]);
    });
  }
});

describe('logical direction — the instrument detects what it claims to', () => {
  it('positive control: each blocked pattern matches the shape it names', () => {
    expect(/\btext-left\b/.test('className="mb-10 lg:text-left text-center"')).toBe(true);
    expect(/(?<!-)\bright-4\b/.test('className="absolute right-4 top-1/2"')).toBe(true);
    expect(/\bml-2\b/.test('className="ml-2 text-blue-600"')).toBe(true);
    expect(/\bborder-l-\d/.test('className="border-l-4 border-amber-400"')).toBe(true);
    expect(/\brounded-r-/.test('className="p-5 rounded-r-2xl mb-6"')).toBe(true);
    expect(/group-hover:translate-x-1/.test('className="group-hover:translate-x-1"')).toBe(true);
  });

  it('negative control: the logical forms do NOT match', () => {
    expect(/\btext-left\b/.test('className="mb-10 lg:text-start text-center"')).toBe(false);
    expect(/(?<!-)\bright-4\b/.test('className="absolute end-4 top-1/2"')).toBe(false);
    expect(/\bml-2\b/.test('className="ms-2 text-blue-600"')).toBe(false);
    expect(/\bborder-l-\d/.test('className="border-s-4 border-amber-400"')).toBe(false);
    expect(/\brounded-r-/.test('className="p-5 rounded-e-2xl mb-6"')).toBe(false);
  });

  it('negative control: right-4 does not fire on slide-in-from-right-4', () => {
    // The entrance animation at AuthScreen.tsx:225 is a physical *animation*, not
    // a layout property, and is deliberately out of scope. The lookbehind is what
    // keeps this rule from claiming a fix it did not make.
    expect(/(?<!-)\bright-4\b/.test('animate-in fade-in slide-in-from-right-4')).toBe(false);
  });

  it('comment stripping: a token named in a comment is ignored, a live one is not', () => {
    expect(stripComments('/* was border-l-4 */ className="border-s-4"')).not.toMatch(/\bborder-l-\d/);
    expect(stripComments('// use text-start not text-left\nclassName="text-start"')).not.toMatch(/\btext-left\b/);
    expect(stripComments('className="text-left"')).toMatch(/\btext-left\b/);
    // A URL must survive the line-comment stripper (the `[^:]` guard).
    expect(stripComments('const u = "https://example.com/x"')).toContain('https://example.com/x');
  });

  it('the directional-icon rule detects a bare icon and clears a flipped one', () => {
    const bare = '<ChevronRight size={16} className="text-slate-300 flex-shrink-0" />';
    const flipped = '<ChevronRight size={16} className="text-slate-300 rtl:-scale-x-100" />';
    expect([...bare.matchAll(DIRECTIONAL_ICON)].filter((m) => !STATES_RTL.test(m[0]))).toHaveLength(1);
    expect([...flipped.matchAll(DIRECTIONAL_ICON)].filter((m) => !STATES_RTL.test(m[0]))).toHaveLength(0);
  });
});
