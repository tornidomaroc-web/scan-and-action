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
| 1 | Name | `PrimaryFields.title` | `nameLabel` — **new** |
| 2 | Vendor | `PrimaryFields.vendor` | `entityRoleVendor` (exists, all 3 locales) |
| 3 | Amount | `PrimaryFields.amount` | `amountLabel` (exists, all 3 locales) |
| 4 | Status | `PrimaryFields.status.label` | `status` (exists, all 3 locales) |
| 5 | Date | `uploadedAt` | `date` (exists, all 3 locales) |
| 6 | Confidence | `overallConfidence` | `confidenceLabel` — **new** |

**Only two keys are new.** The vendor header reuses `entityRoleVendor`
(`strings.ts:271`, 'Vendor' / 'Fournisseur' / Arabic), which is shipped,
approved copy that already means exactly this. `amountLabel` is already a
`<th>` in `ReviewQueueScreen.tsx:252`, and `date` already labels `uploadedAt`
in `DocumentDetailScreen.tsx:209` — the second of those is an independent
confirmation of the date ruling below, made on a different screen before this
PR existed.

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

## Approval record — the new Arabic copy, approved as numbers

Approved by Abo Jad, decoded independently before presentation, unchanged:

```
ar.nameLabel        [1575, 1604, 1575, 1587, 1605]   U+0627 U+0644 U+0627 U+0633 U+0645
ar.confidenceLabel  [1575, 1604, 1579, 1602, 1577]   U+0627 U+0644 U+062B U+0642 U+0629
```

**Approved as numbers, not as glyphs.** The arrays above are the approved
artifact. What those code points render as depends on the font, the shaping
engine and the surrounding bidi context, none of which are part of the
approval — which is the whole reason the approval is expressed this way. A
later reader comparing a screenshot against this section is comparing the
wrong thing; compare against `strings.ts` via guard 11, which pins these exact
arrays.

The other four Arabic headers (`entityRoleVendor`, `amountLabel`, `status`,
`date`) are pre-existing shipped copy, unchanged by this PR, and were
deliberately **not** put up for approval: re-approving a live string invites
an edit that would silently change Review Queue and Document Detail too.

---

## What the screenshot review is confirming

Abo Jad — each numbered item below gives a **pass shape and a fail shape**.
Answer each one, rather than saying whether the screen looks right. Where a
fail shape names a literal string, that string is what would actually appear;
seeing it is the failure, no interpretation needed.

Setup: `/search`, language Arabic, after a query returning a table (a `list`
intent, e.g. "الفواتير الأخيرة"). **Two widths — see 9a, 9c and 9b.**

**Order of work, so the two shots are taken once each.** Everything except 9b
is answered at **1280px**: items 1-8, then 9a, then 9c. Only then resize to
768px, where the three questions in 9b are the *only* ones to answer. Do not
re-answer 1-8 at 768px: at that width the cells are clipped, so "no English
word visible" would mean "not visible" rather than "not there" — a false pass.
9c in particular cannot be answered at 768px, for the reason stated in 9c.

Items 1-8 are checked on the 1280px shot.

| # | PASS looks like | FAIL looks like |
|---|---|---|
| 1 | Exactly **six** headers, plus a narrow empty chevron column | Any other count. Thirteen headers means the change did not take. Five means a column was dropped. |
| 2 | All six headers Arabic | Any of `Name`, `Vendor`, `Amount`, `Status`, `Date`, `Confidence`, or `original File Name` in the header row |
| 3 | First column at the **right** edge; chevron at the **left** | Name at the left edge and the chevron at the right — the table did not mirror |
| 4 | Latin only as user data: filenames, vendor names, `MAD`/`USD`, digits | An English **UI word** in a body cell — most likely `Not available` appearing as visible text, which means the `sr-only` class did not apply and the screen-reader-only name leaked on screen |
| 5 | Status reads as an Arabic word | `COMPLETED`, `NEEDS_REVIEW`, `PROCESSING`, `UNKNOWN_DOCUMENT_TYPE`, or `PROFORMA` visible anywhere |
| 6 | Every cell is short | A cell holding a full sentence (the summary), a wall of OCR text (rawText), or a lone `ar` / `AR` in its own column |
| 7 | Empty vendor/amount show a **small faint hyphen** `-` | A completely empty cell; **or** a long dash `—` / `–`; **or** the words `Not available` printed where the hyphen should be |
| 8 | Confidence reads e.g. `42%` | `0.42` (the raw ratio), or `42` with no percent sign, or `4200%` (a value multiplied twice) |

