# Scan & Action — Store Launch Tracker

> Living checklist for the Google Play / Apple App Store launch. Tick items off as
> they're completed. Keep this up to date across sessions so deferred steps are never lost.

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

## Remaining Play Console "set up your app" tasks (to finish BEFORE the clock starts)

- [x] Privacy policy URL (https://www.scan-action.com/privacy)
- [x] Sign-in details (test account: `unicornapps.support@gmail.com`, now PRO; full-access box checked)
- [ ] Ads declaration (answer "No" for now — app has no ads yet; revisit when ads are built)
- [ ] Content rating questionnaire
- [ ] Target audience
- [ ] Data safety
- [ ] Government apps
- [ ] Financial features
- [ ] Health
- [ ] App category + contact details
- [ ] Store listing (app icon, screenshots, short + full description) in EN / FR / AR
- [ ] Select countries/regions for the closed track (include India for Grayo testers)
- [ ] Add testers to the closed track
- [ ] Send the release to Google for review
