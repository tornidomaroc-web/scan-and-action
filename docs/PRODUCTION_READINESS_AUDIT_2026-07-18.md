# Production-Readiness Audit — Scan & Action

**Audited from:** `main` @ `939d4fdbeb6deaaffa8db453577303a8a7803180`
**Date:** 2026-07-18 · **Mode:** read-only assessment (no code, DB, or migration touched)
**Method:** seven parallel source investigations, then the load-bearing BLOCKING claims re-verified
by hand against the bytes (`file:line` cited). Where a claim depends on live runtime/infra it is
marked **unverified** rather than guessed.

> Framing that matters for every verdict below: **native users cannot pay.** The Android app Google
> is reviewing enforces silent billing — the paywall shows "coming soon", no price, no checkout
> (verified READY, §4). So the *paying* user is a **web** user. "Sign up → scan → hit limits → pay"
> spans both surfaces: scanning/limits/deletion on both, payment on web only.

---

## Verdicts at a glance

| Area | Verdict |
|---|---|
| 1. Revenue path (checkout, webhook, entitlement) | **Mostly READY — 2 BLOCKING gaps** (pricing drift; missed-webhook stranding) |
| 2. Auth & account lifecycle | **BLOCKING** (account-deletion FK; forgot-password dead button) |
| 3. Core function (upload→extract→result) | **BLOCKING** (multi-doc dead-end) + edge-case gaps |
| 4. Native silent-billing / anti-steering | **READY** |
| 5. i18n / RTL | **BLOCKING for an Arabic-first user** (core-flow English leaks) |
| 6. Security & data | **READY** (2 DEFER-OK hardening items) |
| 7. Operational | **BLOCKING** (unapplied-migration risk; no crash visibility) |

---

## 1. Revenue path

**Checkout, webhook hardening, and entitlement are genuinely solid** (two investigators independently
corroborated the webhook). Trigger → env price IDs (`PaywallModal.tsx:21-22`) → `Checkout.open` with
`customData.userId` (`:121`, fail-closed if no user) → Paddle webhook `POST /api/webhook/paddle`
(`app.ts:33`, raw-body **before** `express.json`) → HMAC-SHA256 with `timingSafeEqual` + 5-min replay
window + DB idempotency keyed `paddle:<event_id>` with claim-release-on-error → `applyEntitlementChange`
under a `SELECT … FOR UPDATE` org lock → `derivePlan` (`planOverride` is a raise-only floor). FREE cap
(`scanCount>=10`→403) and PRO daily cap (429) enforced backend-side. **These sub-areas: READY.**

**BLOCKING — pricing drift + consumer-protection + unlocalised.** *(byte-verified)*
`$9`/`$59` are hardcoded in JSX — `PaywallModal.tsx:194,211,248`, `LandingScreen.tsx:183` — and
**completely decoupled** from the charged amount, which is whatever the Paddle price behind
`VITE_PADDLE_PRICE_ID_*` says (`PaywallModal.tsx:110,121`). Nothing reads the price from Paddle; no
test ties displayed price to charged price (grep of tests for `$9`/`$59`: none). If the Paddle price
or the env price-ID changes, the UI keeps showing $9/$59 while charging something else — silent,
untested, a **displayed-price ≠ charged-price consumer-protection exposure**. Also **not localised**:
no price key in `strings.ts`, so every locale sees raw USD.

**BLOCKING (operational) — a paying customer can be silently stranded WITHOUT PRO.**
If Paddle never delivers the webhook (endpoint misconfig / outage past retry exhaustion), **nothing in
code detects a delivery that never arrived** — the only safety net is the manual
`scripts/backfillSubscriptions.ts` / `verifyEntitlement.ts`. A user pays, no webhook lands, they stay
FREE, and no alert fires.

