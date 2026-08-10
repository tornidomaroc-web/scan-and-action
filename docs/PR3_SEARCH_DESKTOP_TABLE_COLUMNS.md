# PR 3 — the desktop Search table renders six named columns, from the catalog

Description-only commit. No production code, no test, no catalog key. This
file states the column set, the two decisions the implementation would
otherwise make silently, and the claim the screenshot review is checking
against, so that all of it is reviewable **before** any of it is written.

Scope: `apps/frontend/src/components/ResultTable.tsx`, desktop branch
(`>= md`) only. The mobile card branch (`< md`) is not restyled here; it is
touched only insofar as it consumes the shared extractor (below).

---

## Why this is the last English surface on the Search screen

After #144 deleted the intent strip, English in an Arabic screenshot of
`/search` is attributable to this component alone, by three mechanisms — all
three verified in the current source, not assumed:

1. **Headers are generated from raw field names.** `ResultTable.tsx:15`

   ```ts
   const columnLabel = (h: string) => h.replace(/([A-Z])/g, ' $1').trim();
   ```

   `originalFileName` renders as `original File Name`. There is no catalog
   lookup on this path at all. Every header on the Arabic screen is English,
   in every locale, always.

2. **Desktop cells never translate an enum.** The desktop branch routes every
   value through `formatCellValue`, which returns a non-ISO string verbatim
   (`formatCellValue.ts:96`). So `status: 'COMPLETED'` renders as `COMPLETED`
   and `documentType: 'UNKNOWN_DOCUMENT_TYPE'` renders as itself. The mobile
   card does translate these, via `getStatus` / `getDocTypeLabel`
   (`searchResultCard.ts:88,121`). Only desktop leaks.

3. **The column list is whatever the first row happens to carry.**
   `ResultTable.tsx:38`:

   ```ts
   const headers = Object.keys(data[0]).filter((h) => h !== 'id');
   ```

   That pulls in `summary` (LLM prose, whatever language the model chose),
   `rawText` (the full OCR dump), `detectedLanguage` (a bare `ar`), and
   `documentSubtype`. It also means the column set is decided by row 1: a
   first row missing `vendor` hides that column for every row beneath it.
   That last part is a live correctness bug, not only a localization one, and
   fixing the column set fixes it as a side effect.

## The column set

Six, fixed, in this order:

| # | Column | Source | Header key |
|---|---|---|---|
| 1 | Name | `PrimaryFields.title` | new |
| 2 | Vendor | `PrimaryFields.vendor` | new |
| 3 | Amount | `PrimaryFields.amount` | `amountLabel` (exists, all 3 locales) |
| 4 | Status | `PrimaryFields.status.label` | `status` (exists, all 3 locales) |
| 5 | Date | `uploadedAt` | `date` (exists, all 3 locales) |
| 6 | Confidence | `overallConfidence` | new (`aiConfidence` exists; see below) |

Dropped: `summary`, `rawText`, `detectedLanguage`, `documentSubtype`, and
everything else the passthrough currently exposes.

**Date resolves to `uploadedAt`, not `processedAt`.** Three candidates
existed. `processedAt` is `DateTime?` (`schema.prisma:128`) and is null for
every row still processing, so it would blank exactly on the rows a user is
most likely to be looking at. A document-date fact is not reliably present.
`uploadedAt` is `@default(now())` and non-null (`schema.prisma:127`), and it
is what the query planner sorts by (`queryPlanner.ts:73,129`) — so the date
column shows the value the rows are already ordered by, which is the only
choice that makes the column legible rather than decorative.