If 1-3 pass, this PR did its job. 4-6 are what #144 could not reach. 7-8 are
the two decisions above, made visible.

### 9a. Wide width — a claim, with a pass condition

**1280px viewport.** Available table width is 872px: 1280 minus the 280px
fixed rail (`Layout.tsx:99`) minus 128px of `xl:p-16` padding
(`Layout.tsx:105`).

- **PASS:** no horizontal scrollbar under the table, and the Confidence
  column (the last one, at the **left** edge in Arabic) is fully visible.
- **FAIL:** a horizontal scrollbar, or the last column clipped at the left
  edge.

Report the result either way; do not adjust the window to make it pass.

**What a failure here would and would not mean.** The two bounds that make
this answerable — `maxCh: 24` on Name and `maxCh: 16` on Vendor — are
arithmetic off `Layout.tsx`, and nothing in this repository can evaluate them.
The mutation `maxCh: 24 → 40` passes every test in
`searchTableColumns.test.tsx`. So **9a tests that arithmetic, not the change**:
a scrollbar here means the two numbers are wrong, not that the six-column
table is wrong. If it fails, the fix is to change those two numbers in
`DESKTOP_COLUMNS` (`lib/searchResultCard.ts`) and nothing else — no column is
added or removed, no direction is revisited, no test is relaxed. Report the
number; do not change it yourself.

This was written before the bound existed, when a scrollbar in the shot could
not be attributed to anything in particular because no column had any bound at
all. It can be attributed now. That is the only thing about 9a that changed.

### 9c. Wide width — which end does the ellipsis eat?

**1280px viewport — the same shot as 9a. Answer this before resizing.**

The Name column is bounded at 24 characters and the Vendor column at 16, so a
value longer than its bound is cut short and marked with an ellipsis `…`. This
check asks **which end got cut**, and it is the whole reason the review exists:
in an Arabic interface a Latin filename can lose its *beginning* rather than
its end, and a reader is then shown a wrong string rather than a shortened one.
Nothing else in this repository can observe this. `searchTableColumns.test.tsx`
asserts the direction attribute, but the clipping itself is CSS and the test
environment loads no CSS — deleting the `truncate` class leaves every test
green. This screenshot is the only instrument that sees the actual behaviour.

Find a cell in the **Name** column whose text is cut short and ends or begins
with `…`. A filename such as
`JPEG_20260615_222241_1286235000237534355.jpg` is 44 characters and will be
cut. Then answer **A**, **B** or **C** — one letter:

- **A — PASS.** The cell reads from its **beginning** and the `…` is at the
  **far end** of the text: `JPEG_20260615_2222…`. The start of the name is
  intact and you can tell what the file is.
- **B — FAIL.** The cell begins with `…` and the **start of the name is
  gone**: `…86235000237534355.jpg`. This is the failure this check was written
  to catch. It is not "a bit cut off" — the reader is shown a different string
  from the real one, and two different files whose names differ only at the
  front become indistinguishable. Report B plainly; it fails the PR.
- **C — UNANSWERABLE, which is not a pass.** No cell in the Name column is cut
  at all: there is no `…` anywhere in that column. Write "C — nothing was
  truncated" rather than "fine" or "pass". Nothing was observed, so nothing was
  confirmed, and 9a is weakened by the same fact — its scrollbar answer was
  produced by data that never exercised the bound.

**Then the same three answers for the Vendor column**, if and only if a vendor
value is cut there: **A** the vendor name reads from its beginning with the `…`
at the far end; **B** it begins with `…` and the start of the vendor name is
gone; **C** no vendor was cut, so there is nothing to answer. Vendor is
answered separately from Name because the two columns carry different values
from different sources, and one can be right while the other is wrong.

