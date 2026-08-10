import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';

// ============================================================================
// Desktop Search table — six named, translated columns (PR 3)
// ============================================================================
// GUARD 5 IS WRITTEN FIRST, ON PURPOSE, AND WAS WATCHED FAIL.
//
// Its failure mode is a clean false green. Written AFTER the fix, a header
// assertion passes whether or not the catalog is being read, because in `en`
// the generated English and the catalog value agree — and `en` is what anyone
// runs by reflex. Only `ar` and `fr` discriminate, and you only know they
// discriminate if you have seen them red. Same class as the CR-grep trap in
// CLAUDE.md: confident, quotable, and wrong with nothing to prompt a second
// look.
//
// Recorded failure against 713636e (ResultTable.tsx:15's columnLabel, before
// any production edit in this PR):
//   ar  expected 'original File Name' to be 'الاسم'
//   fr  expected 'original File Name' to be 'Nom'
// ============================================================================

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ResultTable } from '../src/components/ResultTable';

// Read at MODULE scope, matching searchRestyle.test.tsx:32. It cannot be done
// inside an `it()`: jsdom installs its own whatwg-url `URL` global, which
// rejects a file: scheme, so the same call throws ERR_INVALID_URL_SCHEME once
// the environment is live. Verified by watching it throw.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const resultTableSrc = read('../src/components/ResultTable.tsx');

let container: HTMLDivElement;
let root: Root;

function mount(lang: 'en' | 'fr' | 'ar', element: React.ReactElement) {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root.render(<LanguageProvider>{element}</LanguageProvider>));
}

// The desktop subtree only. Scopes every assertion away from the mobile card
// branch, which renders the same rows with a deliberately narrower field set.
const desktop = () => (container.querySelector('div.md\\:block') as HTMLElement) ?? null;
const desktopText = () => desktop()?.textContent ?? '';
const headerTexts = () => [...(desktop()?.querySelectorAll('thead th') ?? [])]
  .map((th) => (th.textContent ?? '').trim())
  .filter((t) => t.length > 0); // drops the aria-hidden chevron cell

// A rich row carrying EVERY field the six-column set drops, so the absence
// assertions have something real to be absent.
const LONG_NAME = 'JPEG_20260615_222241_1286235000237534355.jpg';
const RICH_ROW = {
  id: 'doc-7',
  originalFileName: LONG_NAME,
  documentType: 'UNKNOWN_DOCUMENT_TYPE',
  documentSubtype: 'PROFORMA',
  detectedLanguage: 'ar',
  summary: 'Quarterly retainer invoice.',
  rawText: 'FACTURE No 2026-0042 ... full OCR dump ...',
  overallConfidence: 0.42,
  status: 'COMPLETED',
  uploadedAt: '2026-07-01T10:00:00Z',
  processedAt: '2026-07-02T11:00:00Z',
  documentEntities: [{ role: 'VENDOR', entity: { canonicalName: 'Aurora Studios' } }],
  facts: [{ key: 'AMOUNT', factType: 'AMOUNT', valueNumber: 4280, currency: 'USD' }],
  notes: null,
};

// The six header keys, in render order. Four are pre-existing, shipped copy;
// only nameLabel and confidenceLabel are new in this PR.
const HEADER_KEYS = ['nameLabel', 'entityRoleVendor', 'amountLabel', 'status', 'date', 'confidenceLabel'] as const;

