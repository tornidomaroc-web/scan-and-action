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

// ── GUARD 12: D1 — the free-text columns are bounded and state a direction ─
describe('Guard 12 — bounded Name/Vendor cells: full value recoverable, direction decided', () => {
  afterEach(() => { root.unmount(); container.remove(); localStorage.clear(); });

  // A vendor longer than its own bound, so the vendor half of this guard is
  // about a value that would actually clip rather than one that happens to fit.
  const LONG_VENDOR = 'Societe Marocaine de Distribution SARL';
  const LONG_ROW = { ...RICH_ROW, documentEntities: [{ role: 'VENDOR', entity: { canonicalName: LONG_VENDOR } }] };

  // Positional, and only safe because guard 1 pins the count and guard 5 the order.
  const BOUNDED = { title: 0, vendor: 1 } as const;
  const UNBOUNDED = [2, 3, 4, 5]; // amount, status, date, confidence
  const cells = () => [...desktop()!.querySelectorAll('tbody td')];
  const box = (i: number) => cells()[i].querySelector('div') as HTMLElement | null;

  it('ANTI-VACUITY: the fixtures are longer than their bounds and unbreakable', async () => {
    // Without this the whole guard could pass on values that never clip, which
    // is a different situation wearing the same green.
    const { DESKTOP_COLUMNS } = await import('../src/lib/searchResultCard');
    expect(LONG_NAME.length).toBeGreaterThan(DESKTOP_COLUMNS[BOUNDED.title].maxCh!);
    expect(LONG_VENDOR.length).toBeGreaterThan(DESKTOP_COLUMNS[BOUNDED.vendor].maxCh!);
    // The name is one token: underscores are not break opportunities, which is
    // why it, and not the vendor, was the column that forced the table wide.
    expect(LONG_NAME).not.toMatch(/\s/);
  });

  it('exactly the two free-text columns declare a bound, and it is a real number', () => {
    // Pins the WIDENING decision as data. D1 was reported against the Name cell
    // alone; vendor is bounded too because it is the other free-text column and
    // an unbounded vendor reintroduces the scroll the bound exists to prevent.
    // Also stops the guard going vacuous if a maxCh is deleted.
    return import('../src/lib/searchResultCard').then(({ DESKTOP_COLUMNS }) => {
      const bounded = DESKTOP_COLUMNS.filter((c) => c.maxCh != null).map((c) => c.field);
      expect(bounded).toEqual(['title', 'vendor']);
      for (const c of DESKTOP_COLUMNS.filter((x) => x.maxCh != null)) {
        expect(typeof c.maxCh).toBe('number');
        expect(c.maxCh!).toBeGreaterThan(0);
      }
    });
  });

  for (const [name, idx, value] of [
    ['name', BOUNDED.title, LONG_NAME],
    ['vendor', BOUNDED.vendor, LONG_VENDOR],
  ] as const) {
    it(`ar: the ${name} cell's title attribute is the COMPLETE value`, () => {
      // The point of the attribute: the clipped value stays recoverable. A
      // pre-truncated title (…, slice, or the ellipsis character) is the failure
      // this asserts against, so `toBe` on the whole string, never `toContain`.
      mount('ar', <ResultTable data={[LONG_ROW]} />);
      expect(box(idx)?.getAttribute('title')).toBe(value);
      expect(box(idx)?.getAttribute('title')).not.toContain('…');
    });

    it(`ar: the ${name} cell's TEXT is still the complete value (AT loses nothing)`, () => {
      // The clipping must be CSS, never a JS slice. This is the assertion that
      // protects screen-reader users; the title attribute does not, and is not
      // claimed to — on a role-less <div> it is not reliably an accessible name.
      mount('ar', <ResultTable data={[LONG_ROW]} />);
      expect(box(idx)?.textContent).toBe(value);
    });

    it(`ar: the ${name} cell states dir="auto" specifically`, () => {
      // NOT a presence check. The app-wide Class-B rule accepts any stated
      // direction because no human has looked at those sites; one has looked at
      // this one. `auto` is the only value that keeps the HEAD of both a Latin
      // and an Arabic value — see the reasoning at the render site. Flipping it
      // to "ltr" must be a red test, not a silent preference change.
      mount('ar', <ResultTable data={[LONG_ROW]} />);
      expect(box(idx)?.getAttribute('dir')).toBe('auto');
    });

    it(`ar: the ${name} cell carries the bound its column declares`, () => {
      mount('ar', <ResultTable data={[LONG_ROW]} />);
      return import('../src/lib/searchResultCard').then(({ DESKTOP_COLUMNS }) => {
        expect(box(idx)!.style.maxWidth).toBe(`${DESKTOP_COLUMNS[idx].maxCh}ch`);
      });
    });
  }

  it('the four formatted columns are NOT bounded (the branch is conditional)', () => {
    // If the bounded branch were unconditional this whole guard would still be
    // green while an ellipsis appeared in the date and status cells.
    mount('ar', <ResultTable data={[LONG_ROW]} />);
    for (const i of UNBOUNDED) {
      expect(cells()[i].querySelector('[title]'), `column ${i} should not be bounded`).toBeNull();
      expect(box(i), `column ${i} should render the plain span`).toBeNull();
    }
  });

  it('an empty bounded cell renders the placeholder and no title at all', () => {
    // Not title="" and not title="null": the placeholder path must not grow a
    // tooltip advertising an absent value.
    const BARE = { id: 'doc-3', originalFileName: 'card.jpg', status: 'COMPLETED', uploadedAt: '2026-07-01T10:00:00Z', overallConfidence: 0.7, documentEntities: [], facts: [] };
    mount('ar', <ResultTable data={[BARE]} />);
    expect(cells()[BOUNDED.vendor].querySelector('[title]')).toBeNull();
    expect(cells()[BOUNDED.vendor].querySelector('.sr-only')?.textContent).toBe(strings.ar.notAvailable);
  });

  // HONEST LIMIT OF GUARD 12, stated because the gap is not obvious from the
  // greens above. What is asserted: the value reaching the DOM is complete, the
  // recovery path carries it complete, the direction is the decided one, and the
  // declared bound reaches the element. What is NOT, and cannot be here:
  //   - that the ellipsis lands on the tail rather than the head. jsdom has no
  //     layout engine and no bidi resolution; no test in this repo can show it.
  //     The idiom was proven by hand in Chrome (rtlTruncation.test.ts:17) and
  //     confirmed on the Arabic activity screen, which is why this cell copies a
  //     working site instead of inventing one.
  //   - that `truncate` (the three clipping properties) is still on the box.
  //     Asserting the class token would prove nothing about behaviour while
  //     reading as if it did, which is the false-green shape CLAUDE.md is about.
  //     MEASURED, not assumed: deleting the class leaves all 51 tests green.
  //   - that 24ch and 16ch are the RIGHT numbers. They are arithmetic. Screenshot
  //     check 9a is the measurement, and is the reason this commit exists: with
  //     no bound at all, a scrollbar in that shot could not be attributed.
  //     MEASURED: maxCh 24 -> 40 survives every test here. (24 -> 999 does go
  //     red, but on the anti-vacuity test above and only because the fixture
  //     stops being longer than the bound — that is a fixture check, not a
  //     layout one, and it must not be read as this file having an opinion on
  //     the width.)
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

// ── GUARD 13: F2 — the amount column pins its direction, and carries no <bdi> ─
describe('Guard 13 — amount cell direction (defect F2)', () => {
  afterEach(() => { root.unmount(); container.remove(); localStorage.clear(); });

  // Positional, safe for the same reason guard 12's indices are: guard 1 pins
  // the count and guard 5 the order.
  const IDX = { title: 0, vendor: 1, amount: 2, status: 3, date: 4, confidence: 5 } as const;
  const cells = () => [...desktop()!.querySelectorAll('tbody td')];
  const inner = (i: number) => cells()[i].firstElementChild as HTMLElement | null;

  it('ANTI-VACUITY: the fixture currency actually produces the trap string', () => {
    // Without this the whole guard could pass on a currency that cannot scramble
    // — CHF, say — which is a different situation wearing the same green. The
    // trap is a string that BEGINS with a strong RTL mark and ENDS with a
    // neutral; both halves are required, and both are asserted as code points
    // rather than glyphs, because U+200F is invisible in a diff and in a
    // terminal.
    const s = new Intl.NumberFormat('ar', { style: 'currency', currency: 'USD' }).format(4280);
    const cps = [...s].map((c) => c.codePointAt(0)!);
    expect(cps[0]).toBe(0x200f);                    // leading RIGHT-TO-LEFT MARK
    expect(cps[cps.length - 1]).toBe(0x24);         // trailing '$', a neutral
    // and the letters it gets reordered around are really there, in this order
    expect(s.endsWith('US$')).toBe(true);
    expect(RICH_ROW.facts[0].currency).toBe('USD');
  });

  it('exactly one column declares a direction, it is amount, and it is ltr', () => {
    // Pins the decision as data, beside the header key, the same way guard 12
    // pins maxCh. Also stops the guard going vacuous if the dir is deleted.
    return import('../src/lib/searchResultCard').then(({ DESKTOP_COLUMNS }) => {
      const pinned = DESKTOP_COLUMNS.filter((c) => c.dir != null);
      expect(pinned.map((c) => c.field)).toEqual(['amount']);
      expect(pinned[0].dir).toBe('ltr');
    });
  });

  for (const loc of ['en', 'fr', 'ar'] as const) {
    it(`${loc}: the amount cell carries dir="ltr"`, () => {
      mount(loc, <ResultTable data={[RICH_ROW]} />);
      expect(inner(IDX.amount)?.getAttribute('dir')).toBe('ltr');
    });
  }

  it('ar: STATUS is not dragged along — it stays dir="auto"', () => {
    // The failure this guards is a blanket `dir="ltr"` across the unbounded
    // columns. Status is an Arabic label; ltr there would be actively wrong,
    // and it is the column most likely to be swept up by a "fix the row" edit.
    mount('ar', <ResultTable data={[RICH_ROW]} />);
    expect(inner(IDX.status)?.getAttribute('dir')).toBe('auto');
  });

  it('ar: the two bounded columns keep dir="auto" (screenshot 9c pinned this)', () => {
    // 9c answered A on both columns with `auto`. Pinning it here means a later
    // edit that pins a direction on them has to argue with an observed result.
    mount('ar', <ResultTable data={[RICH_ROW]} />);
    expect(inner(IDX.title)?.getAttribute('dir')).toBe('auto');
    expect(inner(IDX.vendor)?.getAttribute('dir')).toBe('auto');
  });

  it('ar: date and confidence are NOT pinned — they keep dir="auto"', () => {
    mount('ar', <ResultTable data={[RICH_ROW]} />);
    expect(inner(IDX.date)?.getAttribute('dir')).toBe('auto');
    expect(inner(IDX.confidence)?.getAttribute('dir')).toBe('auto');
  });

  it('ar: the amount cell contains NO <bdi>, and neither does the component', () => {
    // THE MOST IMPORTANT ASSERTION IN THIS GUARD, and the least obvious. <bdi>
    // is defined as an isolate whose direction is `auto` — so a <bdi> inside the
    // ltr span re-runs the detection the dir exists to override, finds the
    // leading RLM, and puts the `$` back on the wrong side. Measured in Chrome:
    // `<span dir="ltr"><bdi>…</bdi></span>` renders "$US 42.07", identically to
    // no fix at all. It is exactly the edit a reviewer would make in good faith,
    // reading it as "more isolation", and every other assertion here would stay
    // green while the screen went back to being wrong.
    mount('ar', <ResultTable data={[RICH_ROW]} />);
    expect(cells()[IDX.amount].querySelector('bdi')).toBeNull();
    // The source half is scanned with COMMENTS STRIPPED, and that is not
    // tidiness. Written naively it went RED on its first run — against the
    // warning comment at the render site, which at the time spelled the element
    // out in order to tell the reader not to use it. A guard tripping on its own
    // warning reads exactly like the defect it is hunting, and the tidy fix
    // (never name the thing) would have made the warning useless. Stripping
    // comments keeps both: the note can name it, the assertion sees only code.
    const code = resultTableSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/<bdi[\s>]/);
    // positive control: the stripper did not just empty the file
    expect(code).toMatch(/<span dir=\{c\.dir/);
  });

  // HONEST LIMIT OF GUARD 13, stated for the same reason guard 12 states its
  // own. What is asserted: the declared direction is the one the element
  // carries, no other column was swept up, and the <bdi> that would silently
  // undo it is absent from both the DOM and the source.
  //
  // What is NOT asserted, and cannot be here: THAT THE `$` ACTUALLY LANDS ON
  // THE RIGHT OF `US` ON SCREEN. jsdom has no bidi resolution and no layout, so
  // every string in this file comes back in logical order no matter what any
  // `dir` says — the defect and the fix are literally indistinguishable to it.
  // That is not a gap this file can close by trying harder; it is what the
  // environment is.
  //
  // So SCREENSHOT CHECK 9d OWNS THE RENDER, and it is written in the PR doc
  // with its failing shape spelled out. The direction was proven in Chrome by
  // measuring the on-screen x of each character in an RTL Arabic container
  // against the real Intl string, which is how the <bdi> was ruled out; that
  // measurement is a one-off, not a regression test, and 9d is what re-checks
  // it on the real screen.
  //
  // SIX MUTATIONS, APPLIED AND WATCHED. Recorded as what each one PROVED, and
  // where the result differed from what was predicted before running it, the
  // measured result is what is written down.
  //
  //   M1  dir 'ltr' -> 'auto' in the declaration.
  //       RED x4: the declaration test and all three per-locale tests.
  //       Proves the per-locale tests read the ELEMENT, and that they and the
  //       declaration test fail together when the single source of truth moves.
  //
  //   M2  delete `dir` from the declaration entirely.
  //       RED x4, the same four. Proves the declaration assertion is not vacuous
  //       when the field is ABSENT rather than merely wrong — a different failure
  //       from M1 that a `toBe('ltr')` alone would not have distinguished.
  //
  //   M3  `c.dir ?? 'auto'` -> a literal `'ltr'` at the render site: the blanket
  //       fix, which is the plausible wrong version of this change.
  //       RED x3: status, date/confidence, and — NOT as predicted — the <bdi>
  //       test, via its positive control, because the mutation deleted the very
  //       expression that control looks for. Predicted status only. The extra
  //       red is the positive control proving it is not decorative.
  //
  //   M4  `c.dir ?? 'auto'` -> `'auto'` at the render site, declaration left in
  //       place. RED x4 (three per-locale + the M3 positive control) and GREEN on
  //       the declaration test. Proves declaration and render are independent,
  //       which is the whole reason both are asserted.
  //
  //   M5  wrap the value in an isolate element inside the ltr span — the edit a
  //       reviewer would make in good faith, reading it as "more isolation".
  //       RED x1, that assertion alone. FIFTY tests stayed green, including every
  //       dir assertion above. THIS IS THE MOST IMPORTANT RESULT IN THE FILE: the
  //       direction assertions alone would NOT have caught it, and the screen
  //       would have gone back to "$US 42.07" under a full green suite.
  //
  //   M6  fixture currency 'USD' -> 'CHF'.
  //       RED x1 on anti-vacuity. Proves the guard knows the difference between a
  //       currency that can scramble and one that cannot, instead of passing on
  //       either.
  //
  //   NO MUTATION IS AVAILABLE for the symbol itself — the string is Intl's, not
  //   ours, so nothing here can go red if a future ICU changes `US$`. 9d would
  //   see that; this file would not. Stated so the green is not read as wider
  //   than it is.
});