**Why this cannot be answered at 768px.** At that width the table itself
overflows its container, so the right or left edge of a cell can be cut off by
the table's own edge. A cell truncated by the ellipsis and a cell sliced by the
table edge look identical in the shot, and answer B would be indistinguishable
from the table simply running out of room. The question is only meaningful
where the whole cell is on screen.

### 9b. Narrow width — NOT a claim. An inspection with no pass condition.

**768px viewport**, the exact `md` breakpoint at which the card layout stops
and this table starts.

I originally flagged this as "the real failure mode of this change". **That
was wrong, and the correction matters here.** The six columns are a strict
subset of the thirteen this table rendered before the change — every one of
the six was already among them, and `rawText` and `summary` are gone. So the
table is strictly narrower at every width than what already ships, and **no
observation at 768px can be a regression caused by this PR.** A pass/fail set
here would point this review at a pre-existing layout problem and invite it to
fail this PR for something this PR improved.

Your point stands and I am acting on it: "the columns are not cramped" is not
a claim, because two readers answer it differently. It is not written as one.
But an inspection can still have **forced answers** even without a verdict, and
that is strictly better than a bare "have a look". Answer these three; each is
a count or a yes/no that the screen decides, not you:

- **Q1.** Is there a horizontal scrollbar under the table? **yes / no**
- **Q2.** Without scrolling, how many of the six headers are **fully**
  readable? **Write the integer, 0-6.**
- **Q3.** Which header is the last fully readable one? **Name it.**

There is no pass mark on those answers. They are recorded so a later reader
has a number instead of an impression.

**Prediction, so the inspection can falsify my model even though it cannot
fail the PR.** Available table width at 768px is **424px**: 768 minus the
280px rail minus 64px of `md:p-8`. Six cells at `px-5` spend 240px on padding
alone, and the chevron column takes ~40px more — so roughly 144px is left for
all six columns' text. I expect **Q1 = yes** and **Q2 = 2 or 3**. If you
report Q2 = 6, my arithmetic is wrong and that is worth knowing on its own.

---

## Sequence

1. This commit — description only.
2. Implementation plus guard, one commit.
3. Screenshot review against the nine claims above.

Not merged from this commit. No catalog key is added until step 2, so `main`
is unchanged in behaviour by this file.

---

# Amendment, step 2

What the implementation changed about the plan above. Recorded here rather
than left as a discrepancy between this file and the code.

## Guard 5 as specified was wrong in both directions, and is replaced

The plan named: *"in `ar`, each rendered header equals `strings.ar.<key>` and
**no header equals its `strings.en` value**"*. The second half was written,
run, and deleted. It fails twice:

- **It was GREEN against the broken component.** The generated header was
  `original File Name`, which is not a value in the EN catalog, so "differs
  from English" held perfectly while every header on the Arabic screen was
  English. It would have shipped as a passing guard over the exact defect it
  was written for — the same false-green shape as the CR grep in `CLAUDE.md`.
- **It then went RED against the correct component**, on `fr.date`: the
  French for "Date" is "Date". A legitimate identical translation is
  indistinguishable from a missing one by that test.

The first half — the positional `toEqual` against the locale's own catalog —
subsumes it and has neither failure. Kept alongside it: `ar` headers contain
no Latin letter at all, and the two genuinely-new keys differ from their
English spelling in `fr`. The deletion and its reasoning are recorded at the
guard site, not only here.

This is the one claim of the nine that moved. Claims 1, 2, 3, 4, 6, 7, 8, 9,
10 and 11 are implemented as written.

## Two new keys, not six

The plan implied a new key per column. Four of the six already existed as
shipped copy and are reused unchanged; see the column table above. So the new
user-visible copy in this PR is two strings per locale, six in total.

## The gate is now BOTH code points and screenshot

