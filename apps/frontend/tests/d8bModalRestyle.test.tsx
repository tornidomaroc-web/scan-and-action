import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// ============================================================================
// D8b — modal restyle contract (source scan + DOM direction guard).
// ============================================================================
// Mirrors documentDetailRestyle.test.tsx:457-489, with two deliberate upgrades.
//
// 1. THE BAN LIST IS STRICTER. The original RAW_PALETTE
//    (documentDetailRestyle.test.tsx:465-470) bans `text-*` and `bg-*` on the raw
//    palette but NOT `border-*` or `shadow-*`. So a file could keep
//    `border-slate-200`, `focus:border-red-500` and `shadow-red-500/20` and still
//    report a GREEN contract — "green" would not mean "migrated". DeleteAccountModal
//    carried exactly those four before D8b PR 2. Verified before landing: every one
//    of the eight already-restyled files (DocumentDetailScreen, DecisionBanner,
//    FixActionPanel, SharedComponents, ActivityScreen, DashboardScreen,
//    SearchScreen, ReviewQueueScreen) already satisfies this stricter list, so
//    closing the holes costs nothing and touches nothing.
//
// 2. IT GUARDS PHYSICAL DIRECTION. The RTL work in D5/D7 (PR #90/#91) was about
//    truncation + bidi. This modal has no truncate at all — but it had TWO
//    physical-direction defects that no existing guard could see:
//      - the close button pinned `right-2`  -> wrong corner in Arabic
//      - the disclosure box `border-l-4 ... rounded-r-2xl` -> the accent bar landed
//        on the trailing edge in Arabic, on the REQUIRED compliance notice
//    The canonical idiom already existed at SearchScreen.tsx:204
//    (`rounded-e-card border-s-4 border-accent`). Tailwind is ^3.4.3, so logical
//    properties are available.
//
// ⚠️ jsdom HAS NO LAYOUT ENGINE. These tests assert CLASS NAMES, which is a real
// regression guard but is NOT proof of RTL correctness — they cannot tell you
// which side anything actually renders on. Per the D5 lesson (a live RTL defect
// that green CI, the Vercel preview and jsdom ALL missed), the Arabic modal must
// still be opened in a real browser. Green here proves nobody reintroduced a
// physical property; it does not prove the pixels.
//
// CaptureSheet and UploadModal join FILES in PR 3 and PR 4.
// ============================================================================

const dir = path.dirname(fileURLToPath(import.meta.url));

// Strip comments before scanning. documentDetailRestyle.test.tsx scans the raw
// file, which works only because its files never NAME a banned literal in prose.
// This contract deliberately documents its own traps in-file ("do not use
// bg-danger behind text-white", "border-l-4 landed on the trailing edge"), and a
// naive substring scan would fail on the very comments that prevent the bug.
// The contract is about CLASSES, not prose: a banned literal inside a comment
// renders nothing. Scanning code-only keeps the guard honest in both directions.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const read = (p: string) => stripComments(readFileSync(path.resolve(dir, p), 'utf8'));

const FILES = {
  deleteAccountModal: read('../src/components/DeleteAccountModal.tsx'),
};

// The documentDetailRestyle list…
const RAW_PALETTE = [
  'bg-white', 'dark:bg-slate', 'text-slate-', 'bg-slate-',
  'text-blue-', 'bg-blue-', 'text-emerald-', 'bg-emerald-',
  'text-red-', 'bg-red-', 'text-amber-', 'bg-amber-',
  'text-rose-', 'bg-rose-', 'dark:text-', 'dark:border-',
];
// …plus the holes it leaves open. A green contract must mean a migrated file.
const RAW_PALETTE_EXTENDED = [
  ...RAW_PALETTE,
  'border-slate-', 'border-blue-', 'border-red-', 'border-amber-',
  'border-emerald-', 'border-rose-', 'border-gray-',
  'shadow-blue-', 'shadow-red-', 'shadow-emerald-', 'shadow-amber-',
  'text-gray-', 'bg-gray-',
];
const LEGACY = ['btn-primary', 'btn-secondary', 'saas-card', 'saas-table', 'nav-item'];
const EMOJI = ['✅', '⚠️', '🚩'];

// Physical direction properties. Each mirrors incorrectly under `dir="rtl"`.
// `dir="ltr"` on the email input is CORRECT and deliberate (an email is LTR in
// every locale) and is not a physical *layout* property, so it is not banned here.
const PHYSICAL_DIRECTION: Array<[RegExp, string]> = [
  [/\bborder-l-\d/, 'border-l-* → border-s-*'],
  [/\bborder-r-\d/, 'border-r-* → border-e-*'],
  [/\brounded-l\b|\brounded-l-/, 'rounded-l* → rounded-s*'],
  [/\brounded-r\b|\brounded-r-/, 'rounded-r* → rounded-e*'],
  [/(?<!-)\bleft-\d/, 'left-* → start-*'],
  [/(?<!-)\bright-\d/, 'right-* → end-*'],
  [/\bml-\d/, 'ml-* → ms-*'],
  [/\bmr-\d/, 'mr-* → me-*'],
  [/\bpl-\d/, 'pl-* → ps-*'],
  [/\bpr-\d/, 'pr-* → pe-*'],
  [/\btext-left\b/, 'text-left → text-start'],
  [/\btext-right\b/, 'text-right → text-end'],
];

