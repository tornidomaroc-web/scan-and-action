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
- [ ] **PR-D5** — Activity restyle. **← next.**
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
- [ ] **(B) Proper data-model fix (later follow-up, has a data dimension).** Add
      `Entity.displayName`, populate it at write time from the original name
      (preserving casing/accents), backfill existing rows from `aliases[0]`,
      expose it in the DTO, and render it everywhere. Removes `aliases`
      double-duty; requires a Prisma migration + backfill.
- [ ] **(C) `isFoodMerchant` accent bug (separate rule-engine fix).** The food
      rule lowercases the accent-stripped `canonicalName` and does
      `includes('cafe')` (`ruleEngineService.ts:143-149`), so a "Cafe" merchant
      whose real name carries an accent (canonical "CAF...") never matches the
      keyword. Silent rule miss; track independently of the display fix.
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
- [ ] **(D-follow-up) Count separators follow the browser locale, not the app
      language.** `DashboardScreen.tsx` uses `Number.toLocaleString()` with no
      locale argument for the KPI / breakdown counts (~L194, ~L201, ~L337), so
      thousands separators render in the runtime locale rather than the active app
      language — the same bug class as (D) but lower priority (digit grouping only,
      no text). Deliberately excluded from the PR #68 D fix; fold into a small
      number-format cleanup PR.

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

### Still open — deferred OUT of the E rollout (tracked so they are not lost)

Two heading items were deliberately kept out of PR #66 because each needs work
beyond dropping in `SectionHeading`:

- [ ] **Inline-toolbar headings** — the Dashboard **recent-activity** heading
      (`DashboardScreen.tsx` ~L407) and the Search **results** heading
      (`SearchScreen.tsx` ~L228). Both are "heading + action on one row" layouts;
      `SectionHeading`'s block `<h2>`/`<h3>` + `mb-4` does not fit them without a
      row refactor. Adopt the shared style once the toolbar row is restructured.
- [ ] **Search page title standardization** (`SearchScreen.tsx` ~L106) — the raw
      `text-3xl` / `lg:text-4xl` hero title should adopt the **`text-title-lg`**
      page-title token used elsewhere. This is a **separate** change from
      `SectionHeading` and must **NOT** be wrapped in it (that would shrink the hero
      to 16px). It is a page-title standardization, not a section-heading job.

Notes for the rollout: the File Detail heading defects the audit surfaced (the
AI-synthesis heading was an `h4` at 12px `text-accent-text` while its peers were
`h3` at 15px `text-ink`; the graph-relationships heading was the only one with a
bare muted icon and a top divider; heading levels were non-monotonic) were
**resolved on that page in PR #64** — the `SectionHeading` primitive settled one
icon convention. Carry the same conventions to the rollout screens above.

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