This PR was scoped as a layout change when the five-PR shape was ruled, which
is why it drew the screenshot gate and PR 4 drew code-point approval. It is
not a layout change any more — it adds Arabic copy — so it carries both. The
code-point approval covers `ar.nameLabel` and `ar.confidenceLabel` only; the
other four Arabic headers are already-approved strings this PR does not touch.

Guard 11 pins both new Arabic strings **as code-point arrays**, and
additionally rejects, in either of them:

- bidi controls U+200E/U+200F, U+202A-U+202E, U+2066-U+2069 — invisible, and
  would survive any review conducted on glyphs;
- Arabic presentation forms U+FB50-U+FDFF and U+FE70-U+FEFF — legal
  characters that render identically to the canonical letters and break
  search and collation. Shaping is the font's job, not the catalog's.

Both classes were confirmed caught by mutation, not by reading the test.

## Two defects surfaced while writing the width instruction — NOT fixed here

Both were found by reading `Layout.tsx` and `ResultTable.tsx` to state the
available widths accurately. Both are reported rather than fixed, because
fixing either is outside what this PR was scoped to do and neither is a
regression it introduced. **Neither has been measured in a browser** — both
are arithmetic from the source lines cited, and both should be confirmed
before anyone acts on them.

### D1 — the desktop table has no truncation, on any column

The mobile card truncates its title, vendor and status
(`ResultTable.tsx:137,138,152`). The desktop branch has no `truncate`, no
`max-w` and no `whitespace` handling on any cell. A filename like
`JPEG_20260615_222241_1286235000237534355.jpg` is a single unbreakable token
— underscores are not break opportunities — so it sets the Name column's
minimum width and pushes the table wider than its container, which then
scrolls.

This is why I expect **9a may fail**. It is pre-existing: the table has always
lacked truncation. What changed is that it is now *visible* as the binding
constraint, because `rawText` used to be far wider and dominated everything.
So 9a's pass condition was never true before either — it was written in step 1
as an expectation, not from a measurement, and it may simply be wrong.

The fix is a `max-w-[Xch] truncate` on the Name cell with `title` carrying the
full value, mirroring what the card already does. It is one line and it is not
in this PR.

**D1 was subsequently fixed in this PR — see "Amendment, D1" at the end of this
file.** The paragraph above is left as written because it is the report that
prompted the fix, and because two of its claims turned out to be wrong.

### D2 — the `md` breakpoint hands the desktop table 424px

`Layout.tsx:99` pins a 280px rail from `md` upward, and `Layout.tsx:105` adds
`md:p-8`. At the 768px `md` breakpoint that leaves the table **424px**, of
which ~280px is cell padding and the chevron column. The card layout stops at
exactly the width where the table has least room.

The real question this raises is whether the card/table switch belongs at `md`
(768px) at all, rather than at `lg` (1024px) or `xl`. That is a layout
decision about a component this PR did not restyle, it affects the mobile card
branch which is out of scope here, and answering it by changing a breakpoint
inside a localization PR is exactly the kind of ride-along change the
description-first step exists to prevent.

Recorded for a follow-up. 9b is written as an inspection partly so that this
PR records a number for it without pretending to own it.

## Amendment, D1 — the bound is now in this PR, and it is two columns

Two claims in the D1 report above were wrong, and both changed the fix.

**"One line" was wrong, and the missing part is the whole risk.** A box that
clips, holding user data, with no stated direction is the exact shape #142 was
written about: in Arabic an unstated direction is inherited from the page, and a
Latin filename loses its LEADING end — the reader gets a wrong string, not a
missing one. Adding truncation without answering "which end does the ellipsis
eat" is how that class of defect is created, and it would have been created here
in the same lane that catalogued it.

The direction is **`dir="auto"`**, and the reasoning is at the site, not here.
Summarised: it is the only one of the three available values that keeps the HEAD
of both a Latin and an Arabic value, Arabic filenames are a real case in this
repo (measured in Chrome, recorded at `rtlTruncation.test.ts:17`), and it matches
the behaviour already confirmed correct on the Arabic activity screen —
`ActivityScreen.tsx:114`, same idiom, head kept and tail eaten. This copies an
observed-good result rather than inventing a preference.

