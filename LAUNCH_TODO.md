# Scan & Action — Store Launch Tracker

> Living checklist for the Google Play / Apple App Store launch. Tick items off as
> they're completed. Keep this up to date across sessions so deferred steps are never lost.

## CURRENT STATE (updated today)

- App is **SUBMITTED** and the closed-testing release was **APPROVED by Google**. Status has moved past "In review"; the closed-testing release now shows as **published**. Track: **Closed testing - Alpha**.
- The tester opt-in link (web) is **live** and was sent to the Fiverr seller (**Touseef Ijaz**, order **#FO837C01CEF08**, Standard plan, 20–25 testers, 14 days, delivery ~**Jul 3 2026**). Seller confirmed he can access the app and that testers will start shortly.
- Review/test account `unicornapps.support@gmail.com` is set to **PRO** directly in the DB (no Paddle backing).
- **Now waiting for:** at least **12 testers to opt in** + **14 days of testing** before "Apply for production" unlocks.

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
- The **14-day closed-testing clock has NOT started yet** — still completing Play Console "set up your app" tasks.
- Review account: `unicornapps.support@gmail.com` was manually set to PRO directly in the DB (`Organization.plan`, **NO Paddle subscription backing it**) so the Google reviewer sees Pro features. (⚠️ This should live on `Organization.planOverride`, not bare `plan` — bare `plan` is fragile against any future entitlement recompute. See **REVIEW ACCOUNT CLEANUP** below for the verify/fix.)

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
- [ ] **REVIEW ACCOUNT CLEANUP:** revert `unicornapps.support@gmail.com` to FREE after the **production** review completes (the closed-testing review is already approved; production review is later). It should be granted via **`Organization.planOverride = PRO`**, NOT bare `Organization.plan`: the entitlement service treats `planOverride` as a floor and **never writes it** (`applyEntitlementChange.ts` invariant), so no billing/downgrade event can clobber it. **TODO (verify):** confirm the live row is actually on `planOverride`. If it's on bare `plan` with `planOverride = null` (as an older note in this file implied), any future entitlement recompute would derive it back to FREE — move the grant to `planOverride`. **To reset post-review:** set `planOverride = null` (it then derives FREE, since the account has no billing source).
- [ ] **iOS / APPLE APP STORE (entire track, later):** requires a Mac + Xcode (founder is on Windows + iPhone, no Mac yet — decide Mac mini vs cloud build like Codemagic). Also: Apple Developer Program enrollment ($99/yr, individual), Apple Small Business Program (15% tier, must apply), App Store IAP via RevenueCat, ATT, Apple Privacy Labels. Account deletion is already cross-platform (works on iOS too).
- [ ] **targetSdk:** currently 35 (meets Play's current minimum for new apps). May need a bump to 36 around Aug 2026 if Play warns at upload — bump `compileSdk`/`targetSdk` in `apps/frontend/android/variables.gradle` and rebuild.
- [ ] **APPLY FOR PRODUCTION:** only after the closed test has run 14 days with 12+ opted-in testers (testers via Grayo on Fiverr, Premium plan, testers create their own in-app accounts, India required as a target country). Coordinate with Grayo — they provide the production-access questionnaire answers; do NOT apply independently.
- [ ] **GEMINI BILLING TIER:** The app currently uses a Gemini API key on the FREE tier ("Niveau sans frais", even though a billing account is linked). On the free tier, Google may use submitted content to improve its products — which is why the Play Data Safety form was filled in declaring document data as SHARED with Google. ACTION (later, when usage/users grow): upgrade to the genuine PAID Gemini tier so customer document content is NOT used for training. This strengthens customer privacy/trust and lets us potentially update the Data Safety "Shared" disclosure. Reference: https://ai.google.dev/gemini-api/terms
- [ ] **PHOTO PERMISSION FALLBACK:** The app uses `READ_MEDIA_IMAGES` and we filled Google's "Photo and video permissions" declaration (justified as: users upload existing receipt/invoice/document photos from their gallery for the core scanning feature). **RISK:** Google's photo/video policy is strict and may reject this since the app's image access is on-demand (per upload) rather than broad/continuous. **FALLBACK if rejected:** migrate from `READ_MEDIA_IMAGES` to the Android **Photo Picker** (`PickVisualMedia` / `ACTION_PICK` via the system photo picker), which needs no broad storage permission and removes this declaration requirement entirely. This is a clean technical fix. Implement only if the reviewer flags it.
- [ ] **MONITOR TESTER OPT-INS:** Watch the "testers currently opted-in" counter in Play Console (needs **≥12**). Watch `unicornapps.support@gmail.com` for tester feedback and any Google emails.
- [ ] **AFTER 14 DAYS + 12 TESTERS:** Apply for production (answer Google's questionnaire about the closed test; coordinate with the seller for tester feedback/notes).

## Open engineering items (from the email / monetization workstream)

- [ ] **Welcome email — enable when ready (currently gated OFF):** `WELCOME_EMAIL_ENABLED` stays OFF until two compliance placeholders are real:
  - **POSTAL_ADDRESS** in `mailer.ts` (currently the `[Your Company Name], …` placeholder) — a real physical mailing address required by CAN-SPAM. **Founder decision** (a privacy choice, not an engineering call).
  - **Unsubscribe inbox** `unsubscribe@scan-action.com` must actually receive mail (no inbox today). Cheapest fix: **Cloudflare Email Routing** (free) on the apex domain — which can forward `unsubscribe@`, `support@` (see the SUPPORT EMAIL item — same setup), and any reply address in one configuration.
  Once both are real, flip `WELCOME_EMAIL_ENABLED=true` in Railway.
- [ ] **`apps/backend/scripts/send_reminders.js` is NOT production-ready:** it still sends `from: 'Scan & Action <onboarding@resend.dev>'` (Resend **sandbox** sender — and likely rejected now that the production key is scoped to the apex) and links to a stale `https://scan-and-action.vercel.app/queue`. It is dormant (not wired to any cron). Either route it through `mailer.ts` / the apex sender and fix the link to `https://www.scan-action.com/...`, or quarantine it with a "do not run" header. **Do NOT run as-is.**
- [ ] **authMiddleware provisioning-race hardening (latent bug):** two concurrent first-time requests for the SAME user can both enter the zero-memberships branch; the loser hits a unique-constraint **P2002** on `organization.create`, which currently bubbles to the generic `catch` → a spurious **401**. This was **NOT** the tester-signup symptom, and it's now rare (email confirmation serializes a user's first login), but harden before production scale: catch P2002 and treat it as "already provisioned" (re-read memberships and continue) instead of 401. Keep the deterministic `workspace-<uuid8>` slug.

## Remaining Play Console "set up your app" tasks (to finish BEFORE the clock starts)

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
