# Dashboard Redesign — Progress Tracker

Single source of truth for the dashboard-redesign effort so no step is skipped or
repeated across sessions. Update the checkboxes as PRs merge.

## Done (merged to `main`)

- [x] **PR-A (#49)** — Design-token foundation + self-hosted fonts. Fixed the
      unloaded-font defect; introduced the indigo `#635BFF` `--sa-*` token system;
      bundled Inter + IBM Plex Sans Arabic (no Google Fonts CDN).
- [x] **PR-B (#50)** — Dashboard visual restyle onto the tokens to match the
      approved Claude Design: KPI cards, quick actions, recent activity, insight /
      tip, empty state, responsive + Arabic RTL, dependency-free SVG `AreaChart`.
      Chart / by-status / trend chips render honest **"coming soon" placeholders**
      (no fabricated data); the **"This month" filter deliberately omitted**;
      sidebar restyle deferred.
- [x] **Copy fix (#51)** — Removed all em/en dashes from user-facing copy
      app-wide + a no-em-dash guard test covering **all** i18n keys × 3 locales.

## In progress / remaining (dashboard redesign)

- [x] **PR-C1 (#52)** — Backend analytics. Extended `GET /documents/stats`
      additively with `statusBreakdown`, `monthlySeries`, and `periods`; Prisma
      aggregations (org-scoped); additive index migration; backend tests. Real
      statuses (Processed / Needs review / Rejected); approval-rate omitted; UTC
      month boundaries for v1. Backend only — no frontend render change.
- [x] **PR-C2 (this PR)** — Frontend wiring. Feeds real series / breakdown /
      trend-chip from PR-C1's payload; restores the **"This month" / "All time"**
      control (scoped to the Processed KPI — the only metric with real period
      data); chart RTL (series reversed, months right-to-left, highlight
      mirrored via a minimal `rtl` prop on AreaChart). Strict no-fabrication:
      each widget shows the calm placeholder when its data is genuinely empty
      (chart also when `totalCount === 0` or the series sums to 0); zero-base
      trend shows a "New" badge, never `+100%`/`∞`. Pure helpers in
      `lib/dashboardAnalytics.ts` unit-tested; component + RTL tests added.

**The core dashboard redesign (PR-A → PR-C2) is now complete.**

## Phase D — design-system propagation

The dashboard is the reference; Phase D carries the indigo `--sa-*` system to
every other screen. **D1 is the high-leverage multiplier** (chrome + a token
bridge), after which each remaining PR is a focused per-screen restyle.

- [x] **PR-D1 (this PR)** — **Chrome + legacy-var/class token bridge.** Retargets
      the legacy CSS vars (`--accent`, `--card`, `--border`, `--nav-active-*`, …)
      to alias the `--sa-*` tokens (light + dark, single source of truth), so the
      shared component classes (`.saas-card`, `.btn-primary`, `.nav-item`,
      `.saas-table`, `.badge-*`, `.skeleton`) instantly reskin onto indigo with
      token radii + quiet elevation. Restyles the chrome (`Layout`, `Sidebar`,
      `BottomTabBar`) onto tokens and converts its physical CSS to logical
      properties (`ms`/`me`, `start`/`end`, `border-e`, `text-start`) so the rail
      and bottom tab bar mirror correctly in Arabic/RTL. **No anti-steering /
      `isNativePlatform` / pricing change; Sidebar plan area stays status-only.**
      Consequence (intended): every other screen is now recolored onto indigo and
      picks up the restyled shared cards/buttons/tables. Screens that still carry
      raw `blue-*` utilities in their bodies render **two-tone** (indigo chrome +
      blue screen-body accents) until their own D-PR lands — reskinned, not broken.
- [x] **PR-D2** — **Search screen restyle.** Restyled `SearchScreen` and its
      sub-components (`AnswerCard`, `ResultTable`, `ClarificationCard`,
      `ChartPlaceholder`, `ReportCard`, plus the shared `ErrorState` /
      `EmptyState`) onto the `--sa-*` tokens across every state: idle + insights
      gallery, loading skeleton, answer card, data table (clickable rows →
      `/documents/:id`, read-only), bar chart, clarification (amber), empty-data,
      and error (red). Fixes from the read-only audit: (1) **RTL** — all physical
      offsets/padding/borders converted to logical (`ps`/`pe`, `start`/`end`,
      `border-s`, `text-start`, `rounded-e`, `rtl:-scale-x-100`) so Arabic
      mirrors; numerals kept LTR. (2) **Hero H1 i18n bug** — dropped the
      `split('data')` highlight trick that appended a literal English "data" to
      the FR/AR strings; the translated headline now renders cleanly. (3) **i18n
      the hardcoded English labels** — AnswerCard / ClarificationCard /
      ChartPlaceholder / ResultTable-empty / ErrorState defaults + the two search
      error sentences are now real keys in en/fr/ar (MSA). No-em-dash guard
      extended to name the new keys. **No fabricated data** (answer renders only
      the backend result; no invented comparisons). **No anti-steering / pricing
      / `isNativePlatform` change** (Search has none; PR #47 stays green). Dead
      code removed: `SearchScreen.loadReport` + `reportsService` + orphan
      `SearchBar.tsx`.
- [x] **PR-D3** — **File Detail restyle.** Restyled `DocumentDetailScreen`
      (route `/documents/:id`) and its shared sub-components (`DecisionBanner`,
      `FixActionPanel`, `ReviewBadge`) onto the `--sa-*` tokens: retired the
      oversized mega-card / heavy shadow for the calm flat surface, sentence
      case, Lucide icons, small colored status dots, no emoji. (1) **Status
      reconciliation** — the meta-grid status now routes through the same shared
      config as the Search card (`getStatus` / `statusProcessed`), so it reads
      Processed / Needs review / Rejected with matching dots and Arabic
      (`تمت المعالجة`), never the raw enum; the rule-engine decision vocabulary
      (Approved / Needs review / Flagged) stays a distinct tinted banner. (2)
      **RTL** — per-value `dir`/`<bdi>` isolation on title, fact values,
      currency, entity chips, and confidence percent so Latin text + numerals
      do not scramble in Arabic. (3) **i18n** — every remaining hardcoded
      English string (toasts, preview fallback, decision Flagged/Approved copy,
      all FixActionPanel strings) moved to en/fr/ar keys; the shared queue
      toasts routed to the same keys. (4) **`$` → neutral MAD unit** on the
      correction input via a durable input-group that cannot overlap the typed
      value (any locale / font / zoom). Follow-up commit fixed the long-filename
      card overflow on mobile (`self-stretch`-bounded title + existing truncate)
      and hardened entity chips (`max-w` + truncate). All copy em-dash-free.
      **No anti-steering / pricing / `isNativePlatform` change** (detail has
      none; `nativeAntiSteering` stays green). **No fabricated data.**
- [x] **PR-D4 (#58)** — **Review Queue restyle.** Restyled `ReviewQueueScreen`
      (route `/queue`) onto the `--sa-*` tokens: retired the loud oversized
      vocabulary (`rounded-[32px]`, `shadow-2xl`, `font-black`, uppercase
      `tracking-widest`, `animate-pulse`, hover scale/rotate, `saas-table`) for
      the calm flat surface, and removed the dead **Filters** button and the
      redundant desktop **Deep Review** button (the row already taps through).
      (1) **Three data-correctness fixes** — read real `documentType` (hide the
      type line when null, never the old `'Invoice'` fallback), real `uploadedAt`
      (calm not-available when absent, never `'Recently'`), and real
      `overallConfidence` (dropped the fabricated `|| 0.92`; missing shows
      not-available). (2) **Vendor + amount** surfaced from real data via the
      SAME shared Search helpers (`getVendor` / `getAmount`); amount renders as
      plain data (tabular numerals), never pricing. (3) **Single status** — the
      double "needs review" collapsed to ONE warning dot + "Needs review"
      (shared `getStatus`), with the confidence percent + short quality meter kept
      visually distinct; `ReviewBadge` dropped from the Queue only (untouched for
      D3 Detail). (4) **Type label i18n** — shared `getDocTypeLabel` maps the
      canonical enums to translated, sentence-case labels (en/fr/ar) with a
      humanized fallback for unknown values; applied on the Queue (Detail /
      Dashboard adopt it later — see follow-ups). (5) **Fuller mobile card**
      (name, type, vendor, amount, date, confidence + single status + two
      always-visible 44px actions), **per-value `dir`/`<bdi>` isolation** and
      logical CSS, i18n for the previously hardcoded fetch-error + empty-state
      strings, and a quiet **first-50** note. **Additive backend change** —
      `mapDocumentToDto` now also exposes `documentEntities` (with
      `entity.canonicalName`) and `factType` so the shared vendor/amount helpers
      resolve on queue rows; nothing removed, **File Detail output unchanged**.
      All copy em-dash-free. **No anti-steering / pricing / `isNativePlatform`
      change** (`nativeAntiSteering` stays green). **No fabricated data.**
- [ ] **PR-D5** — Activity restyle (PR pending; close on merge). **First
      full-screen restyle of the session — establishes the pattern D7/D8a reuse.**
      Migrated `ActivityScreen.tsx` off raw palette onto `--sa` tokens, dropped the
      brutalist type treatment (font-black/uppercase/italic/tracking-*), and adopted
      the shared primitives (`EmptyState`, `getStatus`, `formatDateValue`). Folded in
      the deferred **count-grouping fix** (`formatCount(activity.length, language)`).
      **Also fixed three defects the D5 notes had missed:** (1) the local `formatDate`
      was hardcoded to `en-US` → dates leaked English in fr/ar (now
      `formatDateValue(…, language)`); (2) **four hardcoded English literals**
      (`'Recently'`, `'Unnamed Document'`, `title="Intelligence Error"`, the empty-body
      string) rendered in every locale → swapped to `s.recently` / `s.unnamedDocument`
      / ErrorState's translated default / a new `activityEmptyBody` key (3 locales);
      (3) the inline status ternary mislabeled **`PROCESSING`/`FAILED` items as
      "Rejected"** → `getStatus` now maps them correctly. New behavioral guards added
      (count-grouping ≥1000, no-raw-palette source scan, no-hardcoded-English, status
      mapping). **VISUAL change → the review gate is now SATISFIED:** the empty state
      was reviewed on the Vercel preview, and the **populated row was reviewed on real
      pixels in Arabic (RTL)** by running the app locally. That review **found a real
      RTL defect and it is fixed in this PR** — the truncating filename/date sat in
      `<p class="truncate" dir="auto"><bdi>…</bdi></p>`, where the **`<bdi>` isolate
      swallowed `dir="auto"`**, forcing the box LTR so it clipped the **leading**
      (identifying) end of Arabic filenames. Dropped the redundant isolate so
      `dir="auto"` applies to the truncating element; re-verified in the browser and
      guarded in `activityRestyle.test.tsx`. **The corrected idiom is the one D7/D8a
      must copy.** See the deferred list below for the full record — including the
      **8 identical sites still live in the merged `ReviewQueueScreen` /
      `DocumentDetailScreen`**, which are NOT fixed here.
- [ ] **PR-D6** — Settings + Paywall restyle. ⚠️ **Sensitive:** touches paywall
      surfaces — must not alter anti-steering / `isNativePlatform` gating (PR #47).
- [ ] **PR-D7** — Auth screen restyle.
- [ ] **PR-D8** — Profile + modals (Upload / Capture / Delete-account) restyle.
- [ ] **PR-D9** — Legal screens (Terms / Privacy / Delete-account info) restyle.
- [ ] **Landing** — tracked separately from the app shell (marketing surface).

## File Detail follow-ups (deferred from the D4 review): DONE in PR #60

Found while reviewing real documents during D4. These were on the **File Detail**
page / shared facts rendering (merged in D3), so they were intentionally kept
**out of scope for the Queue PR** and landed as their own PR off `main`.
**Completed in PR #60** (squash `06a35f6`, merged 2026-07-07): all items below
applied, each with a new behavioral or source guard, full suite green, em-dash
guard green, native anti-steering guard untouched.

- [x] **(2a) Localize the raw ISO date** in the Extracted Facts table.
      `DocumentDetailScreen.tsx` `factValue` (~L111-114) renders a date fact as
      `String(fact.valueDate)` → raw `2026-02-08T00:00:00.000Z`. Reuse the shared
      `formatCellValue` / `formatDate` (ISO detection + `Intl.DateTimeFormat`) so
      Detail and Search share one localized date path; handle a non-string
      `valueDate` (Date/number) defensively.
- [x] **(2b) Translate/filter the raw `NEEDS_REVIEW` decision fact.** The facts
      loop (~L240/L266) renders every fact including the rule-engine `decision`
      fact, whose value comes through raw. Preferred fix: **filter `decision` +
      `decision_reason` out of the facts table** (they are rule outputs already
      surfaced by the `DecisionBanner`), removing the raw enum and the
      duplication.
- [x] **(2c) Translate the raw decision reason** ("Missing amount") in
      `DecisionBanner.tsx` (~L53, rendered raw English). The reasons are a finite
      known set from `ruleEngineService` (`Amount exceeds threshold`, `High food
      expense`, `Missing amount`, `Possible duplicate expense`), persisted as
      `reasons.join(', ')`. Map each to en/fr/ar (split on `', '`, map, rejoin;
      raw fallback for anything unknown, never fabricated).
- [x] **(3) Fix the entity-chip truncation edge under RTL.**
      `DocumentDetailScreen.tsx` (~L303): `dir="auto"` is on the inner `<bdi>`,
      but the truncating `<span>` inherits `rtl` from the page, so
      `text-overflow: ellipsis` clips the **leading** side of a Latin name
      (`...ICES MARRAKECH SAFI SA`). Move `dir="auto"` onto the **truncating
      element** (matching the h1/meta pattern already in the file) so the ellipsis
      sits at the content's natural trailing edge.
- [x] **Adopt the shared `getDocTypeLabel`** (added in D4) in the Detail
      meta-grid (`DocumentDetailScreen.tsx` ~L174) and the Dashboard recent
      activity (`DashboardScreen.tsx` ~L456), both of which still render
      `documentType` raw uppercase — same bug class as the Queue, one shared
      helper now available.
- [x] **Translate the raw `ent.role` enum** (`DocumentDetailScreen.tsx` ~L300):
      `VENDOR` / `ISSUER` render raw uppercase in the graph-relationships chips.
      (Done via the shared `getEntityRoleLabel`.)
- [x] **`factValue` latent bugs** (same helper touched for 2a): `valueString ||
      valueNumber` drops a legitimate numeric **0** (falsy), and currency amounts
      are concatenated raw (`${raw} ${currency}`) instead of `Intl`-formatted like
      the shared `getAmount` — so Detail amounts are not localized/grouped.

## Entity / vendor display-name follow-ups (discovered during PR #60)

Read-only diagnosis done while reviewing PR #60 in Arabic. An entity chip showed
"SOCIT RGIONALE MULTIS..." for an org that reads correctly ("Societe Regionale
Multiservices Marrakech-Safi SA", with accents) in the AI-synthesis banner on the
same page. Root cause: the chip renders `Entity.canonicalName`, a normalized
MATCHING KEY, not a display name. `canonicalName` is produced at WRITE time in
`entityResolution.ts:38` as `searchName.toUpperCase().replace(/[^A-Z0-9\s]/g, '')`,
which deletes (does not fold) any non-ASCII letter, so accents vanish and casing
is lost. The human-readable original survives only in `Entity.aliases[0]` (and in
`summary`, a separate LLM field that never passes through this transform). The
`Entity` model has NO display-name column. The mangled value is shown on three
surfaces via the shared `getVendor` path, not just File Detail.

- [x] **(A) Display-only fix (own PR, no migration). DONE in PR #62** (merged
      2026-07-07). Stopped rendering the normalized `canonicalName` key as a name:
      exposed a display name from `aliases[0]` (fallback `canonicalName`) in the DTO
      (`documentDto.ts`), had `getVendor` prefer it, and rendered it on all THREE
      surfaces that showed the mangled key: the File Detail entity chip
      (`DocumentDetailScreen.tsx`, `ent.name`), the Search card vendor, and
      the Review Queue vendor (`ReviewQueueScreen.tsx`, via
      `getVendor` in `searchResultCard.ts`). Uses data already stored, so no
      backfill. Kept out of PR #60 (backend DTO + shared vendor path, broader than
      File Detail).
- [x] **(B) Proper data-model fix. DONE across three PRs (#72 → #73 → #74, all
      merged 2026-07-09).** Shipped in **three deliberately separated phases**
      because CI does not apply migrations and `prisma migrate deploy` is run
      **manually out-of-band** against Supabase — so the schema had to be **live in
      production before any code depended on it** (see the operational note below).
    - **Phase 1 — schema (PR #72).** Additive **nullable** `Entity.displayName`
      column. The migration SQL was authored **offline** via `prisma migrate diff`
      (schema-to-schema, **no DB connection**), committed, then **applied manually**
      to production Supabase (`prisma migrate deploy`). Purely additive
      `ALTER TABLE ... ADD COLUMN` — metadata-only, no row rewrite.
    - **Phase 2 — backfill + verify (PR #73).** An **idempotent** backfill script
      plus a **read-only verify gate**, mirroring the `backfillSubscriptions`
      precedent (read-first preflight, single `$transaction`, stop-on-reconcile).
      Run against production, it populated **all 86 Entity rows from `aliases[0]`**
      with **0 unrecoverable rows**, and the verify gate **passed with 0
      mismatches**. The **honesty rule was absolute**: `canonicalName` was never
      laundered into `displayName`, and unrecoverable rows (NULL/empty/whitespace
      `aliases[0]`) would have been left NULL, never fabricated.
    - **Phase 3 — code wiring (PR #74).** (1) `entityResolution.ts` now **writes
      `displayName` on create** (the trimmed raw name; **NULL, never an empty
      string**, for whitespace-only names). (2) A **single shared canonical
      transform** (`utils/canonicalName.ts`) is now used on **BOTH the lookup and
      the write**, closing the **latent duplicate-Entity bug** where a second
      sighting of an accented/punctuated name never matched via the `canonicalName`
      branch (lookup used `toUpperCase()` without the strip) and could create a
      duplicate row. (3) `checkDuplicate` now **normalizes the incoming merchant to
      the canonical key before querying**, so the ingestion path and the
      `documentController` re-evaluation path behave **identically** — duplicates
      are **no longer silently missed for accented/punctuated vendors** (the second
      defect below). (4) The **display layer now reads
      `displayName ?? aliases[0] ?? canonicalName`** across the DTO name-shapes, the
      File Detail entity chip, Search vendor, and Review Queue vendor — replacing
      the earlier **cosmetic `aliases[0]` fix (A)**. New test suites were added for
      `entityResolution` and the canonical transform (**including a proof that a
      re-sighting no longer creates a duplicate**), a **real `checkDuplicate`
      normalization test** (it was effectively untested), and `documentDetailRestyle`
      was **migrated in lockstep** to the new fallback chain. The **stored
      `canonicalName` format was not changed**, so the existing **86 rows remain
      valid**.
    - **Second defect — RESOLVED in Phase 3.** The two `evaluate` call sites passed
      **different merchant representations** (`documentController.ts` →
      `entity.canonicalName`; `ingestion/persistence.ts` → the **raw extracted
      vendor name**), so `checkDuplicate` compared a `canonicalName` against a raw
      name and **could not match on the ingestion path**. Phase 3's shared
      canonical normalization inside `checkDuplicate` fixed this: both paths now
      compare like-vs-like against the stored key.
- [x] **(C) `isFoodMerchant` accent bug (separate rule-engine fix). DONE in
      PR #70** (merged 2026-07-09). Root cause: **no accent-folding helper existed
      anywhere in the backend**, so every keyword match failed against
      Latin-accented names. A single **shared helper** was created
      (`src/utils/textMatch.ts` — `foldForMatch`: NFD diacritic fold + lowercase +
      trim, null-safe; and `matchesAnyKeyword`: whole-word / whole-phrase matching
      with both sides folded, multi-word keywords handled) and applied to **all
      three affected predicates**: `isFoodMerchant`, `isFoodSummary` (both in
      `ruleEngineService.ts`), and `categorize` across all five categories
      (`expenseCategorizationService.ts`). "Café" now matches `cafe`. The same
      change **also fixed unbounded-substring false positives**: `bar` no longer
      matches "Barber", `pub` no longer matches "Publix" (a grocery), `deli` no
      longer matches "Delivery". **Three new backend test suites** were added
      (none existed for these services before, so there was no buggy behavior
      locked in by tests). Two documented items: **(i) scope boundary** — NFD folds
      Latin diacritics only and does not transliterate Arabic, so Arabic-script
      merchant names will not match the English keyword lists (noted in a code
      comment near the helper); **(ii) accepted trade-off** — whole-word matching no
      longer catches a keyword fused into a single OCR token (e.g. "PIZZAHUT"),
      which naive `includes()` used to catch. No lexical rule can accept "pizzahut"
      while rejecting "barber", so whole-word matching was the only consistent
      choice.
- [x] **(D) Date/text localization defects. DONE in PR #68** (merged 2026-07-08).
      Five sites fixed across three files, reusing the existing
      `formatDateValue(value, language)` helper and `useLanguage()` (the locale is
      the bare subtag `'en'` / `'fr'` / `'ar'`, passed straight to `Intl` with no
      region qualifier): (a) the **File Detail meta-grid date** and (e) the
      **Review Queue row dates** now route through `formatDateValue(..., language)`
      — the visible format shifted from numeric to short-month ("Jun 1, 2026"),
      matching the fact-date path already on the page; (b) the **Dashboard
      recent-activity** `formatDate` now takes a `locale` param from the call site
      instead of a hardcoded `'en-US'`, keeping the time fields; (c) the Dashboard
      **"Recently"** fallback now uses the existing `s.recently` key; and (d) a new
      **`unnamedDocument`** i18n key was added in en/fr/ar (sentence-case,
      dash-free) replacing the hardcoded `'Unnamed document'`. The two coupled
      Review Queue test assertions were updated to assert the new localized format
      (strengthened, not weakened). The count-separator gap below was deliberately
      excluded — see the follow-up entry.
- [x] **(D-follow-up) Count separators follow the browser locale, not the app
      language. DONE in PR #76** (merged 2026-07-09). `DashboardScreen.tsx` used
      `Number.toLocaleString()` with no locale argument for the KPI / breakdown
      counts (~L194, ~L201, ~L337), so thousands separators rendered in the runtime
      locale rather than the active app language — the same bug class as (D) but
      lower priority (digit grouping only, no text). Fixed by a shared exported
      **`formatCount(value, language)`** helper in `lib/formatNumber.ts` that
      replaced all three no-arg `toLocaleString()` sites, plus the **`avgConfidence`
      percent** moved to a locale-aware `Intl` **percent style** (`style: 'percent'`),
      preserving one decimal place and **byte-identical English output**. Scope note
      from the diagnosis: the app passes the **bare `'ar'` subtag** to `Intl`, so
      Arabic renders **Latin digits** — this changed the **group separator only**,
      never the digits. Four `{n}` interpolation call sites were **missed** and still
      bypass `formatCount`; see the open i18n item below.

### Operational note — CI does NOT apply migrations (the DB can silently lag `main`)

Standing project lesson, recorded so it is not lost. **CI does not run
`prisma migrate deploy`** (it only typechecks/tests/builds); migrations reach the
production Supabase DB **only when someone runs `prisma migrate deploy` manually,
out-of-band**. This means a merged migration can **silently lag production**.
Discovered during item B: the **PR-C1 `Document` analytics-index migration
(`20260702120000`, from 2026-07-02)** had **never been deployed** and was still
pending a week later — found via `prisma migrate status` before the Phase 1
deploy, and applied **alongside** the Phase 1 `displayName` migration.

**Going forward:** run **`prisma migrate status` before any production deploy** to
see the *full* pending set (never assume only your latest migration is pending),
and ensure **any migration is deployed BEFORE code that reads the new column
ships** — which is exactly why item B was split into schema → backfill → wiring.

## Section-heading consistency (app-wide rollout)

A single reusable `SectionHeading` primitive (consistent tag / size / weight /
color / icon treatment / spacing) was introduced and applied on the **File Detail
page first**. The audit found that section headings were written ad hoc across the
app with divergent treatments (different icon styles and sizes, some with icons
some without, one heading at label size, a broken heading order), and there was no
shared heading component before this.

### Done — File Detail section headings (PR #64, merged)

- [x] **File Detail heading redesign (PR #64, merged 2026-07-08).** The unified
      `SectionHeading` component — one **18px monochrome-neutral Lucide icon**, a
      **16px semibold ink** title, a **10px** icon/text gap, **40px** inter-section
      rhythm, **no divider lines**, sentence case — now applies to **all four**
      File Detail sections (source view, AI synthesis, extracted facts,
      relationships). The **AI-analysis heading was promoted** from the smallest
      ~12px `h4` to the shared section level, fixing the inverted hierarchy (the
      page `h1` stays one step larger, untouched). **Entity-name truncation was
      removed** in favor of full-name wrapping (`break-words`, no `max-w` cap) —
      wrapping cards for a few entities, a stacked role+name list past a handful —
      with correct `dir="auto"`/`<bdi>` **bidi isolation** on every value for
      Arabic RTL. The two section labels were **renamed dash-free** in en/fr/ar
      (Source Visualization → Source view / Vue de la source / عرض المصدر; Graph
      Relationships → Relationships / Relations / علاقات البيانات).

### Done — app-wide rollout (PR #66, merged)

- [x] **SectionHeading rollout to Dashboard + ChartPlaceholder (PR #66, merged
      2026-07-08).** Generalized the primitive without breaking existing callers:
      the icon is now **optional** (the title renders alone, with no dangling gap),
      and a new **`as` prop** (`'h2' | 'h3'`, default `'h3'`) sets the semantic tag
      while the visual style stays identical. Applied it to the **Dashboard section
      headings** via `as="h2"` — `documentsProcessed`, `documentsByStatus`, and the
      one-off **"Quick actions"** heading, whose divergent 13px `text-ink-tertiary`
      style was removed and brought to the unified 16px ink style — and to
      **ChartPlaceholder** (its accent-colored icon changed to the neutral 18px
      `text-ink-faint` system icon). Dropped the redundant Dashboard `mt-4` on the
      content following each heading so the primitive's `mb-4` is not doubled. The
      dead **`--sa-text-h2`** token was **removed** after confirming it was
      unreferenced and asserted by no token guard. A follow-up **sentence-case fix**
      corrected the heading copy to the locked visual identity: "Quick actions" (en)
      and "Actions rapides" (fr). The page h1 was left untouched.

### Done — Search page title standardization (PR #81, merged)

- [x] **Search page title standardized onto `text-title-lg` (PR #81, merged
      2026-07-10).** The raw `text-3xl` / `lg:text-4xl` Search hero title now adopts
      the shared **`text-title-lg`** page-title token, so **all four page `h1`s now
      share one token**, locked by a **cross-screen guard**. As the paired hierarchy
      fix, the Search **empty-state hero was stepped down** from `text-title-lg` to
      **`text-section`** to restore hierarchy, matching the shared `EmptyState`
      component's composition (**`tracking-tight` dropped**, as no `text-section`
      heading carries it). This was the page-title standardization tracked below —
      deliberately **not** wrapped in `SectionHeading` (which would have shrunk the
      hero to 16px).

### Still open — deferred OUT of the E rollout (tracked so they are not lost)

One heading item remains open (the Search page-title standardization shipped in
PR #81 above); it still needs work beyond dropping in `SectionHeading`:

- [x] **Search-page heading outline — level-only fix (PR #85, merged 2026-07-11).**
      On `SearchScreen.tsx` the outline jumped **`h1` → `h3`**: under the page
      `h1` (`askAnything`, L109), the **results caption** (`resultsTitle`, L231)
      and the **empty-state hero** (`askDocs`, L291) were both `h3`, in
      mutually-exclusive branches, with **no `h2`** in either path. This PR
      promotes both to **semantic `h2`** (tag change, utility classes untouched)
      so the outline is `h1` → `h2` with **no visual/copy change** — the 13px
      muted caption and the 15px `text-section` step-down (PR #81) are preserved.
      The inline-toolbar *style adoption* is deliberately **not** bundled here
      (the caption stays a bespoke `justify-between` row; wrapping it in the
      block `SectionHeading` would enlarge it and drop the trailing count pill).
- [x] **A1 — Dashboard recent-activity heading size alignment (PR #86, merged
      2026-07-11).** `DashboardScreen.tsx` **L422**: the recent-activity heading is
      **already `h2` with the correct level** (no accessibility/level defect), but
      it **diverged in STYLE** from its sibling section headings — it rendered at
      **15px `text-section`**, while `documentsProcessed` / `documentsByStatus` /
      `quickActions` render at **16px via `SectionHeading`** (`text-base`, PR #66).
      **Resolution:** the `<h2>` was aligned to **`text-base` (16px)**, matching the
      `SectionHeading` visual, and **nothing else changed**. **The `border-b`
      divider was deliberately KEPT** — the open "is the divider intentional?"
      question is now **resolved: it is structurally justified.** This is a
      **divided-list card**: the card has no padding, its rows go edge-to-edge each
      carrying `border-b border-divider` (`last:border-b-0`), and the header divider
      **matches those row dividers**. (The sibling `documentsProcessed`/`byStatus`
      headings sit in **padded-content** cards — `p-5`, no dividers — so the
      divergence is a card-*pattern* difference, not an oversight.) `SectionHeading`
      was **NOT adopted**: this is a `justify-between` "heading + conditional View
      all button + divider + padding" card-header toolbar the block primitive can't
      model without a row-refactor/trailing-action slot. **Typography-only, no copy
      change; this is a VISUAL change (15px → 16px) warranting on-phone review.**

Notes for the rollout: the File Detail heading defects the audit surfaced (the
AI-synthesis heading was an `h4` at 12px `text-accent-text` while its peers were
`h3` at 15px `text-ink`; the graph-relationships heading was the only one with a
bare muted icon and a top divider; heading levels were non-monotonic) were
**resolved on that page in PR #64** — the `SectionHeading` primitive settled one
icon convention. Carry the same conventions to the rollout screens above.

## i18n copy quality — shipped (PRs #76 → #78)

Three i18n PRs landed in sequence off the number-format follow-up above. Each was
kept single-purpose.

- [x] **PR #76 (merged 2026-07-09) — locale-aware counts.** See the `(D-follow-up)`
      entry above for the full record: shared `formatCount(value, language)`,
      three `toLocaleString()` sites replaced, `avgConfidence` moved to `Intl`
      percent style, separators only (not digits) under the bare `'ar'` subtag.
- [x] **PR #77 (merged 2026-07-10) — locale-wide sentence-case sweep.** Converted
      **151 values** in `src/i18n/strings.ts` (**89 en, 62 fr**) to the locked
      sentence-case convention. The audit's finding was that **Title Case was
      systemic across both locales**, not confined to the Dashboard, so the sweep
      was locale-wide rather than screen-scoped. **Arabic was untouched** (the
      script has no letter case). **Acronyms, brand names, and proper nouns were
      preserved.**
- [x] **PR #78 (merged 2026-07-10) — plural-free reword of two broken count
      strings.** `finishBatch` and `intelligencePulsePending` interpolated a count
      into a sentence that required **grammatical number agreement**, so **every
      locale was wrong at n = 1** ("You have 1 documents waiting for review.").
      Arabic was additionally wrong at n = 2 and across the few/many splits.

    - **Why reworded, not pluralized (locked decision).** The i18n layer is a
      **hand-rolled flat dictionary** with **no pluralization support anywhere** —
      no `Intl.PluralRules`, no ICU. Correct Arabic support would require
      **per-form variant keys for six CLDR plural categories** on every pluralized
      message. Both strings were instead rewritten into a **label-and-count
      construction**, so the count never has to agree with a noun. The reworded
      strings are correct at **n = 0, 1, 2, and 11** — at any n, because no value
      changes shape with n.
    - **Arabic: the count is placed last, deliberately.** A period sitting between
      a **Latin numeral** and Arabic text is a **bidi-neutral character** that
      resolves to the **paragraph direction** and renders on the **wrong side of
      the number**. Both Arabic values therefore end at `{n}` with **no trailing
      punctuation**. This matters precisely because `formatCount` emits **Latin
      digits** on the bare `'ar'` subtag (see PR #76).
    - **French colon spacing** uses a real **U+00A0 non-breaking space**, verified
      **by codepoint on the merged blob** (a literal NBSP is invisible in review
      and was silently normalized to `U+0020` once during authoring — verify by
      codepoint, never by eye).
    - The `{n}` token and both `String.replace('{n}', …)` call sites were
      **unchanged**; no `.tsx` was touched.

## Branch protection — `main` is protected by a RULESET, not legacy protection

Recorded because the legacy API misleads. `main` is protected by **ruleset
`14939565`** (`enforcement: active`). The **legacy branch-protection endpoint
returns `404 Branch not protected`** even so — rulesets never appear there, and
`GET /branches/main` reports `"protected": true`. Do **not** create legacy branch
protection alongside the ruleset: both would be evaluated and the **most
restrictive wins**, which makes a blocked merge painful to debug. Edit the ruleset.

- **Required status checks (added 2026-07-10).** Exactly two, both GitHub
  check-runs from the `github-actions` app (id `15368`):
  **`Backend — typecheck & build`** and **`Frontend — typecheck & build`**.
  The dash in both names is **U+2014 EM DASH** (bytes `e2 80 94`), **not a
  hyphen-minus**, and the ampersand is literal. A hyphen would register a check
  that never reports and would block every future PR permanently. **Copy the names
  byte-for-byte from the check-runs API; never retype them.**
- **Before this rule existed, the checks were decorative.** The `pull_request`
  rule was enforced, but **a red check would not have blocked a merge** — PR #77
  merged green only because the checks were verified by hand.
- **`required_approving_review_count` stays `0`.** There is a **sole
  collaborator**, and **GitHub does not permit approving your own PR**. Any value
  above `0` would make **every** PR unmergeable. This is a lockout hazard, not a
  preference.
- **`bypass_actors` is empty**, so the required checks apply to the admin too.
- **`Vercel` and `Vercel Preview Comments` remain advisory, by choice.** `Vercel`
  is an **external commit status** (registers by `context`, not as a check-run)
  that can **silently stop reporting** if the integration lapses; a required
  context that never arrives blocks the merge with no way to clear it.
  `Vercel Preview Comments` is a **commenting bot that gates nothing**. Requiring
  either buys no safety and adds a failure mode.

### Merge protocol — ADOPTED 2026-07-16: pin every squash-merge to the head SHA

**Always merge with `--match-head-commit`:**

```
gh pr merge <N> --squash --delete-branch --match-head-commit <head-sha>
```

**Why.** Verifying "checks are green on SHA X" and then merging are two separate
operations, and anything pushed between them merges **unverified**. `--match-head-commit`
closes that window **server-side**: GitHub rejects the merge if the head has moved,
so the guarantee does not depend on how fast the human acts or on re-reading state.

Alongside it, when verifying:

- **Read check status from the check-runs API pinned to the exact head SHA** —
  `gh api repos/<owner>/<repo>/commits/<sha>/check-runs` — and confirm the returned
  `head_sha` matches. **Do not accept a status on an ancestor commit**: a green
  parent proves nothing about the head.
- **Confirm `mergeStateStatus` is `CLEAN`** and that `origin/main` has not advanced
  past the base the branch was cut from.
- **Merge via the CLI, never the web UI** — the UI offers no head-SHA pin.

**Note the residual gap this does NOT close:** the required checks run on the branch
head, not on the merge result. When `main` has not advanced past the branch's base
(the squash is fast-forward-equivalent), there is no semantic-conflict window — but
that is a property of *`main` having stayed still*, not something the green checks
prove. If `main` **has** advanced, green-on-head is **not** green-on-merge-result;
rebase and re-verify rather than trusting the badge.

## Open i18n / correctness items (recorded so they are not lost)

Discovered across the #76 → #78 work. None is fixed; each is listed with the
handling it actually needs.

- [x] **(Correction) The i18n em-dash guard DOES exist — an earlier claim that it
      does not was wrong.** The guard lives at
      **`apps/frontend/tests/dashboardRestyle.test.tsx`** (`describe('i18n copy —
      no em/en dashes anywhere (hard rule)')`). It **iterates every key across all
      three locales** (`en`, `fr`, `ar`) and bans **both em (`—`) and en (`–`)
      dashes in string values**. A **second `describe` block re-asserts the D2 keys
      by name**, so a future refactor that narrows the guard to a subset **fails
      loudly**. A **separate** backend guard at
      **`apps/backend/src/services/email/welcomeEmail.test.ts`** covers the
      **welcome email only** — it is not the i18n guard, and finding only it does
      not mean the i18n guard is absent (a `.ts`-only search misses the `.tsx`
      guard). The **three em dashes remaining in `strings.ts` are in code
      comments**; comments are **correctly out of the guard's scope**, since the
      guard iterates **values**. That residue is already tracked by the existing
      **"Em-dash cleanup in non-guarded copy"** entry below — see it rather than
      re-filing it. **Note:** the merged description of **PR #78 contains the false
      claim that no such guard exists**. The record is corrected here.
- [ ] **`intelligencePulseDesc` rendered an achievement message in an empty state
      (PR pending; close on merge).** Its ternary (`DashboardScreen.tsx` L510) made
      it reachable **only when `pendingCount <= 0` AND `totalCount <= 0`**, so its
      `{n}` **always rendered `0`** and the user was told they successfully processed
      **0 documents**. The `n = 1` agreement defect was therefore **unreachable**;
      the real defect was the copy. **Fix:** rewrote `intelligencePulseDesc` in all
      three locales to an inviting empty-state invitation ("Scan your first document
      to see insights here.") and **dropped the always-`0` `{n}`** — both the string
      and the `.replace('{n}', …)` at the render site are gone. The branch condition
      itself was already correct (it identifies the empty state), so no branch
      restructure was needed. The other two branches (`pulsePending`,
      `allSystemsVerified`) are untouched.
- [ ] **The `{n}` interpolation call sites bypassed `formatCount` (PR pending;
      close on merge).** They used `.toString()`, so a pending count of `1234`
      rendered **unseparated** in the banner while the KPI tiles rendered it
      **separated**. **Fix:** routed **three** genuine count sites through
      `formatCount(count, language)` — `finishBatch` and `intelligencePulsePending`
      in `DashboardScreen.tsx`, and `processingChip` in `ProcessingTray.tsx` (which
      now pulls `language` from `useLanguage()`, the same context hook the Dashboard
      uses). The **fourth** site the doc originally listed (`intelligencePulseDesc`)
      was **already de-scoped by item 6** — its always-`0` `{n}` was dropped in
      PR #87, so nothing there to localize. A **≥1000 regression assertion** was
      added for the chip (en + fr) and the Dashboard banner/insight (en).
- [ ] **French high-punctuation spacing was inconsistent in `strings.ts`
      (PR pending; close on merge).** French requires a **`U+00A0`** no-break space
      before **`: ; ! ?`**; several `fr` values used a plain **`U+0020`**. An
      authoritative codepoint scan of the whole `fr` block found **14 occurrences
      across 13 keys** — far more than the two the tracker originally named
      (`deleteAccountSubscriptionWarning`, `powerTipText`): also `proWelcomeTitle`,
      `uploadSuccess`, `uploadError`, `ex4`, `allCaughtUp`, `deleteAccountWarningTitle`,
      `totalSpendQuery`, `authForgotPassword`, `authNoAccount`, `authHaveAccount`,
      `authConfirmEmailToast` (mostly `!`/`?`, not just `:`). All 14 were converted
      to `U+00A0`, codepoint-verified, **`fr` only** (en/ar untouched). The
      non-punctuation colon in `auditDesc` (`v1:`, no space before it) was correctly
      left alone. **A `fr`-NBSP guard was added** (`dashboardRestyle.test.tsx`),
      mirroring the em-dash guard: it iterates every `fr` value and fails on any
      plain `U+0020` immediately before `: ; ! ?`, so this defect class is now caught
      automatically.
- [x] **Three raw percent renders on the Dashboard — verified fixed in current
      code (reconciled 2026-07-11).** All three now use `formatPercent`/`Intl`: the
      **by-status row percent** (`DashboardScreen.tsx:346`), the **recent-activity
      confidence percent** (`:461`), and the **trend chip** (`:313`), which carries
      the required **`signDisplay: 'exceptZero'`**. No literal `%` value renders
      remain. (`avgConfidence` was moved to `Intl` percent style in PR #76.)
- [x] **`"Scan Receipt"` hardcoded English literal — verified fixed in current code
      (reconciled 2026-07-11).** `Layout.tsx:93` now renders **`{s.scanReceipt}`**;
      the key exists (sentence-cased) in all three locales (en/fr/ar), so it no
      longer renders English in every locale.
- [x] **`"Unknown document type"` renders untranslated — an enum-key mismatch.
      Fixed in PR #80.** The backend stores **`UNKNOWN_DOCUMENT_TYPE`**
      (`normalizationService.ts` ~L43) while the client's **`DOC_TYPE_LABEL_KEY`**
      map (`lib/searchResultCard.ts` ~L106) keyed only on **`UNKNOWN`**, so the
      lookup **missed** and fell through to `humanizeEnum`. The translated value
      **`docTypeUnknown` exists in all three locales but never fired**. PR #80
      added a `UNKNOWN_DOCUMENT_TYPE` row (mapping to `docTypeUnknown`) so both
      spellings now translate. This was a **code fix, not a string edit**.
- [ ] **Two more enum-key label defects in the same class as the fixed
      `UNKNOWN_DOCUMENT_TYPE` mismatch above.** Sub-item (a) is now fixed (PR #84);
      this box stays open only for the still-unresolved (b) RECEIPT question.
    - **(a) `APPOINTMENT` renders untranslated — FIXED (PR #84).** The backend's
      `DOCUMENT_TYPE_MAP` emitted **`APPOINTMENT`**, but **`DOC_TYPE_LABEL_KEY` had
      no entry** for it, so it fell through to `humanizeEnum` and rendered
      **"Appointment" untranslated** in French and Arabic. PR #84 added the
      **`docTypeAppointment`** key in **all three locales** plus the map row.
    - **(b) `RECEIPT` is a dead `DOC_TYPE_LABEL_KEY` entry** the backend **never
      emits** (the backend produces only `INVOICE`, `BUSINESS_CARD`, `APPOINTMENT`,
      and the two unknowns). **Confirm whether receipts are meant to be a distinct
      document type** — if so, the gap is in the **backend map**, not the label.
- [ ] **`ActivityScreen` renders a count with no grouping in any language.** It
      awaits its own **D5 restyle** (see PR-D5 above); fold the fix in there.
- [ ] **A stale gitignored `dist/` directory poisons local backend test runs.**
      `vitest` collects the **compiled** test files under `apps/backend/dist/`,
      reporting **phantom failures** (failed test *files*, zero failed *tests*).
      **CI does a fresh checkout and never sees it**, so the Backend check stays
      green. Do not chase these locally — run `npx vitest run src`, or clear
      `dist/`.
- [x] **Native anti-steering coverage was thinner than the tracker implied — now
      locked (PR pending; close on merge).** Several D-series entries above promise
      "`nativeAntiSteering` stays green", which reads as though the whole
      anti-steering surface is covered. **It was not:** that suite only mounted
      **PaywallModal** and **SettingsScreen**. Three `isNativePlatform()` guards had
      **no test at all**:
    - **`App.tsx:36` — the CRITICAL one.** On native, `/` must redirect to
      `/dashboard` (or `/login`) instead of rendering the marketing `LandingScreen`,
      **which contains a literal `$9/mo` price block**. A regression here puts a
      **pricing page in front of a Play user** — a direct policy breach with **no
      second layer behind it**. Now locked: redirect asserted for signed-in AND
      signed-out, plus no price / no CTA / no landing copy.
    - **`UploadModal.tsx:61` and `:157`, `CaptureSheet.tsx:94`** — the limit guards
      (neutral status instead of an upsell). A second layer: `PaywallModal.tsx:49`
      already backstops the price, so a failure here would not leak a price *today*
      — **but D8/D8b owns these modals**, and a restyle that swaps `PaywallModal` for
      an inline upgrade CTA would make these guards the only defense. Locked BEFORE
      that restyle, deliberately.
      **Load-bearing assertion:** each test asserts the paywall **never opens at
      all** (absence of `proComingSoonTitle`), not merely "no price" — the latter
      would pass even with a broken guard, since PaywallModal neutralizes it
      downstream. Web negative controls prove the gate is not stuck on.
- [ ] **Displayed price vs charged price — potential silent drift (surfaced during
      PR #93; revenue-path relevant, WEB-only exposure).**
    - **Facet 1 — display/charge mismatch risk.** The advertised price **`$9/mo`**
      (and **`$59/yr`**) is **HARDCODED in frontend JSX** — `LandingScreen.tsx:183`
      (pricing card; `$0` free tier at `:169`) and `PaywallModal.tsx:194` / `:211` /
      `:248` (the CTA label interpolates `'$9/mo'` / `'$59/yr'`). It is **not fetched
      from Paddle**. The **actually-charged** amount comes from Paddle **price IDs**
      (`PaywallModal.tsx:20-22`, `VITE_PADDLE_PRICE_ID_MONTHLY` /
      `_YEARLY`), passed to checkout as `items: [{ priceId, quantity: 1 }]`
      (`PaywallModal.tsx:121`). **If the price is changed in the Paddle dashboard, the
      marketing page and paywall keep advertising `$9`/`$59` and NOTHING in CI
      catches the drift** — a display-vs-charge mismatch with consumer-protection
      edges. **The real charged amount is NOT knowable from this repo** (it lives in
      Paddle), so no test can currently assert the two agree.
    - **Facet 2 — the price is unlocalized.** The figures are **not i18n strings**
      (no price key exists in `strings.ts`), so a French or Arabic user sees a bare
      **USD** figure with no currency or locale formatting — the same i18n class as
      the defects fixed in PRs #76-#88. Note this compounds Facet 1: Paddle may
      present a **localized currency at checkout**, so the hardcoded USD figure can
      disagree with what the user is actually asked to pay, not just by amount but by
      currency.
    - **Scope of exposure — WEB ONLY.** A native (Play) user never sees either
      surface: `App.tsx:36` redirects `/` away from the marketing landing page and
      `PaywallModal.tsx:49` renders the neutral "coming soon" panel instead of the
      priced upsell. **Both guards are now locked by tests (PR #93)**, so this is not
      a Play-policy issue — it is a **web accuracy / consumer-protection** issue.
    - **No fix proposed yet; recorded so it is not lost.** Any change here touches the
      **revenue path** — treat with care and **confirm intent before changing pricing
      display**. A cheap first step, if wanted, is a build-time assertion that the
      hardcoded figures match a single source of truth, but that only helps if the
      Paddle amount is mirrored into config; it cannot read Paddle.
- [x] **Raw upload-error enums leaked to users, untranslated — FIXED as a class
      (PR pending; close on merge).** Found by the PR #93 anti-steering coverage,
      then widened by a read-only scan: the leak was bigger than the one instance,
      and **decoupled from D8/D8b deliberately** (it is a correctness/i18n fix, not
      a restyle, and it was hitting **paying customers** — waiting for a restyle that
      had not started would have shipped the leak for weeks).
    - **`LIMIT_REACHED` in the file-error card.** `UploadModal.tsx` stored
      `err.message` (the raw enum) and the card printed it verbatim, in every
      locale, on both platforms. The toast was already neutral; the card was not.
    - **`DAILY_LIMIT_REACHED` was not handled AT ALL — the highest-value part.**
      The backend returns it (`uploadController.ts:54`, HTTP 429) when a **PRO** org
      passes the rolling 200/day cap. `plan === 'PRO'` skips the FREE gating
      entirely, so a **paying customer** saw the bare token `DAILY_LIMIT_REACHED` in
      the card **and** the toast, on web and native. Now routed through a new
      **`dailyLimitReached`** key (en/fr/ar) with **no upsell** — a PRO user has
      nothing to upgrade to.
    - **Hardcoded English fallbacks removed** (`'Processing failed'`, `'AI extraction
      failed. Please try again.'`) in favour of a translated **`uploadFailedGeneric`**.
    - **Shape of the fix:** components keep the **raw code in state** (the gating
      logic keys off it) and translate **only at the render site**, through one
      funnel — **`lib/uploadErrors.ts` → `translateUploadError(code, s)`**. Unknown
      or future codes get translated generic copy; the raw token can no longer reach
      a user by any path. Applied to the card and to the non-guard toasts in
      `UploadModal` and `CaptureSheet`. **The `isNativePlatform()` guard branches
      were NOT touched** — the native toast stays neutral and the PR #93
      anti-steering tests stay green.
    - **The skipped `KNOWN GAP` test is un-skipped and passing**, plus new coverage:
      `tests/uploadErrorI18n.test.tsx` (fr/ar cards, the PRO daily-cap case, unknown
      codes, and unit tests for the helper).
- [ ] **⚠️ CONSTRAINT for anyone touching the upload error path: NEVER render the
      backend `message` field.** The API's `LIMIT_REACHED` response
      (`uploadController.ts:36-38`) carries
      `message: 'Free plan limit reached (10 scans). Please upgrade to PRO.'`. The
      client never sees it **only because `data.error` takes precedence** in
      `uploadService.ts:23` — **that precedence is load-bearing.** Rendering the
      backend `message` would put **"Please upgrade to PRO"** in front of a **native**
      user: **steering, and a Play-policy breach** — and the anti-steering tests would
      **NOT** catch it, since it contains neither a price nor a known CTA string. The
      obvious-looking "improvement" (show the friendly server message instead of the
      ugly code) is therefore a **trap**. It is now locked behaviorally: a test in
      `nativeAntiSteering.test.tsx` simulates the precedence flipping and asserts the
      upsell still never reaches the DOM (`translateUploadError` maps it to generic
      copy). **The backend `message` field itself is ugly but harmless while unread —
      no API change was made.** If the API is ever cleaned up, drop the upsell
      sentence from that field rather than relying on the client to ignore it.
- [x] **The account-delete path had NO translation layer at all — FIXED (PR #96,
      merged `7a2cfe3f`).** Found during the D8b modal mapping pass. Same class as the
      upload-enum leak above, on the *other* service — and the constraint above now
      applies to **both** paths.
    - **The bug, stated correctly.** It is **not** *"a rare 409 shows English to Arabic
      users"* — that was the framing, and it is the *least* likely case.
      `accountService.ts:19` threw `data.message || data.error` (**prose FIRST**, the
      inverse of `uploadService.ts:23`), and `DeleteAccountModal.tsx:45` stored that
      **display text** in state and rendered it verbatim. So **every** failure of
      `DELETE /api/account` rendered raw English in every locale.
    - **Seven failure shapes reach the render site, not two.** `CONFIRMATION_REQUIRED`
      (400, `accountController.ts:38-41`), `SHARED_WORKSPACE` (409, `:69-73`),
      `RATE_LIMITED` (429, `rateLimits.ts:8-11`, `:63-70`) — and then **four with no
      machine code at all**: `authMiddleware.ts:114` / `:130`, `errorHandler.ts:16` /
      `:48`, plus a **non-HTTP** `TypeError('Failed to fetch')` from the unguarded
      `fetch`. On mobile, a dropped connection beats every other row.
    - **⚠️ The whitelist is load-bearing; the precedence flip alone was INSUFFICIENT.**
      The original recommendation (`docs/D8B_MODAL_MIGRATION_MAP.md` §7.2) was to flip
      to `data.error || data.message`. **That is wrong** — it assumes `data.error` is
      always a machine code. **It is not:** `errorHandler.ts:48` puts
      `'Internal Server Error'` and `authMiddleware.ts:130` puts
      `'Unauthorized: Invalid or expired token'` **into `data.error`, with no `message`
      field to prefer instead**. A flip alone fixes the rarest failure (the 409) and
      leaks on every 500, every expired token and every dropped connection. The fix is
      **`lib/accountErrors.ts` → `translateAccountError(code, s)`**: a **whitelist with
      a translated fallback**, mirroring `uploadErrors.ts`. Anything unrecognised —
      prose, future enums, network faults, empty bodies — falls through to the existing
      `deleteAccountError`. **It never returns its input.** The flip still shipped, but
      to avoid *losing* information (so `SHARED_WORKSPACE` reaches the map as a code),
      not to make the fix safe. `data.message` was dropped from the chain **entirely**:
      `data.error || 'DELETE_FAILED'`.
    - **⚠️ The `fetch` try/catch boundary is deliberate — do not widen it.** It wraps
      **only the `fetch` call**, not the method body. Wrapping the body would swallow
      the `!res.ok` throw beneath it and **collapse every HTTP error into
      `NETWORK_ERROR`**, destroying the very code mapping the PR exists to build —
      `SHARED_WORKSPACE` would silently become generic copy. A comment at
      `accountService.ts` records this; it is a real trap for a future "tidy-up".
    - **Shape:** raw code in state, translated at the render site — the same idiom as
      `UploadModal.tsx:155` → `:335`. 3 new keys × en/fr/ar
      (`deleteAccountSharedWorkspace`, `deleteAccountRateLimited`,
      `deleteAccountConfirmRequired`); the fallback reuses the **existing**
      `deleteAccountError`. Codes #4-#7 get **no key by design** — a 500 has nothing
      useful or non-alarming to say, and `errorHandler.ts:44-49` already returns an
      `errorId` for support to trace.
    - **Coverage: this path had ZERO tests before #96** — no test, frontend or backend,
      exercised account deletion at all. The three suites mounting `SettingsScreen`
      mount the modal **closed** (`DeleteAccountModal.tsx:26` returns `null` when
      `!isOpen`). `tests/accountErrorI18n.test.tsx` is the first. Its centrepiece is the
      **negative control** (the `uploadErrorI18n.test.tsx:110-114` precedent): each
      backend English string, handed to the helper **verbatim**, must come back as
      translated generic copy — **which holds even if someone later flips the precedence
      back**. **Mutation-verified:** reverting the render site to `{error}` fails 7 of
      the DOM tests.
    - **No anti-steering guard touched.** `DeleteAccountModal` has no `plan` prop, no
      paywall, no upload, no `isNativePlatform()` branch. The whitelist is *strictly
      protective*: it makes it structurally impossible for backend upsell prose to reach
      the native DOM on this path — the same protection `uploadErrors.ts:16-25` gives
      the upload path.
- [ ] **`deleteAccountSubscriptionWarning` renders inside the native shell and is
      covered by NO anti-steering test — deferred to the D8b restyle PR for a
      decision.** Flagged by the D8b mapping pass; **deliberately NOT touched in PR #96**
      (that PR was bug-fix only). `strings.ts:178` names **"the App Store or Google
      Play, and web subscriptions via the billing portal"** and renders at
      `DeleteAccountModal.tsx:90` (`:93` post-#96 — the amber notice), i.e. **inside the
      native app**. **This is not a known defect:** it is **required cancellation
      disclosure**, it contains **no price and no purchase CTA**, and naming the billing
      portal as one of several cancellation routes is not steering to a payment flow.
      **The gap is coverage, not conduct** — `nativeAntiSteering.test.tsx` does not cover
      `DeleteAccountModal` **at all**, so nothing would catch it if this copy later
      drifted toward a CTA. **Decide during the restyle:** either accept it and add a
      guard pinning the absence of price/CTA, or reword. **Do not silently drop the
      disclosure** — deletion genuinely does not cancel billing, and users must be told.
- [ ] **D8b colour finding: the three modals are literally the WRONG HUE — the
      strongest single justification for D8b.** `tailwind.config.cjs:15` states the
      `--sa` token colours are **ADDITIVE** and deliberately **do not shadow** Tailwind's
      built-in palette, and **`designTokens.test.ts:52-58` LOCKS that in**, asserting
      `blue`/`slate`/`gray`/`amber`/`emerald`/`rose`/`red` are all `undefined` in the
      theme extension. **Therefore `bg-blue-600` in these modals renders literal
      Tailwind blue `#2563EB`, while the app's actual accent is indigo
      `--sa-accent: #635BFF`** (`tokens.css:22`, locked by `designTokens.test.ts:27`).
      The primary CTAs — `UploadModal.tsx:245` (Scan with Camera),
      `CaptureSheet.tsx:169` (Take Photo) and `:244` (Extract) — are **visibly a
      different colour from every restyled screen in the app**. This is a **live visual
      bug**, not a cleanliness issue. All three modals use **zero** `--sa` token
      utilities today. **Corollary:** because the tokens are additive by design, a
      token-only sweep can never fix this implicitly — each literal must be migrated by
      hand, and **CI will not fail on any of them**.
- [ ] **D8b implementation order — CONFIRMED: `DeleteAccountModal` (restyle) →
      `CaptureSheet` → `isMultiDoc` cleanup (its own commit) → `UploadModal`.**
      Reasoning, in one line: **the modal vocabulary does not exist yet and must be
      invented on the smallest, guard-free modal, while silent-regression risk is
      concentrated in `UploadModal`, so it goes last.** Expanded:
    - **`DeleteAccountModal` first** — the D-series has restyled five *screens* and
      **zero modals**, so the vocabulary (overlay, sheet vs. centered panel, header,
      footer button pair, the undocumented z-index ladder) has to be invented
      somewhere; invent it where there is least to lose. 146 lines, three state vars,
      **no `plan` prop, no upload, no paywall, zero anti-steering guards, zero Class-B
      truncation exposure**. Blast radius if botched is contained ("a user cannot delete
      their account") with **no Play-policy exposure**. Its bug-fix half already shipped
      separately as **PR #96**, so the restyle PR is now purely visual.
    - **`CaptureSheet` second** — validates the new vocabulary against the *bottom-sheet*
      variant (two portals) and the **native back-button contract** (`useBackDismiss` ×2),
      neither of which `UploadModal` exercises. One guard (G3), one Class-B site
      (`:225`). Its `isMultiDoc` removal is the **clean** one (see TRAP 1 above), making
      it the right place to prove the cleanup pattern before applying it where it bites.
    - **The cleanup as its own commit, in the middle** — it is a **behavioural** change,
      not a restyle, and it **deletes a currently-green test**. Buried in a ~120-literal
      restyle diff that deletion is invisible and reads like someone dropping an
      inconvenient failure. Standalone, citing `82e2697`, it is self-evidently correct.
      Landing it *before* the `UploadModal` restyle also means that restyle never has to
      reason about the dead branch at all.
    - **`UploadModal` last** — worst on every axis at once: 442 lines, 8 state vars,
      ~120 raw literals, 9 × `font-black`, 6 legacy `btn-*`, 19 untranslated strings,
      **two** anti-steering guards, **the** `freePlanSingleDoc` live-vs-dead trap, and
      two test queries that break the moment its copy is translated
      (`nativeAntiSteering.test.tsx:356`, `uploadGating.test.tsx:110` locate the submit
      button by the literal `'Start Extraction (1)'` — switch them to `data-testid`
      **before** touching that copy).
    - **The counter-argument, rejected:** *"do the hardest first while context is
      freshest"* is the usual instinct and it is wrong here. The binding constraint is
      **not effort — it is the risk of a silent anti-steering regression, and that risk
      lives entirely in `UploadModal`.** Front-loading it maximises exposure at exactly
      the moment the team has the least settled idea of what a restyled modal looks
      like, and guarantees the compliance-critical guards get rewritten twice.
- [ ] **Dead branch: the `isMultiDoc` comparison in `UploadModal` / `CaptureSheet`.**
      Both compare the error against the literal
      `'Please upload a single document per image'`, **which the backend never
      emits.** Multi-document detection runs **asynchronously in the background**
      (`ingestionService.ts:37-45`) and marks the document **`NEEDS_REVIEW`** — it
      never fails the upload request. So the comparison (and its `s.freePlanSingleDoc`
      arm in the API-error path) is **unreachable from the API**. Same class as the
      dead `RECEIPT` enum tracked above. **Deliberately NOT removed in the fix PR** —
      deleting it is a behavior change and needs a decision: either the backend should
      reject multi-doc uploads **synchronously**, or the dead comparison should go.
      **Note the identical string IS still used, legitimately, by the client-side
      multi-file guard** (`UploadModal.tsx:61`, more than one file per batch) — that
      path is live and must not be broken by any cleanup here.
    - **Strengthened by the D8b mapping pass (2026-07-16), re-verified at `7a2cfe3f`.**
      The decision above is now made: **remove it**, as its own commit, landing
      between the CaptureSheet and UploadModal restyles (see the D8b order below).
      The evidence is stronger than "the backend never emits it" — **the server
      architecturally CANNOT emit it.** `uploadController.ts:85` returns **202 and
      sends the response**, then `:93` fires `processUploadAsync` in `setImmediate`;
      inside it, `ingestionService.ts:37-45` (full path:
      `apps/backend/src/services/ingestion/ingestionService.ts`) validates and, on
      failure, calls `markAsNeedsReview` and **returns — it does not throw to the
      client**, which has already been told the upload succeeded. It died in commit
      **`82e2697`** *"Moved single-document validation from synchronous upload to async
      background processing"* (2026-03-28). Repo-wide, the prose string now appears in
      exactly **three** places, all frontend: `UploadModal.tsx:158`,
      `CaptureSheet.tsx:94`, `uploadGating.test.tsx:117`. **Zero backend occurrences.**
    - **TRAP 1 — the "unused" key is LIVE, and `s.freePlanSingleDoc` has two different
      reachabilities.** `UploadModal.tsx:64` is **LIVE** (the multi-file batch guard,
      covered by `nativeAntiSteering.test.tsx:339`); `UploadModal.tsx:162` is **DEAD**
      (the `: s.freePlanSingleDoc` ternary arm). In `CaptureSheet.tsx:100` it is
      **DEAD and the file's only use** — so the collapse `(isLimit || isMultiDoc)` →
      `isLimit` is total and clean there, but in `UploadModal` **the key must survive**.
      The obvious follow-up move — *"this string is now unused, delete the key"* —
      **silently breaks a tested native-compliance path.** Keep the key in `strings.ts`.
    - **TRAP 2 — a green test pins the dead code and will go red on removal.**
      `uploadGating.test.tsx:116-125` (*"GATE 2: the multi-document validation error
      also paywalls non-PRO users"*) mocks `uploadDocument` to reject with the dead
      prose (`:117`) and asserts the paywall opens (`:124`). **It passes today while
      testing a path production cannot produce** — a false-green. On removal it fails,
      and **the failure will look like a paywall regression**. Delete it in the *same*
      commit, citing `82e2697`. The risk of not doing so is that whoever sees it red
      "fixes" it by restoring the branch, or worse, loosens the guard.
    - **Also unprotected:** all three anti-steering tests drive the **`isLimit` arm
      only** (`nativeAntiSteering.test.tsx:339`, `:351`, `:372`, `:464`). **No test
      exercises the `isMultiDoc` arm** — so the dead branch is not merely unreachable,
      it is untested. Another reason to delete rather than restyle around it.
- [ ] **Short Latin filenames in the Arabic UI align LEFT, floating away from their
      row icon (cosmetic, low priority).** Observed on the **Review Queue** and
      **Document Detail** during the **PR #91** browser review: a short Latin name
      (e.g. `receipt.pdf`) hugs the **left** edge of its box — about **176px** from
      the file icon sitting on the right — so it reads as detached from its own row.
      **This is PRE-EXISTING and NOT caused by PR #91:** the old and new markup were
      measured side by side in the same RTL context and align **identically** (old
      forced *everything* LTR, so Arabic names detached the same way; the fix pulled
      **Arabic** names to the container start and left Latin exactly where it was).
      It is also arguably **defensible** — `dir="auto"` aligns per content, and a
      Latin value legitimately reads left-to-right. **If** we want Latin values to sit
      at the container start like their Arabic siblings: keep `dir="auto"` (it is
      required for correct bidi + truncation) and pin **alignment** to the *page*
      direction instead of the element's own — e.g. an `rtl:text-right` variant, since
      `text-align: start` resolves against the element's resolved direction, not the
      page's. **Cosmetic follow-up, not merge-blocking.**
- [x] **`NaN%` in the Extracted Facts confidence column — investigated, NON-ISSUE
      (closed, do not re-open).** Seen during the **PR #91** browser review and
      flagged as possibly real. **It was an artifact of the reviewer's stub data**,
      not the backend: the injected `CURRENCY` fact carried no `confidence`, and
      `DocumentDetailScreen` (L268/295) renders `Math.round(fact.confidence * 100)`,
      which yields `NaN` for `undefined`. **The backend cannot produce this.** Verified
      read-only: Prisma models the column as **`confidence Float`** —
      **non-nullable** (`schema.prisma` L152) — and `mapDocumentToDto` passes it
      straight through (`documentDto.ts` L22), so every fact reaching the client
      carries a real confidence. **No user can see `NaN%` today; no fix needed.**
      **Latent fragility worth knowing** (not a bug now): the *only* thing preventing
      it is the DB schema. The render site has **no defensive fallback**, so a future
      migration that made `confidence` optional would surface `NaN%` to users with no
      test catching it. If that migration is ever proposed, add the guard first.
- [x] **D5 `ActivityScreen` populated-row VISUAL review — DONE, and it found a real
      RTL defect (fixed in PR #90).** Reviewed on real pixels: the app was run
      locally in Arabic (`dir="rtl"`) with the populated row on screen. Results:
      **row flip CORRECT** (icon chip + filename/date at the right/start edge,
      status dot + label at the left/end edge — placed by **`justify-between`**, not
      `ms-auto`; **`ms-auto` is only on the count badge** in the card header, which
      also lands correctly at the end edge — an earlier note in this tracker
      misattributed the mechanism and is corrected here). **Bidi rendering of the
      mixed Arabic/Latin filename + date CORRECT** while the value fits.
      **DEFECT FOUND on truncation:** the filename/date sat in
      `<p class="truncate" dir="auto"><bdi>{value}</bdi></p>`. **`<bdi>` is a bidi
      isolate, so `dir="auto"` cannot see the strong characters inside it** and fell
      back to **LTR** — the truncating box then clipped the **LEADING (identifying)
      end** of an Arabic filename. Measured in Chrome: it kept
      `…مغربية_مارس_2026_نسخة_نهائية.pdf` and **threw away
      `فاتورة_شركة_الاتصالات_ال`**. **Fix:** dropped the redundant `<bdi>` (the value
      is the sole content of the block, so the block already isolates it) leaving
      `dir="auto"` **on the truncating element**, where it actually applies —
      re-measured: direction resolves **`rtl`** for Arabic / **`ltr`** for Latin, and
      the ellipsis now clips the **trailing** end. **Guarded** by three assertions in
      `activityRestyle.test.tsx`. **This is the canonical idiom D7/D8a must copy:**
      `dir="auto"` on the truncating box, **no isolate child stealing it** (`<bdi>`
      remains correct for values rendered INLINE beside other text). Only visible on
      a populated row at a narrow/overflowing width — which is exactly why the empty
      state, the Vercel preview and jsdom all missed it.
- [ ] **RTL truncation sweep — the same defect in the ALREADY MERGED screens
      (PR pending; close on merge).** D5 did not invent the idiom; it **copied** it,
      and the original was **live in production**, clipping the identifying head of
      filenames in Arabic. Swept in the pending PR:
    - **Class A — the `<bdi>` isolate swallows `dir="auto"` on a truncating box
      (8 sites).** `ReviewQueueScreen.tsx` (name / type / vendor, in **both** the
      mobile card and the desktop table) and `DocumentDetailScreen.tsx` (the `h1`
      filename + a truncating value). **Fix:** drop the redundant `<bdi>`, keep
      `dir="auto"` on the truncating element (the canonical PR #90 idiom).
    - **Class B — a truncating box holding user text with NO `dir` at all (4 merged
      sites).** It inherits the page direction, so in Arabic a **Latin** filename is
      clipped from its leading end — the same user-visible defect, opposite trigger.
      Verified in Chrome: a Latin name in an inherited-RTL box kept
      `_March_2026_Final_Copy_v2.pdf` and **threw away `Uber_Receipt_Statement`**.
      **Fix:** add `dir="auto"` to the truncating box. Sites: `DashboardScreen.tsx`
      (recent-activity filename + meta line) and `ResultTable.tsx` (title + vendor).
    - **App-wide guard added** (`tests/rtlTruncation.test.ts`): a whitespace/newline
      tolerant source scan over all of `apps/frontend/src` rejecting a `<bdi>` inside
      a truncating `dir="auto"` box, with a positive control. **It covers Class A
      ONLY** — source cannot tell a filename box from an i18n-label box (the
      `status.label` spans truncate too and *correctly* inherit locale direction), so
      **Class B cannot be guarded app-wide** and is pinned per-screen instead.
    - **NOT touched (correct isolates — do not strip in any future sweep):**
      ReviewQueue amount + date, DocumentDetail summary / fact values / table cell /
      entity chips (`break-words`, never truncated), and `DecisionBanner`. `<bdi>`
      stays right for a value rendered **inline beside other text**.
- [ ] **Class-B RTL truncation in the UN-RESTYLED screens — DEFERRED to their own
      restyle PRs (recorded so they are not lost).** Same defect (a truncating box
      holding user text with no `dir`, so it inherits the page direction and clips a
      Latin filename from its leading end in Arabic). These files still carry the raw
      `slate-*` palette and are awaiting D6/D8, so the `dir="auto"` fix should ride
      that restyle rather than a token-only sweep: **`ProcessingTray.tsx:97`**
      (`job.fileName`), **`CaptureSheet.tsx:225`** (`file.name`),
      **`UploadModal.tsx:315`** (file name), **`SettingsScreen.tsx:68`** (user email),
      **`SharedComponents.tsx:77`** (grouped query label). The app-wide guard does
      **not** catch these (it is Class-A only), so they will not fail CI — they must
      be fixed by hand when their screen is restyled.
      **Line numbers corrected 2026-07-16** (D8b mapping pass, re-verified at
      `7a2cfe3f`): `CaptureSheet` is **`:225`** not `:221`, and `UploadModal` is
      **`:315`** not `:310`. The five sites themselves are all re-confirmed live.
      **Within the three D8b modals, `:315` and `:225` are the ONLY two** — they are
      the sole `truncate` occurrences in those files, and **`DeleteAccountModal` has
      no `truncate` at all**, so it carries zero Class-B exposure (its only `dir` is
      the correct `dir="ltr"` on the email input). The other three sites above live
      outside D8b's scope and are **not** superseded by that count.
- [ ] **Arabic copy for the three new PR #96 keys is verified at CODE-POINT level
      only — needs a human eyeball in the Arabic UI during the D8b restyle PR.**
      (Owner: **@tornidomaroc-web** — this one is a human task, not an agent task.)
      `deleteAccountSharedWorkspace`, `deleteAccountRateLimited` and
      `deleteAccountConfirmRequired` were checked by dumping their Unicode code points:
      all three are **Arabic block `U+0600-06FF` only, zero Latin letters, no
      bidi/zero-width control characters**, and each key appears exactly 3× in
      `strings.ts` (en/fr/ar parity). **That is the limit of what was proven.** Code
      points do **not** prove the copy **reads naturally** to a native speaker, nor that
      it **lays out correctly RTL** in the modal. `renderScreens.test.tsx:167-171` proves
      only that the **keys exist**. Same standing lesson as the D5 Arabic review, which
      found a real RTL defect that green CI, the Vercel preview and jsdom **all missed**:
      **green CI is not evidence of Arabic correctness.** The restyle PR already puts a
      reviewer in this exact modal — check the three error strings then.
- [ ] **Two hardcoded English strings leak into the AR/FR sidebar** (seen during the
      D5 Arabic review; **out of scope for PR #90** — the sidebar restyle is its own
      deferred item). **`Sidebar.tsx:107`** renders a bare **`New Scan`** and
      **`Sidebar.tsx:213`** falls back to a bare **`'Checking Plan...'`** while the
      plan resolves. Both render English in every locale. Fold into the sidebar
      restyle, or fix as a small i18n PR.

## Remaining (post-redesign, separate work)

- [ ] Per-period breakdown / pending / confidence (PR-C1 only provides
      per-period *processed* counts, so the "This month" control scopes only the
      Processed KPI today). Would need extra backend period aggregations.

## Known separate item (NOT part of the redesign)

- [ ] Three **developer-only** diagnostic strings still contain em dashes and are
      **not** user-facing (optional cleanup, own PR if desired):
      `PaywallModal.tsx:112` (console.error), `paddle.ts:8` (thrown Error),
      `apiConfig.ts:12` (console.error).
- [ ] **Em-dash cleanup in non-guarded copy.** The PR #51 em-dash guard scans
      only i18n `strings` values, so em dashes still remain in pre-existing D1 to
      D3 test `describe()` titles and in older prose in this tracker. Purge them
      in a dedicated sweep PR so the no-em-dash rule holds literally across the
      codebase, not just in i18n copy. (New additions since PR #60 are already
      em-dash-free; this is only the pre-existing backlog.)

## Android / Google Play production launch

### Done — production launch submitted

- [x] **Production access granted (2026-07-08); signed AAB built, uploaded, and
      submitted for review (2026-07-10).** Google Play **production access was granted
      on 2026-07-08**. `versionCode` was bumped **1 → 2 (PR #82)** because **1 was
      consumed by closed testing**, and **release signing was wired into Gradle
      reading `key.properties`** so the CLI produces a **signed AAB** (the signing
      secrets remain **gitignored and untracked**). A signed AAB (**versionCode 2,
      versionName 1.0, ~5.24 MiB**) was built and **uploaded to the Production
      track**, targeting **all 177 countries/regions**, with **English / French /
      Arabic release notes** that honor the **silent-Android constraint** (no price,
      no payment, no steering). **Submitted for Google review on 2026-07-10**;
      **managed publishing is off**, so it **auto-publishes on approval**.

### Post-launch — deferred (do NOT act before the stated gate)

- [ ] **Reset the review account to FREE — GATED on Google's production review
      completing; do NOT do it before then.** The review account
      **`unicornapps.support@gmail.com`** holds **PRO via
      `Organization.planOverride = PRO`** (a manual entitlement floor) with **zero
      `Subscription` rows**, deliberately, so Google's reviewer sees PRO features.
      **CRITICAL correction to the existing `LAUNCH_TODO` phrasing — this is NOT a
      single-column update.** `Organization.plan` is a **stored cache recomputed only
      on a billing event**, and this account has **no subscriptions**, so **nulling
      `planOverride` alone leaves `plan = PRO` frozen forever**. The reset must set
      **BOTH `planOverride = null` AND `plan = FREE`** (= `derivePlan(null, [])` for
      this zero-subscription org) **in one transaction**, via a **new idempotent
      script mirroring the `backfillSubscriptions` precedent** (resolve the org by
      `REVIEW_ACCOUNT_EMAIL` or `REVIEW_ACCOUNT_ORG_ID`, **STOP on 0 or >1 matches**),
      followed by **`npm run verify:entitlement`** which must report **0 mismatches**.
      **Not urgent, low risk** (no billing, no cost); the only concern is **hygiene** —
      a permanent elevated-privilege grant on an externally-shared support email.
      **Also add a test** mirroring the backfill's, asserting the script **drives both
      columns** and **STOPs on org-resolution ambiguity**.
- [ ] **Ship a deobfuscation / mapping file with a future release (non-blocking).**
      Google flagged a **non-blocking warning** on the production release: **no
      deobfuscation/mapping file is associated with the app bundle**. If R8/ProGuard
      obfuscation is used, **uploading a mapping file makes crash/ANR reports
      readable**. Optional; ship a mapping file with a future release.

## Play rejection — launcher icon mismatch (2026-07-17)

- [x] **Rejection.** Google rejected the production release on **2026-07-17** —
      **Misleading Claims / store listing mismatch**. The store's hi-res icon is the
      Scan & Action mark (white document + checkmark on a teal→navy gradient); the
      **on-device launcher icon was the Capacitor logo** (a light-blue X), the
      un-replaced `cap add android` scaffold from **`1b328ee`** (2026-06-14). It had
      **one commit, ever** — never anything but the default. Nothing was published to
      users. Assets-only: no billing, no steering, no content issue. The rejected
      `versionCode 2` AAB demonstrably carried the Capacitor logo (verified by
      unzipping `app/build/outputs/bundle/release/app-release.aab`).
- [x] **Not a pipeline defect.** There is **no** `@capacitor/assets` / `cordova-res` /
      `assets` config anywhere; `cap sync` does not write `res/mipmap-*`. The icons were
      scaffolded once and hand-carried. So the fix is a one-time asset swap that stays
      fixed — nothing regenerates them on build.
- [x] **The splash was the same bug.** All 11 `drawable*/splash.png` were *also* the
      Capacitor logo, wired live via `capacitor.config.ts` (`androidSplashResourceName:
      'splash'`, 1500 ms on every cold start). A launcher-only fix would have shown the
      Capacitor mark full-screen on first launch and risked a **second** Misleading
      Claims strike. Fixed in the same PR.
- [x] **No vector source existed, so one was built.** The mark was produced by an image
      generator and only ever existed as a flat raster; the two files at the repo root
      were **byte-identical** (md5 `6b46ba3b40a8f9b9ffb62816242b3223`, and the `.png` was
      actually a JPEG). A flat composite could not produce **16 of the 26** assets — the
      adaptive foreground needs a transparent cutout, and the cyan check / beam bloom are
      unkeyable off the teal gradient. The mark was therefore **reconstructed as a layered
      parametric SVG by measurement** and numerically fitted: **mean abs 1.42/255, RMSE
      4.23, 98.8 % of pixels within 24/255**; residual is edge-only (reference is soft
      4:2:0 JPEG, master is sharp vector).
- [x] **Master (source of truth):** **`apps/frontend/assets/scan-action-mark.svg`**.
      Generator: `apps/frontend/assets/generate-android-icons.py` (`python
      apps/frontend/assets/generate-android-icons.py`, needs `resvg-py` + `pillow`).
      Every shipped asset derives from the master; **nothing** derives from the flat JPEG.
      Reference copy of record: `docs/icon-rebuild/store-listing-icon-512-REFERENCE.jpg`;
      the two root duplicates are now **gitignored** so nothing derives from an ambiguous
      source. Full write-ups: `docs/ICON_MASTER_REBUILD.md`,
      `docs/ANDROID_LAUNCHER_ICON_MISMATCH_MAP.md`.
- [x] **31 assets regenerated** (not 26 — see next item): 5 `ic_launcher`, 5
      `ic_launcher_round`, 5 `ic_launcher_foreground`, **5 new `ic_launcher_background`**,
      11 `splash`. Verified by decode: **0 Capacitor logos remain** across all 35 tracked
      PNGs under `android/` (content sweep, not filename trust).
- [x] **The adaptive background had to change — keeping `#FFFFFF` was not viable.** The
      brief said keep `values/ic_launcher_background.xml` (`#FFFFFF`) as declared. That is
      wrong and the evidence is unambiguous: **the mark's document outline is white**, so
      on a white background the icon renders as a blank white circle with only the cyan
      check and beam floating — **contrast 0/255**. The background is now the master's
      gradient as 5 `mipmap-*/ic_launcher_background.png`, bleed-extended (clamped ends)
      so it is 100 % opaque to the canvas corners; `mipmap-anydpi-v26/*.xml` point at
      `@mipmap/ic_launcher_background`. The now-unreferenced `values/ic_launcher_background.xml`
      was deleted. PNG (not VectorDrawable) for deterministic rasterisation.
- [x] **Adaptive mapping:** the whole 512 master maps onto the central **72dp (288px)** of
      the 432px foreground (`scale 0.5625`, `translate 72,72`). All ink then sits at **max
      radius 113.4px**, inside the 66dp safe circle (r=132); **0.000 %** of foreground ink
      is destroyed by a 72dp circular mask. The naive 1:1 map (`scale 0.84375`) puts the
      document's corners at r=196.9 and **clips them**. The **scan-line was not shortened**
      — it is 71.3 % of the viewport, exactly its proportion in the store icon, with its
      ends at r=104.6. Shortening it would be a redesign, and a redesign is the violation.
      Shipped composite's 72dp viewport vs the store icon: **mean abs 1.47, RMSE 4.12**.
- [x] **Dead scaffold removed:** `drawable/ic_launcher_background.xml` (the `#26A69A`
      teal grid) and `drawable-v24/ic_launcher_foreground.xml` (the bugdroid) were stock
      Android Studio defaults, **unreferenced** by the adaptive icon (which resolves
      `@mipmap/`, not `@drawable/`) yet compiled into the AAB as dead weight. The
      `#26A69A` is a coincidence, **not** the brand teal — it trapped an earlier pass.
- [x] **versionCode 2 → 3** at `apps/frontend/android/app/build.gradle:23`. Play retires a
      versionCode on **upload**, not approval — the rejected build consumed 2.
      `versionName` stays `"1.0"` (nothing ever shipped under it).
- [x] **Splash mark size 32% → 42% (owner's aesthetic call, PR #100).** Follow-up to #99.
      **This was a taste decision by the repo owner, not a correction and not a
      measurement** — 32% was an arbitrary default I picked when replacing the Capacitor
      splash (there was no baseline worth preserving; what shipped was the wrong logo).
      Owner reviewed both sizes as rendered images and chose 42%. Only the **11
      `drawable*/splash.png`** changed; the **20 launcher/background PNGs regenerated
      byte-identical**, so the launcher icons, the adaptive background, and
      `scan-action-mark.svg` are **provably untouched** by that PR (the generator rewrites
      all 31 every run — `git status` showing only the 11 is the proof, not an assurance).
      - **The constant is not the percentage.** `SPLASH_MASTER_SCALE` in
        `generate-android-icons.py` sizes the **master square**; the mark's ink is only
        366 of the master's 512px. So ink-width-as-%-of-portrait-width =
        `SPLASH_MASTER_SCALE × 366/512`. **0.5875 → 42.0%** (0.45 was 32.2%). Anyone
        editing this must convert, not guess. Measured result: 41.9–42.1% across every
        portrait density.
      - **Landscape stays 24–28%, deliberately.** Sizing is relative to the canvas's
        **shorter edge**, so the logo keeps the same **physical** size when the device
        rotates. Sizing to width instead would blow the mark up absurdly in landscape.
        Adopted by the owner as the locked behaviour.
      - **New guard.** The generator now **hard-fails** (`SystemExit`) if a future
        `SPLASH_MASTER_SCALE` would push the mark's ink past any canvas edge, at any
        density. At 42% the tightest density (`drawable-port-mdpi`, 320×480) still leaves
        **93px** of horizontal margin. Verified: border deviation from `#0f172a` is **0
        across all 11** (no seam), no halo, nothing clipped, centring within 0.5px.
- [ ] **DEFERRED — three-mark brand divergence.** Store + launcher + splash are now the
      teal document mark, but the **web/PWA is still a blue arrow on `#0f172a`**
      (`apps/frontend/public/icons/*`, the inline favicon at `index.html:5`,
      `manifest.webmanifest`). Store and web **already disagreed before** the Capacitor
      bug — the launcher defect was masking a pre-existing split. Explicitly **out of
      scope** and untouched. Decision + recommendation: **`docs/BRAND_MARK_DIVERGENCE.md`**.
- [ ] **Follow-up: install a real asset pipeline (non-blocking).** Icons remain
      hand-generated via the script above, so they can drift again. `@capacitor/assets`
      would prevent recurrence. **Deliberately deferred** — adding a code generator to the
      PR that unblocks a rejected release means a generator bug costs another review cycle.
- [ ] **Back up the upload keystore.** `D:\keys\scan-action-upload.jks` exists on one
      machine only. Losing it means never shipping an update to `com.scanaction.app`
      again without a Play-support key reset. Orthogonal to this rejection; still real.

## Design decisions locked

- **Accent:** indigo `#635BFF` via the `--sa-*` tokens.
- **Fonts:** Inter (Latin) + IBM Plex Sans Arabic (Arabic), self-hosted.
- **Status breakdown:** REAL statuses only — COMPLETED→Processed,
  NEEDS_REVIEW→Needs review, REJECTED→Rejected. **No fabricated Approved/Flagged
  buckets.** FAILED / in-flight PROCESSING excluded from the breakdown.
- **No approval-rate metric** in the C-series.
- **Periods:** UTC month boundaries for v1 (no per-org timezone).
- **"Processed" definition:** COMPLETED + NEEDS_REVIEW (matches the existing
  `totalCount`), bucketed by `processedAt`.
- **No pricing / anti-steering UI on the dashboard, ever.** Native anti-steering
  gating (PR #47) stays untouched and green.
- **Honesty rule:** never render fabricated numbers — show the placeholder when
  data is genuinely empty.
- **App mark:** `apps/frontend/assets/scan-action-mark.svg` is the **only** source of
  truth for every Android icon/splash asset. Nothing derives from the flat store JPEG —
  it is a flattened composite with no alpha and cannot produce a cutout. Regenerate with
  `python apps/frontend/assets/generate-android-icons.py`, never by hand.
- **Match, do not improve, the app mark.** The Play rejection was for the on-device mark
  differing from the store listing, so restyling it — including "tidying" the scan-line
  that overruns a naive safe-zone read — **is** the violation.
- **Adaptive icon background is the gradient**, not a flat colour. The mark's document
  outline is white; on the old `#FFFFFF` background it is invisible (contrast 0/255).
- **Splash logo: 42% of portrait width** (`SPLASH_MASTER_SCALE = 0.5875`), sized to the
  canvas's **shorter edge** so it stays the same physical size on rotation (landscape
  therefore reads 24–28% of width — that is correct, not a bug). Owner's aesthetic call.
  Unlike the app mark itself, the splash has **no match-the-store constraint** — it is not
  a store-listing surface — so this one is free to change on taste.