**"The Name cell" was wrong: it is Name AND Vendor.** Vendor is the other
free-text column — `displayName ?? aliases[0] ?? canonicalName` straight from a
document — and it is not length-limited anywhere. Bounding Name alone would
leave 9a's pass condition falsifiable by a long vendor, which defeats the reason
for bounding at all. The other four columns are deliberately NOT bounded: amount
and confidence go through Intl, date through the shared date path, and status to
a member of a fixed label set, so none can widen the table.

**The bound is data, not a class.** `maxCh` lives in `DESKTOP_COLUMNS` beside the
header key. Tailwind cannot emit an arbitrary value it cannot see as a literal,
so a per-column width can only reach the DOM as an inline style anyway; putting
the number in the column definition makes it reviewable next to the column and
lets guard 12 assert that the declared bound is the one the element carries.

### Guard 12, and what the mutations actually established

Ten mutations, run against the implementation, not read:

- **Killed, each by its own assertion:** deleting the `dir`; changing it to
  `ltr`; slicing the `title`; deleting the `title`; deleting the width; making
  the bounded branch unconditional; putting a `title` on the placeholder path;
  and replacing the CSS clip with a JS slice of the text node.
- **Survived — `maxCh: 24 → 40`.** A plausible wrong width passes every test in
  the file. Deliberate: 24 and 16 are arithmetic from `Layout.tsx`, nothing in
  this repo can evaluate them, and a test that appeared to would be lying. **9a
  owns this number.**
- **Survived — deleting the `truncate` class.** jsdom loads no CSS, so the three
  clipping properties are unverifiable here. Asserting the class token would
  prove nothing about behaviour while reading as if it did.

Both survivors are recorded at the guard site with their owner named.

### The app-wide truncation scan cannot enforce this cell

Stated here and at the site, for the same reason the Sidebar box carries the
same note: someone who later deletes the `dir` will find every other check
green. `rtlTruncation.test.ts` **does** scan this element — unlike Sidebar's box
it truncates by class — but its Class-B rule only fires when the element's
content names `fileName`, `originalFileName` or `email`. This is a generic cell
renderer whose content is `{v}`, so the rule looks straight at it and clears it.
Measured, not inferred: with the `dir` deleted, `rtlTruncation.test.ts` stays
fully green and only guard 12 goes red. The mobile card is blind for the same
reason (`{title}`, `{vendor}`).

### What 9a should now report, and the check that was missing

9a's pass condition is unchanged and is still the measurement. What changed is
that it is now **answerable**: before this commit no column had any bound, so a
horizontal scrollbar in the shot could not be attributed to anything in
particular. It can now. If 9a still shows a scrollbar, the two numbers in
`DESKTOP_COLUMNS` are what to change, and nothing else. Both of those facts now
sit at 9a itself rather than only here, because that is where they are read.

**9c is added, and it should have been added with the bound.** The amendment
above records that `dir="auto"` is the decision this commit is about, and that
two mutations survived: `maxCh: 24 → 40`, and deleting the `truncate` class.
The second one is the reason 9c exists. Between them, the clipping behaviour
this commit introduced has **no instrument in this repository at all** — guard
12 asserts the `dir` attribute in a DOM with no CSS, `rtlTruncation.test.ts`
scans the element and clears it because the content is `{v}`, and the mobile
card is blind for the same reason. The screenshot is the only thing that can
observe which end the ellipsis eats, and until now the review did not ask it
to. Deciding the direction in the code and leaving the question unasked in the
review is the same shape as #142 one level up: the direction was stated, and
then never looked at.

## One pre-existing test was rewritten

`searchRestyle.test.tsx:192` asserted that the desktop table renders the raw
`facts` column as `4280` and `USD`. That column no longer exists, so those
two lines had no subject. They are replaced, not relaxed, and the old
assertions are quoted at the site — the repo treats a pin whose target is
gone as failing as loudly as an unpinned defect
(`noHardcodedUserFacingText.test.ts:57-61`).

---

# Screenshot review — results