// ── GUARD 5: every header is a catalog lookup ──────────────────────────────
describe('Guard 5 — desktop headers come from the catalog, in every locale', () => {
  afterEach(() => { root.unmount(); container.remove(); localStorage.clear(); });

  for (const loc of ['en', 'fr', 'ar'] as const) {
    it(`${loc}: the six headers are exactly the ${loc} catalog values, in order`, () => {
      mount(loc, <ResultTable data={[RICH_ROW]} />);
      const expected = HEADER_KEYS.map((k) => (strings[loc] as Record<string, string>)[k]);
      expect(headerTexts()).toEqual(expected);
    });
  }

  // NOTE ON A GUARD THAT WAS REMOVED.
  // The doc for this PR named a broader assertion here: "no header equals its
  // EN catalog value". It was written, run, and deleted, because it is wrong in
  // BOTH directions:
  //   - It was GREEN against the broken component. The generated header was
  //     'original File Name', which is not in the EN catalog, so "differs from
  //     English" held perfectly while every header was English. It would have
  //     shipped as a passing guard over the exact defect it was written for.
  //   - It then went RED against the CORRECT component, on fr.date: the French
  //     for "Date" is "Date". A legitimate identical translation is
  //     indistinguishable from a missing one by this test.
  // The positional `toEqual` above subsumes it and has neither failure. What is
  // kept below is the narrow, sound residue: the two NEW keys really must
  // differ from English in fr, since neither "Nom" nor "Confiance" is its
  // English spelling.
  const NEW_KEY_INDEXES = [0, 5]; // nameLabel, confidenceLabel

  it('fr: the two NEW headers are not the English spelling', () => {
    mount('fr', <ResultTable data={[RICH_ROW]} />);
    const rendered = headerTexts();
    for (const i of NEW_KEY_INDEXES) {
      const key = HEADER_KEYS[i];
      expect(rendered[i], `${key} is untranslated in fr`).not.toBe((strings.en as Record<string, string>)[key]);
    }
  });

  it('ar: no header contains a Latin letter at all', () => {
    mount('ar', <ResultTable data={[RICH_ROW]} />);
    for (const h of headerTexts()) {
      expect(h, `header "${h}" contains Latin`).not.toMatch(/[A-Za-z]/);
    }
  });
});

// ── GUARD 1/2/3/4: the column set is fixed, and independent of row 1 ───────
describe('Guards 1-4 — six fixed columns, not Object.keys(data[0])', () => {
  afterEach(() => { root.unmount(); container.remove(); localStorage.clear(); });

  it('renders exactly six data columns for a rich row', () => {
    mount('en', <ResultTable data={[RICH_ROW]} />);
    expect(headerTexts().length).toBe(6);
  });

  it('still renders six columns when row 1 lacks vendor and amount', () => {
    // The Object.keys(data[0]) bug: a sparse first row used to delete columns
    // for every row beneath it. Row 2 carries the vendor that row 1 lacks.
    const sparse = { id: 'doc-1', originalFileName: 'a.jpg', status: 'PROCESSING', uploadedAt: '2026-07-01T10:00:00Z', overallConfidence: 0.9 };
    mount('en', <ResultTable data={[sparse, RICH_ROW]} />);
    expect(headerTexts().length).toBe(6);
    expect(desktopText()).toContain('Aurora Studios'); // row 2's vendor still has a cell
  });

  it('the dropped fields do not render (with an anti-vacuity control)', () => {
    // ANTI-VACUITY: prove the fixture actually carries each value before
    // asserting the DOM lacks it. Without this, a fixture that quietly stopped
    // including these produces an identical green. Same pattern and same
    // reason as searchRestyle.test.tsx:454-458.
    const dropped = [RICH_ROW.summary, RICH_ROW.rawText, RICH_ROW.documentSubtype, RICH_ROW.detectedLanguage];
    for (const v of dropped) expect(typeof v === 'string' && v.length > 0).toBe(true);

    mount('en', <ResultTable data={[RICH_ROW]} />);
    const d = desktopText();
    expect(d).not.toContain(RICH_ROW.summary);
    expect(d).not.toContain(RICH_ROW.rawText);
    expect(d).not.toContain(RICH_ROW.documentSubtype);
    expect(d).not.toContain('[object Object]');
  });

  it('the six columns still render their real values', () => {
    mount('en', <ResultTable data={[RICH_ROW]} />);
    const d = desktopText();
    expect(d).toContain(LONG_NAME);
    expect(d).toContain('Aurora Studios');
    expect(d).toContain('4,280'); // currency-formatted, not the bare number
  });
});

// ── GUARD 6: no raw enum reaches a desktop cell ────────────────────────────
describe('Guard 6 — desktop cells translate enums (they used to render raw)', () => {
  afterEach(() => { root.unmount(); container.remove(); localStorage.clear(); });

  it('en: status renders the translated label, never COMPLETED', () => {
    mount('en', <ResultTable data={[RICH_ROW]} />);
    expect(desktopText()).toContain(strings.en.statusProcessed);
    expect(desktopText()).not.toContain('COMPLETED');
  });

  it('ar: status renders the Arabic label, never COMPLETED', () => {
    mount('ar', <ResultTable data={[RICH_ROW]} />);
    expect(desktopText()).toContain(strings.ar.statusProcessed);
    expect(desktopText()).not.toContain('COMPLETED');
  });

  it('no raw enum spelling survives anywhere in the desktop subtree', () => {
    mount('ar', <ResultTable data={[RICH_ROW]} />);
    for (const raw of ['COMPLETED', 'NEEDS_REVIEW', 'PROCESSING', 'UNKNOWN_DOCUMENT_TYPE', 'PROFORMA']) {
      expect(desktopText()).not.toContain(raw);
    }
  });
});

