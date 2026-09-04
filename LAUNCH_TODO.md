# Scan & Action — Store Launch Tracker

> Living checklist for the Google Play / Apple App Store launch. Tick items off as
> they're completed. Keep this up to date across sessions so deferred steps are never lost.

## CURRENT STATE (verified against Google Play Console 2026-06-25)

- App is **SUBMITTED** and the closed-testing release is **APPROVED & published**. Track: **Closed testing - Alpha**. All "set up your app" tasks are complete (see bottom section).
- **Closed-testing clock IS RUNNING.** Play Console's "Apply for production" criteria show:
  1. Publish a closed testing release — **DONE**.
  2. Have at least 12 testers opted in — **DONE** (12 testers opted in).
  3. Run the closed test with ≥12 testers for ≥14 days — **IN PROGRESS**: dashboard reads *"12 testers have currently been opted in for 5 days continuously"* → **~9 days remain** as of 2026-06-25.
- **Path to production is now just time:** keep ≥12 testers opted in continuously for the remaining ~9 days, then "Apply for production" unlocks. **No engineering blocks this.** The only risk is testers dropping below 12 (which can reset the continuity counter), so monitor the opted-in count.
- Review/test account `unicornapps.support@gmail.com` holds **PRO via `Organization.planOverride`** (verified live, SAFE — see CLEANUP item; reset to `null` post-production-review).
- **NOTE (history corrected):** earlier versions of this file said the "clock has NOT started," "still completing setup tasks," and carried tester-vendor ambiguity (Touseef Ijaz/Standard vs Grayo/Premium). Those notes were **STALE** — superseded by the verified dashboard state above. Whatever the original tester-sourcing vendor, the dashboard now confirms 12 testers opted in and the 14-day clock running.

## INVARIANT — Android (native) anti-steering (do NOT violate)

The Android (native) build must **never** contain pricing, external-payment links, or any
copy/CTA that steers the user toward paying for PRO outside the app. **Reflect entitlement
state only** (e.g. "Pro Active", "Free Tier", the free scan limit as information). A mention
of "Pro" is fine; an active *sell* is not. Subscriptions are sold **only** on the web (Paddle),
because the Morocco-based developer account cannot register as a Google Play merchant.

- The `isNativePlatform()` gate in `PaywallModal.tsx` (web checkout/prices render only when it
  is false) is the single most important guard — **keep it intact**.
- The Settings billing card, and the scan-limit / multi-doc triggers in `CaptureSheet.tsx` and
  `UploadModal.tsx`, are native-gated to show neutral status (no "Go PRO" CTA, no paywall) —
  see strings `freePlanLimitReached` / `freePlanSingleDoc` / `proAutoUnlock`.
- Any future UI change to the native build **must preserve this invariant.** When adding a Pro/
  upgrade surface, gate it behind `!isNativePlatform()`.
- Note (web-only, low risk): `/privacy` and `/refund` legal routes mention subscription
  cancellation/refund and Paddle; they are **not linked from any in-app surface** so they are
  unreachable in the native UI. Revisit their copy if they are ever linked from inside the app.

## Current status (as of this session)

- Android app is live via Capacitor. Package: `com.scanaction.app`. versionCode 1, versionName 1.0.
- Signed release AAB built and uploaded to the **"Closed testing - Alpha"** track in Google Play Console. Play App Signing accepted (Google holds the app signing key; our upload key is at `D:\keys\scan-action-upload.jks` with `key.properties` untracked/gitignored).
- Already merged to `main` and deployed:
  - Paddle checkout hidden on native (neutral "Pro coming soon" placeholder).
  - Native app opens on login screen with no logged-out pricing.
  - In-app account deletion (`DELETE /api/account`) + public `/delete-account` web page.
  - Account-deletion privacy section.