Taken by Abo Jad on the preview at `9dd91bb`, UI language Arabic, desktop at
full window width. Query: `أظهر كل المستندات`, 26 rows returned. These are eye
observations of a screen, recorded against the question each one answers.

**The 768px inspection (9b) has not been taken.** Its three questions are still
open and the prediction at 9b is still unfalsified.

| # | Answer | Result |
|---|---|---|
| 1 | 6 headers | PASS |
| 2 | الاسم · المورّد · المبلغ · الحالة · التاريخ · الثقة | PASS — all six Arabic, no English header |
| 3 | First column at the right, arrows at the left | PASS — the table mirrored |
| 4 | — | not separately reported; see the finding on `UNKNOWN` below |
| 5 | `تمت المعالجة`, `يحتاج مراجعة`; no raw enum on any row | PASS |
| 6 | No sentence, no OCR wall, no lone `ar`/`AR` column | PASS |
| 7 | `fghj1.jpg` row: small faint hyphen in both vendor and amount | PASS — and its confidence renders `0%`, so a legitimate zero is not swallowed by the placeholder |
| 8 | `99%`, `65%`, `0%` | PASS — never `0.99`, never bare `42`, never `4200%` |
| 9a | No horizontal scrollbar; `الثقة` fully visible at the left edge; dates on one line | **PASS** |
| 9c | **A**, on many rows and on **both** bounded columns | **PASS** |
| 9b | not taken | open |

**9a passed, so the `maxCh` arithmetic holds.** `24` and `16` are the right
numbers at full width and are not to be changed. Recorded separately, as an
observation with no pass condition attached: at a narrower window the date
column wrapped to three lines (day / month / year), still with no scrollbar.
That is a wrap, not an overflow, and no claim in this file covers it.

**9c answered A, which is the result the bound was written to earn.** Name:
`D9C02893-E610-4FD7-AA8A…`, `JPEG_20260615_222241_1286…`,
`IC-Basic-Receipt-Template (1)…`, `cafe-receipt-design-template.…`. Vendor:
`Société Régionale …`, `ARTGROUP T-Shirt…`, `Berghotel Grosse S…`,
`Flame Kitchen Rest…`, `ANTICO FORNO A…`. Every one keeps the head and eats the
tail, in both scripts, on both columns. `dir="auto"` on the bounded box is
confirmed correct by observation, which was the only instrument that could
confirm it — and answer **C** was not reached, so the bound was genuinely
exercised by the data.

## Two findings the checks did not cover

Reported by Abo Jad as observations. Both are diagnosed here from the code, and
the two diagnoses land differently.

### F1 — `UNKNOWN` in the vendor column is stored data, and it predates this PR

Several rows print the literal word `UNKNOWN` in the vendor column, alongside
values that are plainly document content (`Your Company name`,
`[Company Name]`, `SHOP NAME`, `Company inc.`, `THE BISTRO`, `Coffee-Shop`).

**It is not written by any front-end fallback.** `getVendor`
(`lib/searchResultCard.ts:68-79`) reads
`displayName ?? aliases[0] ?? canonicalName ?? name` off a stored entity and
returns `null` when all are empty. No branch of it can invent a string.

**It is a sentinel that leaks out of extraction.** The Gemini prompt teaches the
model to use the literal `"UNKNOWN"` as the not-found marker for the date field
(`geminiAdapter.ts:131`, and again in the schema at `:139`). `merchantName` is
declared in the same schema with no not-found convention of its own
(`:143`), so the model reuses the one it was taught. `geminiAdapter.ts:237`
then persists it: `if (rawJson.merchantName)` is truthy for the string
`"UNKNOWN"`, so a VENDOR entity is created literally named `UNKNOWN`. The date
path guards against exactly this and the merchant path does not — compare `:221`,
`finalDate === 'UNKNOWN' ? undefined : finalDate`.

**Not caused by this PR, and already visible before it.** The value is
back-end data reaching the front end through a shared helper; the same helper
already fed the mobile card (`ResultTable.tsx:125` on `3db3b6f`) and the review
queue (`ReviewQueueScreen.tsx:200`, `:285`), both of which rendered vendor
before this change. This PR made it visible in one more place; it did not
create it. **Out of scope here.** The fix belongs in `geminiAdapter.ts`, is a
back-end change, and needs a decision this PR is not the place to take: whether
to drop the entity or to store nothing and let the hyphen placeholder do its
job.

