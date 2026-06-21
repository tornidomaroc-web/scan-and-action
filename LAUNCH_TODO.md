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
- Review account: `unicornapps.support@gmail.com` was manually set to PRO directly in the DB (`Organization.plan`, **NO Paddle subscription backing it**) so the Google reviewer sees Pro features.

## DEFERRED — to build/do DURING or AFTER the 14-day clock (before applying for production)

- [ ] **ADS (Phase C):** integrate AdMob. Show ads to FREE users only; PRO removes ads. iOS needs UMP consent + ATT (App Tracking Transparency). After building, you **MUST** update Play Console: flip the "Ads" declaration from No to Yes, and update the Data Safety form and Content rating to match.
- [ ] **REAL IN-APP PURCHASE (Phase B):** integrate RevenueCat for native subscriptions. It must write the **SAME** `Organization.plan` field the Paddle webhook writes. Set RevenueCat `app_user_id = Supabase user.id`. Add a separate RevenueCat webhook endpoint with its own signature verification and event mapping (`INITIAL_PURCHASE`/`RENEWAL`/`PRODUCT_CHANGE` -> PRO; `CANCELLATION`/`EXPIRATION`/`BILLING_ISSUE` -> FREE). Define a multi-source precedence rule so Paddle (web) and RevenueCat (mobile) can't fight over the plan field. Remove the "Pro coming soon" placeholder once real IAP works.
- [ ] **DATA SAFETY form (Play) + Apple Privacy Labels (iOS):** complete truthfully. Disclose Google Gemini, Supabase, RevenueCat, AdMob. **IMPORTANT:** verify the actual transactional email provider — investigation found NO Resend in the codebase; email appears to be Supabase Auth's built-in mailer. Disclose whatever is actually used.
- [ ] **LOGO / BRANDING:** design a professional, premium logo and a single consistent app icon + splash screen (current ones are placeholder/inconsistent). Upload as an app update during the 14-day window (closed-testing updates do NOT reset the clock).
- [ ] **SUPPORT EMAIL:** verify `support@scan-action.com` is active and monitored (it's referenced in the privacy policy and the `/delete-account` page).
- [ ] **REVIEW ACCOUNT CLEANUP:** consider reverting `unicornapps.support@gmail.com` back to FREE after Google's review completes (it's a manual DB state with no billing source of truth; downgrade webhooks could also flip it).
- [ ] **iOS / APPLE APP STORE (entire track, later):** requires a Mac + Xcode (founder is on Windows + iPhone, no Mac yet — decide Mac mini vs cloud build like Codemagic). Also: Apple Developer Program enrollment ($99/yr, individual), Apple Small Business Program (15% tier, must apply), App Store IAP via RevenueCat, ATT, Apple Privacy Labels. Account deletion is already cross-platform (works on iOS too).
- [ ] **targetSdk:** currently 35 (meets Play's current minimum for new apps). May need a bump to 36 around Aug 2026 if Play warns at upload — bump `compileSdk`/`targetSdk` in `apps/frontend/android/variables.gradle` and rebuild.
- [ ] **APPLY FOR PRODUCTION:** only after the closed test has run 14 days with 12+ opted-in testers (testers via Grayo on Fiverr, Premium plan, testers create their own in-app accounts, India required as a target country). Coordinate with Grayo — they provide the production-access questionnaire answers; do NOT apply independently.
- [ ] **GEMINI BILLING TIER:** The app currently uses a Gemini API key on the FREE tier ("Niveau sans frais", even though a billing account is linked). On the free tier, Google may use submitted content to improve its products — which is why the Play Data Safety form was filled in declaring document data as SHARED with Google. ACTION (later, when usage/users grow): upgrade to the genuine PAID Gemini tier so customer document content is NOT used for training. This strengthens customer privacy/trust and lets us potentially update the Data Safety "Shared" disclosure. Reference: https://ai.google.dev/gemini-api/terms
- [ ] **PHOTO PERMISSION FALLBACK:** The app uses `READ_MEDIA_IMAGES` and we filled Google's "Photo and video permissions" declaration (justified as: users upload existing receipt/invoice/document photos from their gallery for the core scanning feature). **RISK:** Google's photo/video policy is strict and may reject this since the app's image access is on-demand (per upload) rather than broad/continuous. **FALLBACK if rejected:** migrate from `READ_MEDIA_IMAGES` to the Android **Photo Picker** (`PickVisualMedia` / `ACTION_PICK` via the system photo picker), which needs no broad storage permission and removes this declaration requirement entirely. This is a clean technical fix. Implement only if the reviewer flags it.
- [ ] **MONITOR TESTER OPT-INS:** Watch the "testers currently opted-in" counter in Play Console (needs **≥12**). Watch `unicornapps.support@gmail.com` for tester feedback and any Google emails.
- [ ] **AFTER 14 DAYS + 12 TESTERS:** Apply for production (answer Google's questionnaire about the closed test; coordinate with the seller for tester feedback/notes).

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