**DEFER-OK:** refunds are log-only by design (`webhookController.ts` `adjustment.created` → Discord,
no auto-revoke); unknown `subscription.updated` status fails **open** to ACTIVE (deliberate "never
strand a payer", low likelihood, add a monitor).

**Unverified:** the actual Paddle dashboard price, the live env price-ID→price mapping, and whether the
webhook endpoint is registered correctly in Paddle — none determinable from source.

## 2. Auth & account lifecycle

Supabase email/password auth; backend validates every `/api/*` request via `supabase.auth.getUser`
(`authMiddleware.ts:126`, mounted globally `app.ts:50`); the two public routes (`/api/health`, the
signature-verified webhook) are intentional. Sign-in/session/refresh: **READY**. The reactive
`SIGNED_OUT` path handles dead refresh tokens; there is **no central 401 interceptor**, so a mid-session
401 that Supabase hasn't yet noticed surfaces as a generic error and the user sits on a dead session
until reload (**DEFER-OK**, real rough edge).

**BLOCKING — account deletion can fail for essentially every real user.** *(FK byte-verified;
runtime-unverified)*
> **STATUS 2026-07-20 — FIXED (code-only, Option A).** The deletion transaction now explicitly deletes
> `DocumentEntity` then `Entity` (scoped to the solo org) BEFORE the `Organization` delete, so success no
> longer depends on undocumented Postgres cascade-trigger ordering (`accountController.ts`, the
> `$transaction` at ~:99). No schema migration — deploys via the normal Railway path, avoiding the
> item #1 CI-migrate gap. Locked by a **real-Postgres** integration test
> (`accountController.integration.test.ts`) that seeds the full cascade fan-out incl. both RESTRICT edges
> (`DocumentEntity→Entity`, `QueryLog→User`), runs the real deletion, and asserts zero rows left + the
> 2-member `409` fail-safe. The test is **gated on `TEST_DATABASE_URL`** (skips in CI / normal local runs
> — no Postgres service container exists, see the operational structural-gap note), so it is run against a
> throwaway DB only; it refuses to run against a URL that looks like prod. Fix branch:
> `fix/account-deletion-restrict-edge`. Follow-up (optional, later, its own migration + your go-ahead):
> Option B — `onDelete: Cascade` on `DocumentEntity.entityId` as the cleaner long-term model.

Deletion relies on a single cascading `Organization` delete
(`accountController.ts:102`). But `DocumentEntity.entity` is **`ON DELETE RESTRICT`** —
`schema.prisma:185` (no `onDelete`) → emitted as `ON DELETE RESTRICT` at
`migrations/20260328193618_init/migration.sql:195`. When the org cascade deletes `Entity` rows, if
Postgres fires the `Entity` cascade before the `Document`→`DocumentEntity` cascade has cleared the
referencing rows, RESTRICT raises an immediate FK violation → the transaction rolls back → deletion
500s. Any solo account that has scanned ≥1 document with a resolved entity (i.e. nearly everyone) may
be **unable to delete their account** — a Google Play / Apple data-deletion **compliance** blocker and a
broken irreversible-safety feature. Needs a seeded-DB integration test; likely fix is
`onDelete: Cascade` on that relation or an explicit pre-delete of `DocumentEntity`/`Entity`.

**BLOCKING — "Forgot password" is a dead button.** *(byte-verified)* `AuthScreen.tsx` (~:162) renders
`<button type="button">…{s.authForgotPassword}</button>` with **no `onClick`, no handler, no
`resetPasswordForEmail` anywhere**. A returning user who forgets their password has **no recovery path**
and the UI advertises one that doesn't exist → account lockout.

The deletion design otherwise is excellent (type-to-confirm both ends, rate-limited, storage-before-DB
ordering, real Supabase-identity deletion, `409 SHARED_WORKSPACE` guard). Email-confirmation state is
thin (DEFER-OK).

## 3. Core function (upload → Gemini extraction → result)

Happy path is coherent: multipart upload → 10 MB/MIME-gated multer → FREE/PRO pre-checks → Supabase
storage → `PROCESSING` stub → **202 immediately** → `setImmediate` background extraction (Gemini
`gemini-flash-latest`) → persist facts/entities → tray polls every 3 s. **READY.**

**BLOCKING — the multi-doc `NEEDS_REVIEW` flow is a dead end.** *(byte-verified)* When
`isSingleDocument===false`, `markAsNeedsReview` (`persistence.ts:312`) only sets `status` + `processedAt`
— it's literally labeled an "Emergency fallback." The stub keeps zero facts, zero entities,
`UNKNOWN`/0-confidence. The user sees a red 0%-confidence row with **no explanation** ("multiple
documents" lives only in server logs), **no remediation** (no re-scan/split), and the only actions are
Reject or **Approve-to-empty** (silently commits a blank record). The flagship multi-doc detection
produces something the user can neither understand nor fix.

**Edge-case gaps (moderate):**
- **Client/backend `accept` mismatch:** backend allows `image/webp` but `UploadModal.tsx:288` omits it;
  `CaptureSheet.tsx` accepts `image/*` (HEIC/GIF) that the backend rejects with 415 → an iPhone HEIC
  passes the picker and fails server-side. **No client-side size guard** (10 MB is backend-only).
- **Errors collapse to generic:** `translateUploadError` maps only `LIMIT_REACHED`/`DAILY_LIMIT_REACHED`;
  415, too-large, network drop, 500 all show `uploadFailedGeneric` — "too big" is indistinguishable
  from "broke."
- **Extraction failure is relabeled NEEDS_REVIEW, not FAILED** (`geminiAdapter` catches internally and
  returns empty) — the product can't tell "broke" from "low quality."
- **Silent `LIMIT_REACHED` orphan doc:** a doc set to status `LIMIT_REACHED` shows no tray toast and is
  excluded from queue/recent — a Gemini spend with zero user-visible outcome.

**Cost / abuse — DEFER-OK with caveat.** *(byte-verified)* Each upload = **2–3 paid Gemini calls**
(1× `isSingleDocument` always + 1–2× extract retry). The FREE cap is a **TOCTOU**: an advisory read at
`uploadController.ts:33` at request start, but the authoritative atomic increment
(`persistence.ts:148-159`) runs **after** the Gemini calls. So a FREE org entitled to 10 scans can drive
many more paid calls concurrently; spend is bounded only by the **in-memory, single-instance** rate
limiters (per-IP 60/15m, per-org 120/h) — which reset on deploy and won't hold across instances. Fine
for a cheap-flash single-instance launch; **make the quota a hard pre-increment reservation before any
scale-up or multi-instance deploy.**

## 4. Native silent-billing / anti-steering — READY

Every sell surface sits behind `isNativePlatform()` (`shell.ts:14` → `Capacitor.isNativePlatform()`),
which is **reliable** because the app ships bundled `dist/` with **no `server.url`** in
`capacitor.config.ts` — the bridge is always injected, so it returns `true` on Android deterministically;
the only false-negative is total Capacitor-runtime failure, which breaks the whole app rather than
leaking a price. All six sell-surface gates (LandingRoute redirect `App.tsx:36`, PaywallModal `:49`,
Settings billing card, the two upload guards, CaptureSheet limit) take the native branch to a neutral
status; PaywallModal double-backstops even if opened; the `/` redirect covers signed-in **and**
signed-out incl. the catch-all; legal pages carry no price/CTA; `translateUploadError` never passes the
backend's "upgrade to PRO" prose through. Locked by `nativeAntiSteering.test.tsx`. Back-dismiss/overlay
stack and icon/splash fixes are in; no native dead-end found. **No price/CTA/steer reaches a native
user through any traced path.**

## 5. i18n / RTL

Infrastructure is solid: full en/fr/ar key parity (enforced `renderScreens.test.tsx:167-171`), strong
`dir="auto"`/`<bdi>`/logical-property discipline, and the #105/#106 Arabic meta/scrim fixes are in. The
gap is **coverage at specific call sites on the core scan flow** — several with a translation key that
already exists but is bypassed by an English literal.

**BLOCKING for an Arabic-first paying user (hit on the core flow):**
- `ProcessingContext.tsx:94,96,98` — the per-document completion toasts ("… processed successfully / needs
  review / could not be processed") — fire on **every scan**.
- `CaptureSheet.tsx:90` — native success toast "Uploaded. Processing in background…" (native = the
  approved app).
- `UploadModal.tsx` — `Start Extraction` (`:439`), `Cancel` (`:433`), success/partial toasts (`:197,201`),
  the success panel `Uploaded`/body/`Done`/`Manage Files` (`:388-420`), and the subtitle `:238` which has
  an existing key `selectFilesDesc` it fails to use (**wiring regression**).
- `Sidebar.tsx:107` — "New Scan" (desktop web; `s.newScan` exists, unused).

**Arabic pluralization:** `UploadModal.tsx:197` `document${totalCount>1?'s':''}` — the only hand-rolled
plural, doubly wrong for Arabic (English + boolean can't express zero/one/two/few/many/other). Needs
count/ICU keys.

**DEFER-OK:** PaywallModal web branch + the whole `LandingScreen` are English (web-only surfaces; the
native paywall is already translated); PaywallModal's close button is `right-2` in the native
coming-soon branch (`:71`) — a minor RTL cosmetic (X on the wrong side in Arabic).

## 6. Security & data — READY

No BLOCKING issues. Every `/api/*` data route is org-scoped (`findFirst({ where:{ id, organizationId }}}`
across `documentController`, `queryExecutor.ts:30` baseWhere, etc.) — **no IDOR found**. No hardcoded
secrets committed (repo scan → only `.env.example` + lockfile hashes); `.env` gitignored; the client
bundle carries only public-by-design vars (anon key, Paddle public token/price IDs), **not** the
service-role key. Uploads go to a service-role Supabase bucket, read only via 10-min signed URLs minted
after the org-ownership check. Webhook HMAC-hardened; CORS is an explicit allowlist (no wildcard); the
two raw SQL queries are parameterized; no `dangerouslySetInnerHTML`; error handler returns a generic
message + correlation id in prod.

**DEFER-OK (hardening):** (a) document **contents are logged** — merchant/amount/date at
`geminiAdapter.ts:156-166`, receipt anchors at `persistence.ts:70-74` — financial PII in host logs;
trim or debug-gate. (b) **Unverified:** whether the Supabase `documents` bucket is set Private (storage
paths are guessable and not org-scoped in the path; code path is correct, but confirm the bucket has no
public policy).

## 7. Operational

**BLOCKING — merged-but-unapplied migration risk (this is the highest-impact item in the audit).**
*(read/write byte-verified; live-apply status unverified)*
> **STATUS 2026-07-20 — split into (instance) + (structural).**
> - **Instance CLEARED:** migration #7 (`Entity.displayName`) is **verified applied to prod** — a live
>   read-only `prisma migrate status` reported "Database schema is up to date!" and the column physically
>   exists (`text`, nullable), with a real `finished_at` (not resolve-marked). Evidence:
>   `docs/PROD_MIGRATION_STATUS_CHECK_2026-07-19.md`. (One residual: confirm the checked project-ref is
>   byte-identical to Railway's `DATABASE_URL` — see that doc's Caveat.)
> - **Structural gap STILL OPEN (own future item):** CI *still* never runs `prisma migrate deploy`, so a
>   **future** migration can merge + deploy while unapplied — the next migration is the next chance for
>   this exact outage. Tracked as its own item in the prioritized list below; **not** fixed by the #2
>   account-deletion work (which was deliberately code-only, no migration, to avoid depending on this gap).

CI never runs `prisma migrate deploy`
(`ci.yml` = `npm ci / tsc / test / build`; `build` = `prisma generate && tsc`, which never touches the
DB); backend auto-deploys to Railway on push. So a migration can merge + deploy while **never applied to
the production Supabase DB** (matches the standing project fact that migrations lag prod). The **latest**
migration `20260709120000_add_entity_display_name` is no longer dormant: code now **writes**
`Entity.displayName` (`entityResolution.ts:55`) and **reads** it (`documentDto.ts:30,33,50`) — yet the
migration's own header still says "Nothing reads or writes displayName yet." Prisma selects all scalar
fields by default, so **if #7 is unapplied to prod, every entity create and every document-detail read
500s** — core product down for all users. Verify `migrate status` against prod immediately, and add a
`migrate deploy` gate to the deploy path.

**BLOCKING — no crash visibility.** *(byte-verified: repo-wide grep for sentry/ErrorBoundary/
captureException/window.onerror/uncaughtException → zero matches)* No error-tracking SDK, no React
ErrorBoundary, no `process.on('uncaughtException'|'unhandledRejection')`. A frontend render exception =
silent white screen, nobody notified. A backend 500 has clean handling (`errorHandler.ts`, correlation
id) but is visible **only if a human is tailing Railway logs**; the Discord alert is wired to the
**billing path only**. And logs contain **email PII** (`authMiddleware.ts:142`, `webhookController.ts`) —
a GDPR exposure for an EU-facing product. At minimum: add a frontend ErrorBoundary + a reporter on both
ends, and scrub email from logs.

**DEFER-OK — backend `dist/`-twin test gap (#103):** CI is sound (`npm test` runs before `npm run build`
on a fresh checkout, so vitest sees only `src` tests). It does **not** hide real failures — only produces
phantom `dist/` failures locally, so the full suite can't run green locally without `rm -rf dist`.
Backend confidence therefore rests entirely on CI (which works). One-PR fix on record (tsconfig
`exclude` + vitest `dist/**` exclude), not applied; secondary defect (tests shipped into `dist/`) stands.

**Build/deploy READY (single-instance), contingent on unverified Railway env:** `NODE_ENV=production`
(else stacks leak to clients via `errorHandler.ts:4`), `ALLOWED_ORIGINS` set (else CORS falls to
defaults), and the platform healthcheck pointed at the existing `GET /api/health`. In-memory rate
limiters won't survive horizontal scale-out.

---

## Prioritized verdict

### 🔴 BLOCKING before real paying users (ranked, most critical first)

1. **Unapplied-migration risk — `displayName` (#7).** ✅ **CLEARED 2026-07-20** — verified applied to
   prod (`PROD_MIGRATION_STATUS_CHECK_2026-07-19.md`); column exists, all 7 migrations applied. The
   *structural* half (no `migrate deploy` in CI) is now tracked separately as item 9 below.
2. **Account deletion may fail (RESTRICT FK).** ✅ **FIXED 2026-07-20** (branch
   `fix/account-deletion-restrict-edge`) — code-only ordered deletes (explicit `DocumentEntity`→`Entity`
   before the org cascade), locked by a gated real-Postgres integration test. No migration.
3. **No crash visibility + email PII in logs.** A production failure for paying users would be invisible;
   emails in logs are a GDPR exposure. Add ErrorBoundary + reporter (both ends) and scrub PII.
4. **Pricing drift / consumer-protection (web).** Displayed $9/$59 is decoupled from the charged Paddle
   price with no test and no localisation. Render price from Paddle (or assert displayed==charged), and
   localise — before taking web payments.
5. **Missed-webhook stranding.** A paying user can silently stay FREE with no detection. Add proactive
   reconciliation/alerting, not just manual backfill scripts.
6. **Multi-doc `NEEDS_REVIEW` dead-end.** The flagship detection yields an unexplained, un-fixable,
   approve-to-empty record. At minimum surface the reason + block approve-to-empty.
7. **Arabic core-flow English leaks + hand-rolled plural.** Completion toasts (every scan), upload CTA,
   success toasts are hardcoded English; wire the existing keys and add count/ICU plural keys before an
   Arabic-facing launch.
8. **Forgot-password dead button.** Returning users who forget their password are locked out. Wire
   `resetPasswordForEmail` or remove the affordance.
9. **Structural: CI never runs `prisma migrate deploy`** *(split out from item 1 on 2026-07-20; still
   open)*. The #7 instance is applied, but the process gap remains: any **future** migration can merge +
   auto-deploy to Railway while never applied to prod → the same class of outage. Add a gated
   `migrate deploy` step to the deploy path (or a pre-deploy `migrate status` check that blocks on drift).
   Until then, every migration must be hand-applied and verified — see the standing project note.

### 🟡 DEFER-OK (real, survivable at a single-instance launch)

- FREE-quota TOCTOU (bounded by rate limiters + cheap flash; make it a hard reservation before scale).
- Client/backend `accept` mismatch (HEIC 415) + generic-only error messages + no client size guard.
- Silent `LIMIT_REACHED` orphan doc.
- 401 mid-session (no interceptor; reactive `SIGNED_OUT` covers the common case).
- Refund auto-revoke (manual by design) + fail-open unknown webhook status (add a monitor).
- Document-content logging; confirm Supabase bucket is Private (infra).
- `dist/`-twin local test gap (CI sound); tests shipped into `dist/`.
- In-memory rate limiters won't survive multi-instance; verify Railway `NODE_ENV`/`ALLOWED_ORIGINS`/
  healthcheck.
- PaywallModal web-branch + LandingScreen full i18n; PaywallModal RTL close-button side.

### Is it production-ready for paying users?

**No.** The native app's silent-billing story is genuinely solid and security is clean, but a first
real user can hit a fully-broken core (if migration #7 is unapplied), can't delete their account, pays
against a price the app can't prove it charged, and any crash that results would be invisible to you —
**the shortest path to "yes" is items 1–5 above** (verify+gate migrations, fix+test account deletion,
add crash/PII-safe monitoring, tie displayed price to the charged price, detect missed webhooks), with
items 6–8 as fast-follows before an Arabic-first push.

---

### Verification note

Load-bearing BLOCKING claims were re-checked against source by the auditor (not taken from the
investigation alone): the pricing hardcodes, the `ON DELETE RESTRICT` FK + org-cascade-only deletion,
the `displayName` read/write vs the latest migration, the absence of any error-tracking, the multi-doc
`markAsNeedsReview` body, the FREE-quota TOCTOU ordering, and the forgot-password dead button. Items
labelled **unverified** require live DB/infra access (prod `migrate status`, Postgres cascade ordering,
Paddle dashboard, Supabase bucket privacy, Railway env) and were deliberately not tested, per the
read-only mandate.