**Confidence needs a new key, not `aiConfidence`.** `aiConfidence` ("AI
confidence" / "ثقة الذكاء الاصطناعي") is 22 characters in Arabic and is
written for a detail panel, not a column head. Reusing it puts the widest
string in the table into the narrowest column. A short header key is added.
The value renders as a localized percent; `overallConfidence` is a `Float`
in `0..1` and `formatCellValue` would print the bare `0.42`.

---

## Decision 1 — the shared definition, and the correction to it

**The premise that motivated this is wrong, and the code says so.**

The proposal was: mobile and desktop render the same six fields, so one list
should define them. Mobile does not render six. `getPrimaryFields`
(`searchResultCard.ts:179-192`) returns **four** — `title`, `vendor`,
`amount`, `status`. There is no date and no confidence in it.

That is not an oversight to be corrected by unifying. It is guarded.
`tests/searchRestyle.test.tsx:221` asserts, and passes today:

```ts
expect(m).not.toContain('0.42'); // confidence
```

Confidence is *forbidden* on the mobile card, by name, as the point of
progressive disclosure. A single flat list consumed by both layouts would
either push confidence onto mobile and break that test, or would not be a
single list. There is no version of "one list, both layouts" that is true.

**But the underlying worry is still right, and it is about extraction, not
display.** The drift that would actually hurt is two different answers to
"what is this row's vendor" or two currency formatters. That drift is
already closed: `getVendor`, `getAmount`, `getStatus` are exported and
shared. The only unshared logic this PR adds is date and confidence, used by
desktop alone — there is nothing there to share with mobile.

So the resolution, which is neither of the two options put to me:

- `getPrimaryFields` is extended to return all six, becoming the single
  answer to "what does a search row mean". Both layouts call it.
- **Which of the six each layout displays stays per-layout** — mobile four,
  desktop six — as two short arrays in that one file.
- The invariant that is actually true gets asserted: **desktop's set is a
  superset of mobile's.** A field mobile shows must be a field desktop shows.
  A field desktop shows need not appear on mobile.

That catches the real failure (a column added to one layout and forgotten in
the other, in the direction where forgetting is a bug) without manufacturing
a coupling that contradicts a passing guard. If you want the flat shared
list instead, it costs `searchRestyle.test.tsx:221` and the mobile card's
progressive-disclosure contract; I do not think that trade is worth it.

## Decision 2 — empty cells

**A muted ASCII hyphen-minus (U+002D). This is already what ships.**

`ResultTable.tsx:41-46` already renders exactly this, with the dash rule
already noted in its comment:

```tsx
// Shared muted placeholder for a genuinely empty value (no em/en dash).
<span className="text-ink-fainter" aria-label={s.notAvailable} title={s.notAvailable}>-</span>
```

So this is a decision to **keep**, on the record, not to invent. Grounds:

- A truly empty cell in a six-column grid is ambiguous — the reader cannot
  tell "this document has no vendor" from "this row failed to load".
- It is dash-guard-safe by construction. `dashboardRestyle.test.tsx:141-142`
  and `authErrorI18n.test.tsx:538-539` reject U+2014 and U+2013 in catalog
  strings; U+002D is neither, and the glyph is not a catalog string anyway.
- Changing a shipped, user-visible glyph inside a PR about columns would be
  an unrelated change riding along.

**Which columns can actually blank, checked against the schema, not
guessed:** vendor and amount only. `title` falls back through four sources
to `s.noData` and is never null (`searchResultCard.ts:180-185`).
`overallConfidence` is a non-null `Float` and `uploadedAt` a non-null
`DateTime` (`schema.prisma:125,127`). So the placeholder appears in at most
two of six columns, on documents that genuinely carry no vendor or no
amount — business cards and appointments, mainly. Your read on this was
correct.

One defect I am fixing while in this code rather than leaving behind:
`aria-label` on a `<span>` with no role is not reliably exposed to a screen
reader, so today the blank cell announces as "hyphen" or as nothing. The
visible glyph stays; the accessible name moves to an `sr-only` span carrying
`s.notAvailable`, with the glyph marked `aria-hidden`.

---

## What the guard will assert

Ships in the same commit as the implementation, per #142/#143/#144.

1. **Six columns, exactly, fixed.** A rich row carrying all four dropped
   fields yields six `<th>` (plus the existing chevron cell).
2. **Column set is independent of row 1.** A first row with no `vendor` key
   still yields six columns — the `Object.keys(data[0])` bug, pinned.
3. **The dropped fields do not render.** `summary`, `rawText`,
   `detectedLanguage`, `documentSubtype` absent from the desktop subtree.
4. **Anti-vacuity control on 3.** The fixture is asserted to *carry* those
   four values before their absence is asserted, so a fixture that quietly
   stopped including them cannot produce the same green. Same pattern, same
   reason, as `searchRestyle.test.tsx:454-458`.
5. **Every header is a catalog lookup.** In `ar`, each rendered header
   equals `strings.ar.<key>` and no header equals its `strings.en` value.
   Run for `fr` too, so a key that is present but untranslated fails.
6. **No raw enum in a desktop cell.** `status: 'COMPLETED'` renders
   `strings.ar.statusProcessed`; the string `COMPLETED` appears nowhere in
   the desktop subtree.
7. **Source scan: the generator is gone.** `columnLabel` and the
   `replace(/([A-Z])/g, ...)` header regex are absent from
   `ResultTable.tsx`, comments stripped first, with a positive control that
   the stripper did not blank the file.
8. **Confidence is a localized percent**, not `0.42` and not `42`.
9. **Placeholder.** A row with no vendor and no amount renders the
   placeholder in both cells; the rendered placeholder contains neither
   U+2014 nor U+2013; its accessible name is `s.notAvailable`.
10. **Superset invariant.** Mobile's displayed field set is a subset of
    desktop's column set, asserted over the two arrays.
11. **Catalog parity** for each new key across `en` / `fr` / `ar`:
    present, string, non-empty, no em/en dash.

Guards 5, 6 and 7 are the three mechanisms in "Why this is the last English
surface" — one guard each, so the PR cannot be half-reverted quietly.

---

## What the screenshot review is confirming

Abo Jad, this is the written claim. One screenshot: `/search`, language
Arabic, desktop width `>= 1280px`, after running a query that returns a
table (a `list` intent — "الفواتير الأخيرة"). Please check each line and
say which fail, rather than whether it looks right.

1. The header row has **exactly six** headers.
2. **Every one of the six is Arabic.** No Latin word in the header row at
   all — not `Name`, not `Vendor`, not `Original File Name`.
3. The header row reads **right to left**: the first column starts at the
   **right** edge of the table.
4. Latin in the body is allowed only where it is **user data** — a filename,
   a vendor's own name, a currency code such as `MAD`, and digits. Any Latin
   that is UI wording rather than data is a failure.
5. **No raw enum anywhere**: no `COMPLETED`, `NEEDS_REVIEW`, `PROCESSING`,
   `UNKNOWN_DOCUMENT_TYPE`. Status reads as an Arabic word.
6. **No prose cell and no text dump.** No paragraph-length summary, no wall
   of OCR text, no bare `ar` in its own column.
7. Rows with no vendor or no amount show a **small faint hyphen**, not a
   blank void, and not a long dash.
8. The confidence column reads as a **percentage**, not `0.42`.
9. **No horizontal scrollbar** under the table at 1280px.

If 1-3 pass, this PR did its job. 4-6 are what #144 could not reach. 7-9 are
the two decisions above, made visible.

---

## Sequence

1. This commit — description only.
2. Implementation plus guard, one commit.
3. Screenshot review against the nine claims above.

Not merged from this commit. No catalog key is added until step 2, so `main`
is unchanged in behaviour by this file.