// ── GUARD 7: the header generator is gone from the source ──────────────────
describe('Guard 7 — columnLabel and its camelCase regex are deleted', () => {
  it('ResultTable.tsx contains no header generator (comments stripped)', () => {
    // Comments are stripped first for the same reason as
    // searchRestyle.test.tsx:515: the deletion site documents WHAT was deleted
    // and names `Object.keys(data[0])` and `columnLabel` in doing so. An
    // unstripped scan fails on its own documentation, and the documentation
    // gets deleted to make it green.
    const code = resultTableSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    // Positive control: the stripper must not simply blank the file. Without
    // this, a stripper bug turns every assertion below into a vacuous pass.
    expect(code).toContain('export const ResultTable');
    expect(code).not.toContain('columnLabel');
    expect(code).not.toMatch(/replace\(\/\(\[A-Z\]\)\/g/);
    expect(code).not.toContain('Object.keys(data[0])');
  });
});

// ── GUARD 8: confidence is a localized percent ─────────────────────────────
describe('Guard 8 — confidence renders as a localized percent', () => {
  afterEach(() => { root.unmount(); container.remove(); localStorage.clear(); });

  it('en: 0.42 renders as 42%, not 0.42 and not 42', () => {
    mount('en', <ResultTable data={[RICH_ROW]} />);
    const d = desktopText();
    expect(d).toContain('42%');
    expect(d).not.toContain('0.42');
  });

  it('fr: uses the French percent form (proves Intl, not string concat)', () => {
    mount('fr', <ResultTable data={[RICH_ROW]} />);
    // fr-FR inserts U+202F (narrow no-break space) before the sign.
    expect(desktopText()).toContain(new Intl.NumberFormat('fr', { style: 'percent' }).format(0.42));
    expect(desktopText()).not.toContain('0.42');
  });

  it('a confidence of 0 renders as 0%, not as the empty placeholder', () => {
    // 0 is a real score. The old `value || placeholder` shape drops it.
    mount('en', <ResultTable data={[{ ...RICH_ROW, overallConfidence: 0 }]} />);
    expect(desktopText()).toContain('0%');
  });
});

// ── GUARD 9: the empty-cell placeholder ────────────────────────────────────
describe('Guard 9 — blank vendor/amount show the placeholder, dash-safe', () => {
  afterEach(() => { root.unmount(); container.remove(); localStorage.clear(); });

  const BARE = { id: 'doc-2', originalFileName: 'card.jpg', status: 'COMPLETED', uploadedAt: '2026-07-01T10:00:00Z', overallConfidence: 0.7, documentEntities: [], facts: [] };

  it('renders a placeholder in the vendor and amount cells', () => {
    mount('en', <ResultTable data={[BARE]} />);
    const cells = [...desktop()!.querySelectorAll('tbody td')];
    // Columns are FIXED, so vendor (1) and amount (2) are positional. That is
    // only safe because guard 1 pins the count and guard 5 pins the order.
    // Assert the VISIBLE glyph, not cell.textContent: textContent now also
    // contains the sr-only accessible name, so a `toBe('-')` on the cell reads
    // '-Not available' and fails for the wrong reason.
    for (const i of [1, 2]) {
      expect(cells[i].querySelector('[aria-hidden="true"]')?.textContent).toBe('-');
      expect(cells[i].querySelector('.sr-only')?.textContent).toBe(strings.en.notAvailable);
    }
    // And a populated cell must NOT carry one, or the placeholder is unconditional.
    expect(cells[0].querySelector('.sr-only')).toBeNull();
  });

  it('the placeholder is neither an em dash nor an en dash', () => {
    mount('en', <ResultTable data={[BARE]} />);
    const points = [...desktopText()].map((c) => c.codePointAt(0));
    expect(points, 'em dash U+2014 in the desktop table').not.toContain(0x2014);
    expect(points, 'en dash U+2013 in the desktop table').not.toContain(0x2013);
  });

  it('the placeholder carries an accessible name (not a bare aria-label on a span)', () => {
    mount('ar', <ResultTable data={[BARE]} />);
    const sr = desktop()!.querySelector('.sr-only');
    expect(sr?.textContent).toBe(strings.ar.notAvailable);
    // The visible glyph must be hidden from AT, or the cell announces twice.
    expect(desktop()!.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});

// ── GUARD 10: desktop's set is a superset of mobile's ──────────────────────
describe('Guard 10 — desktop shows every field mobile shows', () => {
  it('MOBILE_FIELDS is a subset of DESKTOP_COLUMNS', async () => {
    const { MOBILE_FIELDS, DESKTOP_COLUMNS } = await import('../src/lib/searchResultCard');
    const desktopFields = new Set(DESKTOP_COLUMNS.map((c) => c.field));
    // Positive control: neither list is empty, or the subset check is vacuous.
    expect(MOBILE_FIELDS.length).toBeGreaterThan(0);
    expect(desktopFields.size).toBe(6);
    for (const f of MOBILE_FIELDS) {
      expect(desktopFields, `mobile renders "${f}" but desktop has no such column`).toContain(f);
    }
  });

  it('confidence stays OFF the mobile card (progressive disclosure is preserved)', async () => {
    const { MOBILE_FIELDS } = await import('../src/lib/searchResultCard');
    // The superset invariant is deliberately ONE-WAY. This pins the other
    // direction: desktop-only fields must not drift onto the card, which is
    // what searchRestyle.test.tsx:221 asserts at the DOM level.
    expect(MOBILE_FIELDS).not.toContain('confidence');
    expect(MOBILE_FIELDS).not.toContain('date');
  });
});

// ── GUARD 11: catalog parity for the two NEW keys ──────────────────────────
describe('Guard 11 — catalog parity for the new keys', () => {
  // Only these two are new. entityRoleVendor / amountLabel / status / date are
  // pre-existing, shipped, already-approved copy and are reused unchanged.
  const NEW_KEYS = ['nameLabel', 'confidenceLabel'] as const;

  for (const loc of ['en', 'fr', 'ar'] as const) {
    for (const key of NEW_KEYS) {
      it(`strings.${loc}.${key} is present, non-empty, and dash-clean`, () => {
        const v = (strings[loc] as Record<string, unknown>)[key];
        expect(typeof v).toBe('string');
        expect((v as string).length).toBeGreaterThan(0);
        expect(v).not.toContain('—');
        expect(v).not.toContain('–');
      });
    }
  }

  // Code-point pins for the new ARABIC copy. Approved as numbers, not glyphs:
  // a flipped codepoint is invisible in a bidi-reordered terminal, so the
  // approval and the assertion are both expressed in numbers.
  it('ar.nameLabel is exactly U+0627 U+0644 U+0627 U+0633 U+0645', () => {
    expect([...strings.ar.nameLabel].map((c) => c.codePointAt(0))).toEqual([0x0627, 0x0644, 0x0627, 0x0633, 0x0645]);
  });

  it('ar.confidenceLabel is exactly U+0627 U+0644 U+062B U+0642 U+0629', () => {
    expect([...strings.ar.confidenceLabel].map((c) => c.codePointAt(0))).toEqual([0x0627, 0x0644, 0x062B, 0x0642, 0x0629]);
  });

  it('neither new Arabic string carries a bidi control or a presentation form', () => {
    for (const key of NEW_KEYS) {
      for (const cp of [...strings.ar[key]].map((c) => c.codePointAt(0)!)) {
        // U+200E/F, U+202A-E, U+2066-9: invisible, and would survive a glyph review.
        expect(cp === 0x200e || cp === 0x200f).toBe(false);
        expect(cp >= 0x202a && cp <= 0x202e).toBe(false);
        expect(cp >= 0x2066 && cp <= 0x2069).toBe(false);
        // U+FB50-FDFF / U+FE70-FEFF: Arabic presentation forms. Legal, render
        // identically, and break search/collation. Shaping is the font's job.
        expect(cp >= 0xfb50 && cp <= 0xfdff).toBe(false);
        expect(cp >= 0xfe70 && cp <= 0xfeff).toBe(false);
      }
    }
  });
});