- The **14-day closed-testing clock IS RUNNING** — all Play Console "set up your app" tasks are complete and 12 testers are opted in (dashboard: "12 testers opted in for 5 days continuously"). **~9 days remain (~Jul 4 2026).** See CURRENT STATE for the verified detail.
- Review account: `unicornapps.support@gmail.com` holds PRO via **`Organization.planOverride = PRO`** (NOT bare `Organization.plan`), with **no Paddle/billing subscription** backing it, so the Google reviewer sees Pro features. This is **structurally protected**: `applyEntitlementChange` never writes `planOverride`, and `derivePlan` treats it as a floor — so no billing event or plan recompute can downgrade it. **Verified against the live DB** (2026-06-25): `planOverride = PRO`, `plan = PRO` (the cached derivation), zero `Subscription` rows. (The earlier note that this was "set on `Organization.plan` directly" was inaccurate — it's on `planOverride`, the safe place; no fix needed.)

## Completed (this session — email / transactional system + tester-signup unblock)

All merged to `main` and deployed unless noted. The welcome email is built but **gated OFF**.

- **PR4a (#31):** standalone, fail-safe Resend REST mailer (`apps/backend/src/services/email/mailer.ts`) — never throws, typed `SendResult`, header-injection guards, compliance footer + List-Unsubscribe.
- **PR4b (#32):** one-time welcome email on first-user provisioning + `User.welcomeEmailSentAt` column (atomic claim-then-send so the provisioning race can't double-send). Migration applied live (expand-then-deploy).
- **PR #33:** `WELCOME_EMAIL_ENABLED` kill switch, **default OFF** — welcome emails are currently held (no send) until the compliance placeholders are real (see Open engineering items).
- **Tester-signup blocker fixed (Supabase config, not code):** root cause was **Supabase's built-in email service rate limit (~2/hour)**, which capped concurrent tester signups (testers reported "only 2 users at a time can create an account"). Fix = **Resend custom SMTP** in Supabase Auth (`smtp.resend.com:465`, user `resend`, password = the scan-action.com Resend key, sender `noreply@scan-action.com`) + **raised the Supabase Auth email-sending rate limit** (was 30/hour). Email confirmation kept **ON**.
- **Confirmation-link "site can't be reached" fixed (Supabase config):** **Site URL was `http://localhost:3000`** (unreachable on a tester's phone); set to **`https://www.scan-action.com`** and added `https://www.scan-action.com/**` to the Redirect URLs allowlist. Verified end-to-end (confirmation completes; login works).
- **PR #34:** corrected the mailer sender from the **unverified `send.scan-action.com` subdomain** to the **verified apex `scan-action.com`** (code default, unsubscribe mailto domain, `.env.example`, tests). Empirically proven: apex accepted by Resend (HTTP 200, delivered); subdomain rejected (HTTP 403). Railway `MAIL_FROM` updated + deployed to the apex.

## Phase map (reconciled)

Earlier labels in this file were inconsistent (AdMob tagged "Phase C", RevenueCat "Phase B"). Actual state:

- **Phase B — Paddle billing + entitlement backend: DONE.** Per-source `Subscription` rows, the pure `derivePlan`, and `applyEntitlementChange` (row-lock + out-of-order guard + the never-writes-`planOverride` invariant), with the Paddle webhook wired onto them.
- **Phase C — native anti-steering: DONE** (see the invariant section above) **+ email / transactional system: DONE this session.**
- **AdMob ads: DEFERRED** (not a numbered phase).
- **RevenueCat native IAP: DORMANT / FUTURE** (iOS-driven; see the deferred item). Web subscriptions remain **Paddle-only** because the Morocco-based developer account cannot register as a Google Play merchant.

## DEFERRED — to build/do DURING or AFTER the 14-day clock (before applying for production)

- [ ] **ADS (deferred — not a numbered phase):** integrate AdMob. Show ads to FREE users only; PRO removes ads. iOS needs UMP consent + ATT (App Tracking Transparency). After building, you **MUST** update Play Console: flip the "Ads" declaration from No to Yes, and update the Data Safety form and Content rating to match.
- [ ] **REAL IN-APP PURCHASE (RevenueCat — future / dormant, iOS-driven):** integrate RevenueCat for native subscriptions. It must **NOT** write `Organization.plan` directly — it must go through the shared entitlement service **`applyEntitlementChange`** (`apps/backend/src/services/entitlement/`), the SAME path the Paddle webhook already uses, which enforces a row-lock (`SELECT … FOR UPDATE`), an out-of-order event guard, and the invariant that it **never writes `planOverride`** (this is what protects ENTERPRISE deals and the review account from being clobbered by any billing event). Set RevenueCat `app_user_id = Supabase user.id`. Add a separate RevenueCat webhook endpoint with its own signature verification, and map each event to a per-source **ACTIVE/INACTIVE status** (never directly to a plan):
  - `INITIAL_PURCHASE` / `RENEWAL` / `PRODUCT_CHANGE` → **ACTIVE** (derives PRO).
  - `CANCELLATION` → auto-renew turned OFF **only**; access **CONTINUES until period end → stay ACTIVE/PRO**. **Do NOT map CANCELLATION to FREE.**
  - `EXPIRATION` → the real end of entitlement → **INACTIVE** (derives FREE). **This is the actual downgrade point**, not cancellation.
  - `BILLING_ISSUE` / grace / dunning → **stay ACTIVE/PRO** (do NOT yank access mid-dunning). `grace → ACTIVE` is the confirmed product rule per `derivePlan.ts`.
  Multi-source precedence is **already handled**: `derivePlan` = `max(planOverride floor, PRO if ANY source ACTIVE else FREE)`, so Paddle (web) and RevenueCat (mobile) coexist as independent `Subscription` rows and cannot fight over one field. Remove the "Pro coming soon" placeholder once real IAP works.
  - ⚠️ The earlier mapping in this file (`CANCELLATION`/`EXPIRATION`/`BILLING_ISSUE` → FREE) was **wrong and revenue-damaging** — it would have cut off paying users the moment they toggled auto-renew off or hit a transient billing hiccup. Corrected above to match the code.
- [ ] **DATA SAFETY form (Play) + Apple Privacy Labels (iOS):** complete truthfully. Disclose Google Gemini, Supabase, RevenueCat (when added), AdMob (when added), and **Resend**. **Email reality (corrected):** the backend sends transactional email through **Resend** (REST API) via `apps/backend/src/services/email/mailer.ts`, and **Supabase Auth emails are routed through Resend custom SMTP**. The verified sending domain is the apex **scan-action.com**, sending as **noreply@scan-action.com**. (The earlier note here — "investigation found NO Resend in the codebase; email appears to be Supabase Auth's built-in mailer" — was **false** and is removed.) Because recipient email addresses are shared with Resend (a US email processor), the Data Safety form must disclose this.
- [ ] **LOGO / BRANDING:** design a professional, premium logo and a single consistent app icon + splash screen (current ones are placeholder/inconsistent). Upload as an app update during the 14-day window (closed-testing updates do NOT reset the clock).
- [ ] **SUPPORT EMAIL:** verify `support@scan-action.com` is active and monitored (it's referenced in the privacy policy and the `/delete-account` page).
- [ ] **REVIEW ACCOUNT CLEANUP:** revert `unicornapps.support@gmail.com` to FREE after the **production** review completes (the closed-testing review is already approved; production review is later). It is granted via **`Organization.planOverride = PRO`**, NOT bare `Organization.plan`: the entitlement service treats `planOverride` as a floor and **never writes it** (`applyEntitlementChange.ts` invariant), so no billing/downgrade event can clobber it. **VERIFIED (2026-06-25, live DB):** confirmed on `planOverride = PRO` with zero `Subscription` rows — **SAFE**, no fix needed. **Only remaining action — reset post-production-review:** set `planOverride = null` (it then derives FREE, since the account has no billing source). Stays pending and tied to the Play production-review timeline.
- [ ] **iOS / APPLE APP STORE (entire track, later):** requires a Mac + Xcode (founder is on Windows + iPhone, no Mac yet — decide Mac mini vs cloud build like Codemagic). Also: Apple Developer Program enrollment ($99/yr, individual), Apple Small Business Program (15% tier, must apply), App Store IAP via RevenueCat, ATT, Apple Privacy Labels. Account deletion is already cross-platform (works on iOS too).
- [ ] **targetSdk:** currently 35 (meets Play's current minimum for new apps). May need a bump to 36 around Aug 2026 if Play warns at upload — bump `compileSdk`/`targetSdk` in `apps/frontend/android/variables.gradle` and rebuild.
- [ ] **APPLY FOR PRODUCTION:** only after the closed test has run 14 days with 12+ opted-in testers (testers via Grayo on Fiverr, Premium plan, testers create their own in-app accounts, India required as a target country). Coordinate with Grayo — they provide the production-access questionnaire answers; do NOT apply independently.
- [ ] **GEMINI BILLING TIER:** The app currently uses a Gemini API key on the FREE tier ("Niveau sans frais", even though a billing account is linked). On the free tier, Google may use submitted content to improve its products — which is why the Play Data Safety form was filled in declaring document data as SHARED with Google. ACTION (later, when usage/users grow): upgrade to the genuine PAID Gemini tier so customer document content is NOT used for training. This strengthens customer privacy/trust and lets us potentially update the Data Safety "Shared" disclosure. Reference: https://ai.google.dev/gemini-api/terms
- [ ] **PHOTO PERMISSION FALLBACK:** The app uses `READ_MEDIA_IMAGES` and we filled Google's "Photo and video permissions" declaration (justified as: users upload existing receipt/invoice/document photos from their gallery for the core scanning feature). **RISK:** Google's photo/video policy is strict and may reject this since the app's image access is on-demand (per upload) rather than broad/continuous. **FALLBACK if rejected:** migrate from `READ_MEDIA_IMAGES` to the Android **Photo Picker** (`PickVisualMedia` / `ACTION_PICK` via the system photo picker), which needs no broad storage permission and removes this declaration requirement entirely. This is a clean technical fix. Implement only if the reviewer flags it.
- [ ] **MONITOR TESTER OPT-INS (clock running — ~9 days left as of 2026-06-25):** Keep the "testers currently opted-in" counter at **≥12** continuously; if it drops below 12 the 14-day continuity counter can reset. Watch `unicornapps.support@gmail.com` for tester feedback and any Google emails.
- [ ] **AFTER THE 14-DAY CLOCK COMPLETES (~Jul 4 2026):** "Apply for production" unlocks; answer Google's questionnaire about the closed test (coordinate with the tester vendor for feedback/notes). Then complete the post-production-review items (review-account reset, etc.).

## Open engineering items (from the email / monetization workstream)

- [ ] **Welcome email — enable when ready (currently gated OFF):** `WELCOME_EMAIL_ENABLED` stays OFF until two compliance placeholders are real:
  - **POSTAL_ADDRESS** in `mailer.ts` (currently the `[Your Company Name], …` placeholder) — a real physical mailing address required by CAN-SPAM. **Founder decision** (a privacy choice, not an engineering call).
  - **Unsubscribe inbox** `unsubscribe@scan-action.com` must actually receive mail (no inbox today). Cheapest fix: **Cloudflare Email Routing** (free) on the apex domain — which can forward `unsubscribe@`, `support@` (see the SUPPORT EMAIL item — same setup), and any reply address in one configuration.
  Once both are real, flip `WELCOME_EMAIL_ENABLED=true` in Railway.
- [ ] **Re-engagement (reminder) emails — POST-LAUNCH:** the script `apps/backend/scripts/send_reminders.js` is currently **QUARANTINED** — a DO-NOT-RUN header + a hard runtime guard make it a no-op that exits unless `ALLOW_SEND_REMINDERS=true` (done in PR #37). Not needed during closed testing; it would misdeliver today (Resend **sandbox** sender `onboarding@resend.dev` + dead `https://scan-and-action.vercel.app/queue` link), and it is dormant (not wired to any cron). Before enabling this feature: (1) route sending through the real mailer / verified **apex sender `noreply@scan-action.com`** instead of the sandbox `onboarding@resend.dev`; (2) fix the dead queue link to `https://www.scan-action.com/...`; (3) remove/relax the quarantine guard; and (4) confirm it's intentionally wired to a scheduler. **Revisit once there's a real returning-user base to re-engage.**
- [ ] **authMiddleware provisioning-race hardening (latent bug):** two concurrent first-time requests for the SAME user can both enter the zero-memberships branch; the loser hits a unique-constraint **P2002** on `organization.create`, which currently bubbles to the generic `catch` → a spurious **401**. This was **NOT** the tester-signup symptom, and it's now rare (email confirmation serializes a user's first login), but harden before production scale: catch P2002 and treat it as "already provisioned" (re-read memberships and continue) instead of 401. Keep the deterministic `workspace-<uuid8>` slug.

- [ ] **UI, LOW PRIORITY — the tray chip says "Processing complete" for a document that needs review:** `ProcessingTray.tsx:37-38` renders `processingDone` whenever `processingCount` reaches zero, and that string is the literal **"Processing complete"** (`strings.ts:21`). It is shown for *any* settled status, `NEEDS_REVIEW` included — so the chip can read "Processing complete" while the row beside it carries the amber `NEEDS_REVIEW` icon. **Both statements are true in the product's own terms** (processing did complete; the verdict is "a human should look"), which is exactly why this is a wording item and not a defect. **A real user hit it on 2026-09-04, on the first real photograph the product has ever processed** — the operator read the chip, reported the document as processed, and only the icon in the screenshot said otherwise. Worth a settled-state-aware label; not worth blocking anything.
- [ ] **BACKEND, LOW PRIORITY — `persistIngestionResult` re-writes the document status once per low-confidence fact:** at `persistence.ts:230-235` the per-fact branch issues `tx.document.update({status:'NEEDS_REVIEW'})` but never assigns its local `documentStatus`, so its own guard `documentStatus !== 'NEEDS_REVIEW'` stays true and it repeats the write for **every** remaining low-confidence fact inside one transaction. The sibling path at `persistence.ts:102-107` shows the correct shape — it assigns the variable, so it writes once. **Caveats that keep this low:** `persistIngestionResult` has **zero callers** (it is dead code), it is **not on the upload path** — `processUploadAsync` calls `updateDocumentWithExtraction`, the sibling — and it is therefore **not a suspect for the 2026-09-04 processing delay**. Fix it or delete the function; either closes it.
- [ ] **BACKEND, LOW PRIORITY — `authMiddleware` write amplification: a row write, and sometimes two, on every authenticated request:** `ensureUser` (`authMiddleware.ts:86-137`) issues `prisma.user.upsert` with `update: { email }` on **every** `/api/*` request, because the middleware is mounted on the prefix (`app.ts:92`). For the overwhelming majority of requests the value written is the value already stored, so this is a wasted row write per API call through the pooler. **Two things this is NOT.** It is not a correctness risk: rewriting a unique column to the value it already holds cannot violate the constraint, since the only index entry in the way is the row's own — so this is not the update-path lockout guard and must not be conflated with it. And it is not a suspect for the 2026-09-04 processing delay, which is backend-side of the upload, not auth. **Second, separate half:** `expenseRoutes.ts:9` mounts `authMiddleware` a SECOND time on `GET /summary`, inside a router already behind the global mount — so that one endpoint runs `supabase.auth.getUser` and `ensureUser` **twice per request**, doubling both the Supabase round trip and the row write. Removing the redundant mount is free. **Filed as amplification, not as a guard.** The fix shape is a conditional write (compare before updating) plus deleting the duplicate mount; measure before assuming it matters.
- [ ] **BACKEND — the ingestion path emits no DURATIONS, which is why the 2026-09-04 delay is unanswerable:** every line in `processUploadAsync` (`ingestionService.ts:38-102`) is a *marker* — "Starting validation and extraction", "Attempt N/2", "Persisting...", "Workflow complete" — and not one carries elapsed time. Railway timestamps them, so the deltas live in a log that may or may not survive its deployment; nothing in the application records them. **This is an inconsistency, not a new idea:** `queryExecutor.ts:17` and `:165` already do exactly this with `startTime` / `executionTimeMs`. The ingestion path is the outlier. **Why this is worth doing and "investigate the delay" is not:** 2026-09-04 has no cause, no measured magnitude, no baseline and no reproduction, so a delay ticket could be neither worked nor closed — but a `Date.now()` at entry plus a per-stage delta costs nothing at runtime, logs no document content, needs no second data point to justify, and turns the *next* occurrence from an argument into a number. It would also settle 2-vs-3 Gemini calls, which the amber icon alone cannot: `NEEDS_REVIEW` proves final confidence was under `persistence.ts:8`'s 0.98, not whether it was under the 0.6 that triggers the retry at `ingestionService.ts:55-77`.
- [ ] **CURIOSITY, NO LIVE CONSEQUENCE — settle whether the 2026-09-04 upload was the camera original or the canvas re-encode:** the Railway log recorded 2,585,128 bytes for document `c176c0d5-0f55-40d2-bccb-ed5dc6cfc76e` — an ordinary 12MP phone JPEG, consistent with **both** a camera original and a full-resolution `canvas.toBlob(..., 0.95)` re-encode of one. Neither the log nor the code can separate them: `imagePreprocess.ts` preserves `file.type` and `file.name`, the filename is deliberately not logged (`ingestionService.ts:34-37`), and the only differing field, `lastModified`, is never transmitted. **The stored object can**, and it still exists — fetch that document's `fileUrl` and read the first bytes: a camera original carries an **APP1 `Exif` segment** (`FF E1`), while `canvas.toBlob` emits a bare Chromium-encoder JPEG with no EXIF, no maker note and no ICC. Presence means the original was uploaded, so the 2-second timeout at `imagePreprocess.ts:14` fired; absence means the re-encode ran. **Deliberately ranked below the durations item:** it identifies which file was uploaded but cannot recover the original's size, so it quantifies nothing and prevents no repeat. Do it only when idle.
- [x] **DONE 2026-09-04 — parked the address held by orphan app row `1e1c8482`, unblocking one locked-out user:** a real user re-registered on 2026-08-24 at an address a surviving `public."User"` row still held, and `User.email` is `@unique` NOT NULL — so `ensureUser` refused, and because `authMiddleware` is mounted on the `/api` prefix (`app.ts:92`) **every** authenticated endpoint failed for them for eleven days. The row's address was moved to `orphan-<uuid>@parked.invalid` (RFC 2606 `.invalid`, unregistrable, uuid-unique) under a guarded single-row UPDATE inside a rollback-on-mismatch transaction. **The old value is deliberately NOT recorded in this public repository** — it survives byte-identically on the live auth identity, and the one-statement undo plus the full pre-state are in `docs/PRODUCTION_DATA_FIX_2026-09-04_ORPHAN_1e1c8482.md`. **That undo is only available while that identity exists — do not delete it.** The other three orphan app rows were deliberately left alone: their addresses are on `.local` / `example.com`, which cannot receive a confirmation link, and confirmation is required, so none of them is armed.
- [ ] **LOCAL DEV, WILL COST THE NEXT PERSON AN HOUR — the local `SUPABASE_SERVICE_ROLE_KEY` is a DISABLED legacy key:** Supabase disabled this project's legacy `anon` / `service_role` keys on **2026-06-12**, and the value in `apps/backend/.env` is one of them. Any call to the Supabase auth API from a local backend returns **`401 {"message":"Legacy API keys are disabled"}`**, so `authMiddleware`'s `supabase.auth.getUser` fails and **every** authenticated route 401s locally — which reads exactly like a bad token or a broken login rather than a dead key. **PRODUCTION IS UNAFFECTED, and that is proven rather than asserted:** a `User` row exists with `createdAt 2026-08-02` and document `c176c0d5-…` was created 2026-09-04, and both are written only *after* `supabase.auth.getUser` succeeds — so the deployed key worked well after the 2026-06-12 disablement. Either the local file is stale or Railway carries a new-format key; the Railway environment is not readable from here. **Fix:** replace the local value with a current publishable/secret key from the Supabase dashboard, or re-enable legacy keys there. Costs nothing until someone tries to run the backend locally against auth, at which point it costs them an hour.

## STANDING CONSTRAINT — do not delete auth identity `c521aa92-0f4d-4b82-821a-b9e8c0c6f7ae`

**Read this before touching any orphan row.** That identity is the ONLY place the
original address of app row `1e1c8482-16bb-474c-89d0-5f3e65d1f186` still exists.
The address was parked as `orphan-<uuid>@parked.invalid` on 2026-09-05 to unblock
a locked-out user, and the old value was deliberately **not** committed to this
repository because it is public and the address belongs to a real person.
Deleting that identity destroys the undo permanently and silently — nothing will
warn you. Full pre-state, reasoning and the one-statement recovery:
`docs/PRODUCTION_DATA_FIX_2026-09-04_ORPHAN_1e1c8482.md`.

This is a constraint, not a task. There is nothing to do; there is something not
to do.

## Play Console "set up your app" tasks — ALL COMPLETE (clock is now running)

- [x] Privacy policy URL (https://www.scan-action.com/privacy)
- [x] Sign-in details (test account: `unicornapps.support@gmail.com`, now PRO; full-access box checked)
- [x] Ads declaration (answered **No** — app has no ads yet; revisit when ads are built)
- [x] Content rating questionnaire
- [x] Target audience (**18+**)
- [x] Data safety (completed truthfully)
- [x] Government apps (**No**)
- [x] Financial features (**none**)
- [x] Health (**none**)
- [x] App category (**Productivity**) + contact details
- [x] Store listing (app icon + feature graphic + 7 phone/tablet screenshots + descriptions)
- [x] Select countries/regions for the closed track (**177 countries, includes Pakistan**)
- [x] Add testers to the closed track (created **"Scan Action Testers"** email list with **25 testers** from the Fiverr seller)
- [x] Send the release to Google for review