### F2 — `$US` is a bidi scramble, and THIS PR INTRODUCED IT ON THIS SCREEN

Every USD row renders the symbol as `$US` with the dollar sign to the **left**
of the letters — `$US 42.07`, `$US 1,234.00`. On the same screen `€ 41.29`,
`€ 90.50`, `CHF 54.50`, `₹ 290.00` and `د.م. 128.23` are all correct.

**The string is correct; the container is wrong.** `formatCurrency`
(`lib/searchResultCard.ts:55-66`) returns `Intl.NumberFormat('ar', {style:
'currency', currency: 'USD'})`, whose code points are:

```
200f 34 32 2e 30 37 a0 55 53 24     →  RLM "42.07" NBSP "U" "S" "$"
```

Two facts about that string decide everything. It **begins with U+200F**, a
RIGHT-TO-LEFT MARK, which is a *strong* right-to-left character. And it **ends
with `$`**, which is not strong at all — it is a neutral, and a trailing neutral
takes its direction from the run around it.

The cell renders through the unbounded branch, `<span dir="auto">{v}</span>`.
`dir="auto"` resolves direction from the **first strong character**, and the
first strong character is that leading RLM — so the span resolves **RTL**, and
the trailing `$` resolves RTL with it and is placed to the *left* of the LTR
run `US`. The display is `$US`. `dir="auto"` does not merely fail to help here;
the RLM guarantees it picks the wrong answer.

**Why the other currencies are fine, and what the real discriminator is.** Not
"multi-character Latin symbol" — `CHF` is exactly that and renders correctly,
because `C`, `H`, `F` are all strong LTR letters with no neutral among them.
`€` and `₹` are single neutrals with no letters to jump around. `د.م.` is
Arabic, already RTL. The discriminator is **a symbol containing both strong
Latin letters and a neutral**, and `US$` is the only one on that screen. The
prediction this makes, which is falsifiable: `CA$`, `A$`, `NZ$`, `HK$`, `MX$`
and `NT$` all scramble the same way, and no three-letter code ever does.

**The same app already renders this correctly, twice, and the difference is the
wrapper.** The review queue uses `dir="ltr"` **plus** `<bdi>` on the amount —
`ReviewQueueScreen.tsx:204` and `:292` — which pins the trailing neutral to the
right of `US`. The mobile card in this very file used `dir="ltr"` before this
PR and still does (`ResultTable.tsx:128` on `3db3b6f`). Same helper, same
string, same page direction, different wrapper, different result: that is a
controlled comparison, not an inference.

**This PR introduced it on the desktop table.** Before this change that table
had no formatted-amount column at all — it dumped raw `facts`, and the
assertion that pinned it read `4280` and `USD` as separate raw values
(`searchRestyle.test.tsx:192`, rewritten by this PR; see the section above).
Adding the Amount column routed a currency string through the generic
`dir="auto"` cell for the first time. The defect is new **on this screen**, and
it is new **because of this commit**.

**It is the same class of defect this PR was written to avoid**, and it slipped
in through the branch nobody was looking at. The bounded branch got the
direction question asked and answered — 9c confirms it. The unbounded branch
inherited `dir="auto"` from the old code without anyone asking whether it was
right for a currency, and for a currency it is not. #142's lesson applied to
Name and Vendor and was not carried across to Amount.

**The fix is not `dir="auto"` on that cell**, and it is not blanket `dir="ltr"`
on all four unbounded columns either — that would be wrong for status, which is
Arabic. It is the wrapper the other two surfaces already use, applied to the
amount cell specifically. That is a code change, and it is not in this commit.

**No check in this file would have caught it.** Item 8 asks whether the
confidence *number* is formatted correctly and item 7 asks about the
placeholder; nothing asks which way round the amount reads. That gap is the
finding, as much as the scramble is.
