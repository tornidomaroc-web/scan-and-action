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

- [ ] **PR-C1 (this PR)** — Backend analytics. Extend `GET /documents/stats`
      additively with `statusBreakdown`, `monthlySeries`, and `periods`; Prisma
      aggregations (org-scoped); additive index migration; backend tests. Real
      statuses (Processed / Needs review / Rejected); approval-rate omitted; UTC
      month boundaries for v1. **Backend only — no frontend render change.**
- [ ] **PR-C2 (next)** — Frontend wiring. Feed real series / breakdown /
      trend-chip; restore the **"This month" filter** as a real control; chart
      RTL (months right-to-left). Consumes PR-C1's payload. Frontend tests. Keep
      the placeholder when data is genuinely empty (no fabricated flat-zero).
- [ ] **Deferred** — Sidebar restyle + propagate the design system to the other
      screens (Search, Review, Settings, etc.).

## Known separate item (NOT part of the redesign)

- [ ] Three **developer-only** diagnostic strings still contain em dashes and are
      **not** user-facing (optional cleanup, own PR if desired):
      `PaywallModal.tsx:112` (console.error), `paddle.ts:8` (thrown Error),
      `apiConfig.ts:12` (console.error).

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