describe('D8b modal restyle — source is on tokens (strict)', () => {
  for (const [name, src] of Object.entries(FILES)) {
    it(`${name}: no raw Tailwind palette literals (incl. border-*/shadow-*)`, () => {
      for (const p of RAW_PALETTE_EXTENDED) {
        expect(src, `raw palette literal "${p}" must be a --sa token`).not.toContain(p);
      }
    });

    it(`${name}: no legacy classes`, () => {
      for (const c of LEGACY) expect(src).not.toContain(c);
    });

    it(`${name}: no emoji`, () => {
      for (const e of EMOJI) expect(src).not.toContain(e);
    });

    it(`${name}: no font-black and no rounded-[32px]/[40px] mega-radius`, () => {
      expect(src).not.toContain('font-black');
      expect(src).not.toContain('rounded-[32px]');
      expect(src).not.toContain('rounded-[40px]');
    });

    it(`${name}: uses the shared type scale, not ad-hoc sizes`, () => {
      expect(src).toMatch(/text-(title-lg|section|label|kpi)/);
    });

    it(`${name}: no PHYSICAL direction properties (they mirror wrong in Arabic)`, () => {
      for (const [re, fix] of PHYSICAL_DIRECTION) {
        expect(re.test(src), `found a physical direction property — use the logical form: ${fix}`).toBe(false);
      }
    });
  }

  it('deleteAccountModal: uses the logical direction idiom (SearchScreen.tsx:204)', () => {
    const src = FILES.deleteAccountModal;
    expect(src).toMatch(/\bborder-s-\d/);   // the disclosure accent bar
    expect(src).toMatch(/\brounded-e-/);    // its trailing rounding
    expect(src).toMatch(/\bend-\d/);        // the close button corner
  });

  it('deleteAccountModal: keeps dir="ltr" on the email input (correct, deliberate)', () => {
    expect(FILES.deleteAccountModal).toContain('dir="ltr"');
  });
});

// ============================================================================
// The header must NOT become `bg-danger` + `text-white`.
// ============================================================================
// --sa-danger is a SEMANTIC token designed for text/dots/icons, and it flips to a
// LIGHT red in dark mode (tokens.css:122 -> #F87171). Used as a FILL behind white
// text it computes to:
//     light #D9584A vs #FFF = 3.86:1  (fails AA normal 4.5)
//     dark  #F87171 vs #FFF = 2.77:1  (fails AA large 3.0 too)
// against today's bg-red-600 #DC2626 = 4.83:1. The "obvious" token migration is an
// ACCESSIBILITY REGRESSION, and it would be inherited by CaptureSheet and
// UploadModal, whose headers are bg-blue-600.
//
// The system's real danger idiom is quiet: bg-danger-tint + text-danger-text +
// border-danger/30 (ErrorState.tsx:17-21 = 5.17:1). bg-accent IS safe as a fill
// (#635BFF in BOTH modes = 4.70:1) — which is why it is the only established
// solid-fill idiom in the codebase.
// ============================================================================
describe('D8b modal restyle — the danger fill trap stays closed', () => {
  it('deleteAccountModal: never pairs a bg-danger fill with text-white', () => {
    const src = FILES.deleteAccountModal;
    const classAttrs = src.match(/className="[^"]*"/g) ?? [];
    for (const attr of classAttrs) {
      const isDangerFill = /\bbg-danger\b(?!-)/.test(attr); // bg-danger, not bg-danger-tint
      if (isDangerFill) {
        expect(
          /\btext-white\b/.test(attr),
          `bg-danger as a fill behind text-white computes to 2.77:1 in dark mode — ` +
            `use the quiet idiom (bg-danger-tint + text-danger-text) or bg-accent (4.70:1). Offending: ${attr}`
        ).toBe(false);
      }
    }
  });
});

// ============================================================================
// DOM-level direction guard — what jsdom CAN actually prove.
// ============================================================================
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../src/native/useBackDismiss', () => ({ useBackDismiss: () => {} }));
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'rtl-check@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));
vi.mock('../src/services/accountService', () => ({
  accountService: { deleteAccount: vi.fn() },
}));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { DeleteAccountModal } from '../src/components/DeleteAccountModal';

let container: HTMLDivElement;
let root: Root;

function mount(lang: 'en' | 'ar') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <DeleteAccountModal isOpen onClose={() => {}} onDeleted={() => {}} />
      </LanguageProvider>
    );
  });
}

describe('DeleteAccountModal DOM — direction-agnostic markup in Arabic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => {
    root.unmount();
    container.remove();
    document.body.innerHTML = '';
  });

  it('AR: the close button is pinned to the inline END, not the physical right', () => {
    mount('ar');
    const x = document.body.querySelector(
      `button[aria-label="${strings.ar.deleteAccountCancel}"]`
    ) as HTMLElement;
    expect(x, 'the close button should render').toBeTruthy();
    expect(x.className).toMatch(/\bend-\d/);
    expect(x.className).not.toMatch(/(?<!-)\bright-\d/);
  });

  it('AR: the disclosure box accent bar uses a logical border, not border-l', () => {
    mount('ar');
    // Anchor on the disclosure paragraph itself, then take its box — querying
    // divs and reaching for `querySelector('p')` finds the FIRST p in the
    // subtree (the warning body), not this one.
    const p = [...document.body.querySelectorAll('p')].find(
      (el) => el.textContent === strings.ar.deleteAccountSubscriptionWarning
    );
    expect(p, 'the disclosure paragraph should render').toBeTruthy();
    const box = p!.parentElement!;
    expect(box.className).toMatch(/\bborder-s-\d/);
    expect(box.className).not.toMatch(/\bborder-l-\d/);
    expect(box.className).not.toMatch(/\brounded-r-/);
  });

  it('AR: the page-level dir is rtl but the email input stays ltr', () => {
    mount('ar');
    const input = document.body.querySelector('#delete-confirm') as HTMLInputElement;
    expect(input.getAttribute('dir')).toBe('ltr');
  });
});
