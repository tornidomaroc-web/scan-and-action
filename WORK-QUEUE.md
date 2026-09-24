# Scan & Action — Work Queue

> **THIS IS THE ONLY BOARD.** Where any other file in this repository disagrees
> with it about what is open, **this file wins.** `docs/DASHBOARD_REDESIGN_PROGRESS.md`
> is frozen as of 2026-09-09 with a pointer back here, every other file in
> `docs/` is a dated snapshot, and `DEFERRED.md` has never existed.
>
> **REWRITTEN 2026-09-23 for a new stage (see THE STAGE).** Everything removed is
> in git: `git show 9751e8139e2acd844c3e32eee85fe4bf74716917:WORK-QUEUE.md`.
> Titles that the tree still cites are listed at the bottom, so no citation
> dead-ends.
>
> **CITE ITEMS BY QUOTED TITLE, NEVER BY LINE NUMBER.** Inside items, anchor code
> by a string you can grep, and prove it resolves to exactly one place.
>
> **THE RULE FOR THIS FILE.** A line asserting something about a system outside
> this repository (Play, Apple, Paddle, the database, Supabase, Resend, Google
> Cloud, Railway) carries the call that answers it, or does not assert it. A date
> is not a substitute. Where no programmatic call exists, name the system and the
> exact question, never a cached answer. Claims about this repository need no
> instrument: the reader can open the file.

## THE STAGE — design, then the Apple App Store

- **Set 2026-09-23 by the owner:** make the app's design and interfaces modern,
  then publish on the Apple App Store. Everything else is secondary.
- **Premise:** the app has zero Play downloads and no user besides the owner (his
  statement). A read-only reading the same day agreed: since 2026-08-01, zero
  uploads and zero sign-ins by members of any organisation outside his three,
  against 54 uploads in his own three over the same window (the control). The
  three: owner `d8b34ee3`, owner `5ce3e185`, review account `22d51116`.
  Instrument: from `apps/backend`, inside `SET TRANSACTION READ ONLY` with
  `SHOW transaction_read_only` asserted `on` first, count `Document.uploadedAt`
  and `auth.users.last_sign_in_at` on or after `2026-08-01`, joined through
  `Membership`, for organisations whose id starts with none of the three
  prefixes; then the same counts for the three, as the control.
- **The recovery track is dead. Do not resume it.** Its items left with it.
- **The privacy rules stand as engineering discipline** (the owner, same day).
- **Order:**
  1. The board rewrite (#239).
  2. **The Apple developer account is ready** (the owner, 2026-09-23). Everything
     left on the Apple track is engineering work: nothing on it is his to decide
     or pay for.
  3. Design step 1: **DONE 2026-09-23, ledger-first chosen.** See DECIDED below.
  4. The iOS platform and a CI → TestFlight pipeline, in one small PR, so every
     later design commit is judged on his iPhone. It needs the owner's App Store
     Connect API key: no Apple credential is configured for this repository (its
     Actions secrets are `SUPABASE_URL` and `SUPABASE_ANON_KEY` only; ask
     `gh secret list`), and the key can only be created signed in to his Apple
     account. Ruled 2026-09-24: the ledger home comes first, and is judged on
     his iPhone from the home screen ("Add to Home Screen" runs the web app
     full-screen with the same WebKit engine; `apple-mobile-web-app-capable`
     in `index.html`).
  5. **The build order**, ruled 2026-09-23 and not to be reshuffled by taste:
     1. the categorizer, with its backfill and its measurement (bar below);
     2. the summary endpoint;
     3. the ledger home (design step 4). **Precondition:** the duplicate
        re-evaluation has been WRITTEN, not only merged, and its dry run
        re-run plans 0 changes (see "Duplicates the rule engine never saw").
     Nothing visual is drawn until the "Other" share on his own receipts is a
     measured number rather than 43 of 47. **Measured 2026-09-23** (see "The
     categorizer is rebuilt" under Step 1). Design steps 2, 3 and 5 to 7 follow.
  6. Submission, once design steps 1 to 5 are done and every APPLE TRACK blocker
     is closed.

## DECIDED 2026-09-23 — ledger-first

**The owner chose ledger-first** after running all three direction prototypes
on his iPhone in one sitting. Capture-first and inbox-first are **decided
against, not deferred**: do not reopen them as runners-up.

**Why, in his words as relayed:** it is the only one of the three that gives a
reason to open the app without a receipt in hand; it is closest to what he
reached for when he showed the visual level he wants; and it makes the product
read as a money product rather than a scanning utility, which changes what it
can be priced as later. He chose it knowing it carries the biggest backend bill
of the three.

**What would reopen it, and nothing else:** the categorizer failing its bar (see
the build order) on his own receipts after a real rebuild. A screen full of
"Other" is not an argument for another structure; it is the bar unmet.

**The prototypes are spent.** They were the instrument for this decision and
are not inputs to the build. They stay as private claude.ai pages (titles
"Scan & Action Capture", "Scan & Action Ledger", "Scan & Action Inbox"; find
them with the Artifact tool's `list`); their links are not recorded here.

**Four facts read from the code on 2026-09-23, which set the build order:**
1. **A rebuilt categorizer reaches no existing document.** `categorizeAndSave`
   in `persistence.ts` returns early when a `category` fact exists and runs
   only inside a persist. Of 386 documents, 47 carry a category. Without a
   backfill, a rebuild changes nothing on screen.
2. **The by-category answer is wrong in the ask path too.** `group_expenses` in
   `queryExecutor.ts` joins on `cat."key" = 'EXPENSE_CATEGORY'`, which nothing
   writes; the categorizer writes `category`. That makes **eight** wrong reads
   in the old summary paths, not seven.
3. **The per-currency rule already exists.** `sum_expenses` groups
   `TOTAL_AMOUNT` by `currency` and returns `isMixedCurrency`. The prototype
   drew what the code does; it did not invent the rule. It holds for the home
   screen at any number of currencies: per currency, never summed, the currency
   carrying the most spend as the figure and the rest as subordinate lines.
   Conversion, if ever wanted, is a separate reporting-currency feature.
4. **The current home has no money in it.** `dashboardStatsService` counts
   documents by `processedAt`. The ledger home needs an endpoint that does not
   exist.

**The categorizer commit: what it must prove before it can be merged.**
- The category comes from the extractor, as a fixed enum in the existing Gemini
  call, stored as the `category` fact with its source; the keyword matcher stays
  only as the fallback when the model returns nothing.
- A paced backfill script classifies stored `rawText` for **his own
  organisations and the review account only** (CONSTRAINT), and may overwrite
  an existing `category` fact.
- A measurement script prints, for a labelled set of at least 40 of his own
  receipts in both scripts (labelled from the text, spot-checked by him), the
  set's size, the accuracy, and the "Other" share.
- On the nine prototype receipts, the grocery receipt and the Arabic bakery come
  out Food.
- Existing tests and the extraction-shape tests are green.
- The merge replaces "43 of 47" on this board with the measured figure. DONE in
  the categorizer PR; the figure and its caveats are under "The categorizer is
  rebuilt" in the DESIGN TRACK.

**Amended 2026-09-23, from reading the set the measurement would run on.** His
organisations hold 154 documents with text; 144 carry an amount. Read for
labelling, they are mostly stock receipt images and templates, and they
repeat: one supermarket receipt is there ten times, one "Shop Name" template
twelve. Labelled, they give 101 receipts (43 templates, forms and screenshots
skipped), which dedupe to **53 distinct receipts**. **Only two documents carry
Arabic, and neither is a receipt** (an invoice template and a subscriptions
dashboard). So the bar's "at least 40 in both scripts" cannot be met on what
exists: the Latin side is measured on 53 distinct receipts, and **the Arabic
side is not covered by this set**; the measurement says so rather than
pretending. The labels are `scripts/categorizerLabels.json` (id prefix →
label only; no merchant or amount in the repository).

**The summary endpoint commit, second, after the backfill has run:** built
fresh (month, by category, by currency, key `category`), the three dead paths
deleted and `group_expenses` fixed or removed, proved by exact totals against a
hand-computed fixture. Its status rule: count COMPLETED and NEEDS_REVIEW rows
that carry an amount, exclude REJECTED, and exclude a flagged duplicate until
he keeps it.

## CLOSED 2026-09-23 — subscriptions: zero subscribers, nobody is charged

The owner settled it: **there are zero subscribers, and nobody is being charged
anything.** The three `Subscription` rows (`source PADDLE`, `status ACTIVE`, all
created 2026-06, none recording a `currentPeriodEnd`) are **dead data**. This
file once called them "paying customers". That was a reading of our own table,
never of anyone being charged. **Do not send the owner to a dashboard about
them.**

**One trap, for whoever cleans them up.** Two of the rows sit in the owner's
own organisations, `d8b34ee3` and `5ce3e185`, and those organisations are PRO
only through them:
- `planOverride` is null on both (read 2026-09-23).
- `derivePlan` gives PRO while any source is ACTIVE.

So a cleanup that recomputes the plan (anything through
`applyEntitlementChange`) drops both to FREE, which caps his own accounts at the
free scan limit in `uploadController.ts`. Set `planOverride = PRO` on both
first, or leave the rows alone.

## CONSTRAINT — other people's rows never become design material

**Nothing from an organisation outside the owner's three (`d8b34ee3`,
`5ce3e185`, `22d51116`) becomes prototype content, demo data, a test fixture or
a store screenshot.**

- **The June accounts came from the closed test.** 22 accounts outside his
  organisations were created in 2026-06 (read 2026-09-23: `auth.users.created_at`
  by month, through `Membership`). This file recorded that test's testers as 25
  people from a Fiverr seller who created their own in-app accounts.
- What their documents show is unknown, and the empty ones were never read.
- The March accounts fall under the same rule, because the database cannot say
  whose they are.
- **Use the owner's own receipts, or synthetic ones.**

## APPLE TRACK

### Done in code, never run on iOS

- **In-app account deletion.** `DELETE /api/account` is served by
  `AccountController.deleteAccount` and opened from `DeleteAccountModal.tsx`,
  and there is a public `/delete-account` page. Apple 5.1.1(v): *"If your app
  supports account creation, you must also offer account deletion within the
  app."*
- **The native no-sell gate.** `isNativePlatform` in `native/shell.ts` is
  `Capacitor.isNativePlatform()`, which is true on iOS as on Android.
- **There has never been an iOS build.** `apps/frontend/ios` does not exist, and
  `@capacitor/ios` is not in `apps/frontend/package.json`, while
  `@capacitor/android` is. So the old line "account deletion works on iOS too"
  was never observed. **Verify both on the first TestFlight build.** For
  deletion, delete a throwaway account in-app, then run the query in "Orphaned
  app rows": its count must not grow.
- **The Apple developer account is ready** (the owner, 2026-09-23). Nothing on
  this track is his to decide or pay for; what remains is engineering work.

### Facts corrected 2026-09-23, each with what was read

- **A Mac is not required to build, sign or ship.**
  - The repository is public (`gh api repos/{owner}/{repo} --jq .visibility`).
  - GitHub's runner reference
    (docs.github.com/en/actions/reference/runners/github-hosted-runners), read
    2026-09-23: *"Use of the standard GitHub-hosted runners is free and unlimited
    on public repositories."* `macos-latest`, `macos-14`, `macos-15` and
    `macos-26` are on that list.
  - The plan: build, sign with an App Store Connect API key, and upload to
    TestFlight in CI, at $0. TestFlight puts each build on the owner's iPhone.
  - **What CI cannot give** is Safari's Web Inspector attached to the app on the
    phone. If iOS-only rendering bugs appear, that is when a Mac earns its price.
  - Two conditions:
    - Signing material lives only in Actions secrets and is never echoed,
      because this repository's logs are public.
    - If the repository ever goes private, the quoted sentence stops applying.
- **Version 1 needs no in-app purchase.**
  - Apple 3.1.3(f), read 2026-09-23 at
    developer.apple.com/app-store/review/guidelines: *"Free apps acting as a
    stand-alone companion to a paid web based tool (i.e. VoIP, Cloud Storage,
    Email Services, Web Hosting) do not need to use in-app purchase, provided
    there is no purchasing inside the app, or calls to action for purchase
    outside of the app."*
  - That condition is the native INVARIANT below, already enforced in code.
  - **The named risk is 3.1.3(b)**, on the same page: *"Apps that operate across
    multiple platforms may allow users to access content, subscriptions, or
    features they have acquired in your app on other platforms or your web site
    … provided those items are also available as in-app purchases within the
    app."* A reviewer who reads the app under (b) rather than (f) will ask for
    IAP, so the review notes must argue (f).
- **ATT is moot.** App Tracking Transparency was on this list only for ads, and
  ads left the plan on 2026-09-23.

### Blockers this file never had

- [ ] **No iOS platform in the repository.** `apps/frontend/ios` is absent, and
  `@capacitor/ios` is not a dependency. **EXPIRY:** a PR adds the platform and a
  CI workflow that uploads a signed build to TestFlight, and the owner installs
  it on his iPhone. It needs the owner's App Store Connect API key (see THE
  STAGE, item 4).
- [ ] **Placeholder text that 2.1(a) forbids is reachable today.** Apple 2.1(a):
  *"placeholder text, empty websites, and other temporary content should be
  scrubbed before submission."*
  - `SettingsScreen.tsx`: the `s.comingSoon` panel lists invoice history, team
    management, API key generation and webhook configuration under "Coming
    soon:". Its container carries no platform or width guard.
  - `DashboardScreen.tsx`: `s.dataComingSoon` ("Data coming soon") appears at two
    sites, one in each panel without data. That describes a new account's first
    screen.
  - `ProfileScreen.tsx` holds a third, but nothing imports or routes it. It goes
    in design step 5.
  - **EXPIRY:** no `comingSoon`, `moreSettingsSoon` or `dataComingSoon` string can
    render in a native build.
- [ ] **No support page.**
  - App Store Connect requires a Support URL. `App.tsx` declares `/`, `/login`,
    `/privacy`, `/terms`, `/refund`, `/delete-account` and the app screens, and
    nothing else. Contact addresses appear only on the legal pages and on
    `/delete-account`.
  - The address the page should carry is `support@scan-action.com`. Before
    publishing, verify it still routes: an SMTP `RCPT TO` against the domain's
    MX, with no message sent, and a deliberately fake address on the same domain
    as the control, which must be refused. The 2026-09-05 run of that probe is
    in git history.
  - **EXPIRY:** a public page with support contact exists, and its URL is in App
    Store Connect.
- [ ] **No privacy-policy link inside the native app.** Found 2026-09-23 while
  writing this rewrite.
  - Apple 5.1.1(i): *"All apps must include a link to their privacy policy in the
    App Store Connect metadata field and within the app in an easily accessible
    manner."*
  - The only in-app `<Link to="/privacy"` is in `LandingScreen.tsx`, and a native
    build never renders the landing: `LandingRoute` in `App.tsx` sends native `/`
    to `/dashboard` or `/login`.
  - **Linking it triggers the INVARIANT's own note.** `PrivacyPolicy.tsx` says
    payments are processed by Paddle, and mentions subscription cancellation.
  - **EXPIRY:** a native build links a privacy policy whose copy carries no
    purchase link and no call to action.
- **Scope: v1 is iPhone-only.** Set the device family to iPhone when the platform
  is added. At iPad width (768 CSS px and up, `useIsDesktop`), New Scan opens the
  desktop upload dialog instead of `CaptureSheet`, which would be a second layout
  to design and review.

### Kept, with the reason each has now

- [ ] **App Privacy details (Apple) and Data Safety (Play): complete truthfully.**
  Required to submit.
  - Derive the processor list from the code at submission time, never from a
    list here.
  - Today that list is Google Gemini (document analysis), Supabase (auth,
    database, storage) and Resend. Resend carries transactional mail, and
    Supabase Auth mail through custom SMTP; see "Where a confirmation email comes
    from".
  - Recipient addresses go to Resend, a US email processor.
  - **EXPIRY:** the labels are submitted, and match the build and the Gemini tier.
- [ ] **Gemini's data terms in the privacy label: write it for the free tier.**
  - The label must say what Google does with document content. On the free tier,
    Google may use submitted content to improve its products (terms:
    https://ai.google.dev/gemini-api/terms).
  - Write the label to that disclosure unless the key is shown to be on the paid
    tier. A label that discloses more than happens is true, and one that
    discloses less is not, so submitting needs nobody's decision and nobody's
    payment.
  - **EXPIRY:** the label is written.
- [ ] **The reviewer's first scan must work. Measure it before submitting.** This
  replaces the extraction-reliability tracking, which was justified by uploaders
  who do not exist.
  - Measure on the current model, with the owner's own phone photos of real
    receipts, through the TestFlight build.
  - Include a few scans inside one minute. In the only era whose failures carry a
    class (2026-09-08/09, one organisation, deliberately bursty load), 13 of its
    20 failures were quota 429s (extraction watch reading of 2026-09-22, in git
    history), and a reviewer's scans can meet a quota.
  - Read the result with `cd apps/backend && npx tsx scripts/extractionWatch.ts 60`,
    which is read-only, enforced by the database.
  - Today's evidence is thin. The watch read the current era at 6 succeeded and
    0 failed (2026-09-23). That bounds the per-upload failure rate only below
    about 39% at 95% confidence (calculated: 1 − 0.05^(1/6)). Showing it is below
    10% takes about 29 clean uploads in a row (calculated: ln 0.05 / ln 0.9).
  - **EXPIRY:** a run sized for the bound wanted, on real receipts, read by that
    command and reported with its population.
- [ ] **Review account `unicornapps.support@gmail.com` (`22d51116`): it STAYS PRO
  as the standing demo account for both stores.** REVERSED 2026-09-23; this used
  to say "revert to FREE after the production review".
  - Why it stays: Apple 2.1(a) says *"include demo account info (and turn on your
    back-end service!) if your app includes a login"*, and Play re-reviews every
    update.
  - It is PRO through `Organization.planOverride`, which the entitlement service
    never writes. Read it with
    `SELECT o."planOverride", o.plan, (SELECT count(*) FROM "Subscription" s WHERE s."organizationId"=o.id) FROM "Organization" o JOIN "Membership" m ON m."organizationId"=o.id JOIN "User" u ON u.id=m."userId" WHERE u.email = <that address>;`.
    `planOverride = PRO` with zero subscription rows is the safe shape.
  - Its documents are ours, so they are acceptable demo content.
  - **If it is ever reset, the instruction this file used to carry was WRONG.**
    It said "set `planOverride = null` (it then derives FREE)".
    - `Organization.plan` is a cache written only on a billing event:
      `data: { plan: newPlan }` in `applyEntitlementChange.ts` is its only writer.
    - Request-time checks read the cached column (`organization?.plan === 'FREE'`
      in `uploadController.ts`).
    - So on an account with no subscription, nulling the override alone leaves
      `plan = PRO` forever.
    - A reset sets **both** `planOverride = null` and `plan = 'FREE'` in one
      statement, as `docs/DASHBOARD_REDESIGN_PROGRESS.md` already said.
  - **EXPIRY:** none while either store reviews updates.

## DESIGN TRACK

### The ruling, and why starting anywhere else produces a well-measured admin panel

**Colour and type are not the cause.** The type pairing is deliberate: Inter plus
IBM Plex Sans Arabic, loaded by the `@fontsource` imports in `main.tsx`.

**The cause is structure. The app is a B2B web admin panel on a phone:**

- The navigation is Dashboard / Recent activity / Search / Queue / Settings (the
  nav items in `Sidebar.tsx`).
- Home reports on the system, not on the person: `s.documentsProcessed` and
  `s.documentsByStatus` in `DashboardScreen.tsx`.
- Settings promises API keys and webhooks (the `s.comingSoon` panel).
- Capture hands the user a plain photo from the phone's generic camera:
  `capture="environment"` in `CaptureSheet.tsx`. `@capacitor/camera` is used only
  for its permission API (`native/camera.ts`).

In an app store, that is what Apple 4.2 excludes: *"Your app should include
features, content, and UI that elevate it beyond a repackaged website."*

**Every design entry this file used to carry corrected one element of that
structure:** a banner's colour, a pill, a table, an empty state. The landing work
measured contrast to four decimals, which is hygiene, not design. **Working that
list, or starting from whichever screen is easiest to change, produces a
well-measured admin panel rather than an app.**

**The ruling: start at the scan → read → result loop, redrawn from zero, not
restyled.** Do not start at login, although a reviewer sees it first:

- Both judges decide on the first scan: the reviewer's 4.2 ruling, and a
  first-time visitor's keep-or-delete.
- It is the furthest point from the market's best. System document scanners give
  edge detection, auto-capture, perspective correction and multi-page:
  VisionKit's document camera on iOS, ML Kit's document scanner on Android. The
  plugin choice comes later.
- A flattened, cropped page may also extract better than a raw photo. That is a
  hypothesis, measured in step 3.
- The loop sets the visual language every other screen inherits.

### The order

- [x] **1. Direction: DONE 2026-09-23, ledger-first chosen.** See DECIDED at the
  top. Three prototypes, identical in look and different only in structure,
  each running the same script in Arabic and English under the rule that
  nothing unbuilt appears unframed; the owner chose on his iPhone. The
  prototypes are spent. **Still owed by this step:** a second round, on
  ledger-first, decides the icon and palette (this replaces the old logo item:
  the icon is the App Store's first pixel and a required asset). **Ruled
  2026-09-24: it comes AFTER the ledger home**, as the owner's locked order
  has it (item 4), not with it. The ledger home ships on the current tokens:
  its accent is already the prototypes' own (`--sa-accent: #635BFF` in
  `tokens.css`), a palette change repaints the finished landing through the
  pin (`landingLightPin.test.tsx`), and judging structure and colour in one
  sitting makes neither judgement readable.
- [ ] **2. The design system, in code.**
  - Tokens, a type scale, and core components: sheet, list row, field, button,
    tab bar, nav bar.
  - Colour tokens are defined as channels, so opacity modifiers work. Today
    `bg-surface/40` (`DashboardScreen.tsx`, `AreaChart.tsx`) emits no CSS at all:
    Tailwind 3.4 generates no rule for an alpha modifier on a `var()` colour.
  - Carries "Mobile type scale (<md)" and "Step 3".
  - **EXPIRY:** the system ships without repainting the finished landing.
- [ ] **3. The loop.**
  - A native document scanner on both platforms.
  - A reading state that shows the document at once, with its image.
  - A result that shows the image with its fields, edits in place, and flags only
    what needs the owner.
  - Measure extraction success and the "Needs review" rate on his real receipts,
    judged only on rows the current code wrote.
  - **EXPIRY:** it ships on both native builds, with that measurement.
- [ ] **4. Home: the ledger home. BUILT in the ledger-home PR; open until the
  owner has judged it on his iPhone.** Its precondition held: the duplicate
  write ran 2026-09-24 and the dry run, re-run, planned 0 changes. What it
  shows: one figure per currency, category cards, what needs him, and the
  receipts as transactions (`LedgerScreen.tsx`; every rule and its evidence
  in `lib/ledgerView.ts`).
  - **Changed from "the dominant currency as the figure, other currencies
    subordinate" (ruled 2026-09-24, on the owner's brief).** Every currency
    gets a figure of the same size. Choosing a dominant one means comparing
    amounts across currencies, which is a conversion in disguise: INR 290 would
    outrank USD 50. The figures stay in the order `/api/ledger` returns them,
    the unknown currency last.
  - **It replaces the old home at `/dashboard`**; the workspace dashboard (CSV
    export, activity, stats) moved to `/overview`, one tap from the ledger's
    footer, until design step 6 redraws it. Its "Data coming soon" placeholders
    are no longer the first screen of a new account.
  - **EXPIRY:** the owner has used it on his iPhone and ruled on it.
- [ ] **5. First run.** Login and signup, an email confirmation that returns to
  the app, the icon and splash, every "coming soon" removed, `ProfileScreen.tsx`
  deleted, and the in-app privacy link.
- [ ] **6. The rest.** Documents and search, the review queue, settings with
  account deletion reachable, and the web-only paywall.
- [ ] **7. Store screenshots**, taken from the finished UI.

### Inputs, filed under the step that redraws them — not a checklist

> Most of these vanish with the screen they describe. Fixing one in place on the
> current screens is the admin-panel trap above.

**Step 1: "Money by category" — RESOLVED 2026-09-23 by ledger-first.** Home
shows money, so the two things below are now the first two commits of the
build order (see DECIDED). The detail stays here as the record of what is
wrong today. Nothing in the frontend calls `/api/reports` or `/api/expenses`.

1. **The categorizer is rebuilt: the categorizer PR carries it** (extractor enum
   in `expenseCategories.ts`, keywords demoted to fallback,
   `scripts/recategorize.ts` for the backfill, `scripts/categorizerMeasure.ts`
   for the measurement). The backfill ran 2026-09-23: 154 documents in his
   three organisations, all 154 categorized by the model, 0 by keywords, 0 scans
   charged.
   - **MEASURED 2026-09-23, replacing "43 of 47":** on the labelled copies,
     `categorizerMeasure.ts` printed **accuracy 94.1% (95/101)** and **"Other"
     share 6.9% (7/101)**, all 101 from source `extractor_backfill`. Those two
     are the instrument's figures. On the **53 distinct receipts** behind them
     (calculated, counting a receipt right only if every copy is right):
     **50 of 53 right, 6 of 53 stored as Other**, of which 5 are labelled Other
     and 1 (a freight forwarder) is a miss. Re-run, never quote:
     `cd apps/backend && npx tsx scripts/categorizerMeasure.ts scripts/categorizerLabels.json`.
   - **Read these caveats with the number, in this order.**
     1. **The labels were adjudicated by the strategy assistant, not by the
        owner.** He delegated the 53-row spot-check. That is weaker evidence
        than the bar asked for ("spot-checked by him"), and the number carries
        that weakness. One label changed in adjudication (a freight forwarder
        is Transport); three of the assistant's own labels were overruled to
        Other (trade suppliers and unnamed companies are not personal Shopping
        or Office).
     2. **The set is 53 distinct receipts after deduplication**, from 144
        labelled documents: 43 skipped as templates, forms and screenshots (they
        are not receipts and were not counted as misses or as Others), and 101
        receipt copies that repeat heavily (one supermarket receipt ten times).
        Most are stock receipt images, not his own spending.
     3. **Arabic is not covered at all**: the measurement printed
        `arabic: n=0 — NOT COVERED`, because no Arabic receipt exists in his
        accounts (two Arabic documents, an invoice template and a dashboard
        screenshot). Covering it takes new material, outside the categorizer PR:
        he scans fifteen to twenty real Arabic receipts through the app, they
        land in his organisation, and the same two scripts label and measure
        them.
     4. **Identical copies received different categories.** The Walmart
        pet-supplies receipt, five copies: Shopping ×3, Food ×2. The Northwind
        office-supply invoice, three copies: Office ×1, Shopping ×2. That is a
        property of the model on near-identical text, not of the labels, and it
        is recorded as it is: the categorizer is not deterministic across copies
        even at temperature 0. A loop input for the result screen.
   - `expenseCategorizationService.ts` lists `'stationary'` where it means
     `'stationery'`.
   - Its keyword table is Latin-only, while `persistence.ts` passes the
     original-language `rawText`.
   - Run on the nine synthetic receipts in the direction prototypes (2026-09-23),
     it called only the two café receipts Food. The grocery receipt and the
     Arabic bakery came out Other.
2. **A fresh, tested summary query: the ledger PR carries it.** `GET /api/ledger?month=YYYY-MM&tz=<IANA>`
   (`services/ledger/ledgerCore.ts` holds every rule and its evidence; the
   fixture test proves the figures; `scripts/ledgerReconcile.ts` checks them
   against a direct SQL read, read-only). Removed in the same commit, with
   the old wrong reads they carried: (a) and (b) the `monthly_expenses`
   report, (c) `find_upcoming_appointments`, (d) and (e) `/api/expenses/summary`
   with `expenseSummaryService.ts`, and `group_expenses` with the
   `ExpenseCategory` plan filter (both read `EXPENSE_CATEGORY`), plus the rule
   engine's unused `'amount'` fallback. Still open:
   - (f) `sum_expenses` counts every status, `REJECTED` included, unless the user
     asks otherwise, and it counts flagged duplicates and months by upload
     date. So the ask path's "how much did I spend" disagrees with the ledger
     home. **EXPIRY:** it reads the ledger's rules, or the ask path stops
     answering money questions.
   - **Duplicates the rule engine never saw are counted: the re-evaluation
     PR carries the fix; the WRITE waits for the owner's order.** In each
     group of copies (same vendor, same amount as the ledger reads it) exactly
     one COMPLETED or NEEDS_REVIEW copy stays counted, and every other copy is
     flagged. Since the currency-ranking PR, the copy that stays counted is the
     one the owner marked valid while it was not a duplicate, else the one with
     the most specific currency (an ISO code other than USD, then USD, then
     none), else the earliest (`duplicateRule.ts` says why for each condition,
     and why currency still does not decide whether two copies are one
     receipt). Before #243, re-evaluating a group flagged every copy, the first
     included. `scripts/duplicateReevaluate.ts` runs that rule ONLY over the
     owner's three organisations and rewrites `decision` facts only, never on a
     row the ledger does not count by status; dry run by default. Re-run it,
     never quote: the dry run prints the plan, the groups, each group whose
     copies disagree on currency with the copy that stays counted, and the
     ledger before and after. **EXPIRY MET 2026-09-24:** the write ran
     (`--expect=50`, 50 documents, decision facts only) and the dry run, re-run,
     planned 0 changes. One limit it does not remove:
     - **A vendor misread escapes it, and the ledger home shows it.** Rule D
       matches the vendor string exactly, so a copy read as another vendor
       stays counted: the 467.85 MAD receipt has seven copies read as BIM MAROC
       (5), MHAMMADI and UNKNOWN, and still counts three times (two in Feb 2026,
       one in Feb 2024). **A known input to the ledger home:** February 2026
       in `d8b34ee3` reads MAD 935.70 from two rows side by side, same day, same
       amount, different vendor (re-run, never quote:
       `npx tsx scripts/ledgerReconcile.ts --org=d8b34ee3 --month=2026-02 --rows`).
       The screen offers no cue for it: a cue is a duplicate rule by another
       name, and this one has not been ruled on. **Nor can the owner reject the
       extra copy today:** Reject is offered only on a NEEDS_REVIEW document
       (`doc.status === 'NEEDS_REVIEW'` in `DocumentDetailScreen.tsx`), and
       these copies are COMPLETED. **EXPIRY:** a rule for this is ruled on with
       its false-positive cost measured, or the detail screen lets the owner
       reject a counted copy and he does.
   - **Two amounts that look misread, both counted.** Neither is a duplicate;
     each is one document whose extracted amount is probably wrong, and each
     sits on the ledger home as real spend. Re-run, never quote, with
     `ledgerReconcile.ts --org=<prefix> --month=<YYYY-MM> --rows`:
     - `d8b34ee3`, March 2026: a single SAR 19,790.00 receipt whose text
       carries no SAR marker (the 2026-09-24 currency census read its
       `rawText`).
     - `d8b34ee3`, July 2017: a USD row of 80,616.00, most of that month's
       USD 80,714.21.
     **EXPIRY:** each is corrected, rejected, or confirmed as right by the owner.
     - **CLOSED by the currency-ranking PR: "Rejecting an original drops the
       receipt."** Any change to one copy now re-checks its whole group
       (`duplicateGroupRecheck.ts`): an upload or re-extraction whatever its
       outcome, a fix action, a status change, and the stale sweep. Rejecting
       the copy that stays counted hands the count to the next copy, and a new
       upload that outranks it takes the count over. Proved in
       `duplicateCurrencyRank.test.ts` through `updateStatus` and
       `processUploadAsync`.
   - **The amount-correction form says MAD, and the stored correction has no
     currency.** `FixActionPanel.tsx` labels the input `s.madUnit` whatever the
     receipt's currency. The ledger reads a correction in the currency of the
     document's extracted total (8 of the 9 stored corrections re-type that
     total exactly). **EXPIRY:** the form shows the document's currency.
   - **A missing currency is stored as USD: FIXED FOR NEW SCANS by the
     currency-ranking PR, stored rows unchanged.** Until then
     `normalizeCurrency` in `geminiAdapter.ts` answered `'USD'` for no answer,
     for "UNKNOWN", for "Rs" and for `د.م.` (the Arabic dirham sign), and
     stored any other 3-letter string as it came ("RS.", "TVA"). Now
     `normalizeExtractedCurrency` keeps an ISO 4217 code, maps a symbol only
     when it names one currency (`₹` INR, `د.م.` MAD, `د.إ` AED, `ر.س` SAR,
     `C$` CAD, `A$` AUD, with `€`, `£` and `DH` as before), and stores no
     currency for anything else, which the ledger shows on its unknown line.
     "Rs" stores none: INR, PKR, LKR, NPR and MUR all print it.
     - **Evidence that stored USD misplaces money**, from the receipt images
       (read 2026-09-24, then deleted):
       - BRIGHTPATH ANALYTICS 7282.31 is a Montreal invoice printing GST + QST
         and a bare `$`, so CAD. Its three copies are stored CAD once and USD
         twice.
       - Flame Kitchen 290 is a Tamil Nadu bill printing "Grand Total : Rs
         290.00", so INR. Its two copies are stored USD first and INR later.
     - Whether those USD readings came from the adapter or from the model is
       not provable: the model's raw answer is not kept, and the old adapter
       gave USD for "$", "Rs" and "USD" alike. The adapter was a sufficient
       cause; it is not a proven one.
     - Of the owner's 144 amounts, 117 are stored USD and 4 of their texts print
       a USD marker; 63 print only a bare `$` and 50 print neither (one of them
       is the Rs bill). Instrument: from `apps/backend`, inside `SET
       TRANSACTION READ ONLY` with `SHOW transaction_read_only` asserted `on`,
       read the `TOTAL_AMOUNT` fact's `currency` and the document's `rawText`
       for the three organisations, and match `\bUSD\b|US\$` and `\$` against
       the text.
     - **Stored rows are not rewritten.** The duplicate ranking repairs which
       copy of a receipt counts, not a lone copy's currency. **EXPIRY:** a
       stored row's currency is corrected by re-extraction or by the owner, or
       the owner accepts USD on his old test receipts.
   - **A bare `$` is stored as USD.** Ruled 2026-09-24: `$` keeps its USD
     reading in the adapter until the prompt is changed, because storing it
     as none today would put every US receipt, an App Store reviewer's first
     scan among them, on the unknown line. The change: the prompt asks for the
     ISO 4217 code decided from the whole document (a printed code, an
     unambiguous symbol, the country of the merchant's address, tax names such
     as GST/QST/HST, the phone format), and for the printed symbol only when
     the document does not settle it; the adapter then maps a bare `$` to none.
     **EXPIRY:** that prompt change is measured before it merges, on paced
     uploads of the owner's `$` receipts that include non-US ones, read with
     `extractionWatch.ts` and a currency census of the uploaded rows, and
     reported with its population. It needs Gemini calls, so it needs the
     owner's order.
   - **A note on a kept duplicate un-keeps it.** The ledger counts a flagged
     duplicate once its latest `review_action` is `marked_valid`.
     `applyFixAction` in `documentController.ts` replaces `review_action` on
     every action, and a flagged row still offers "Save note"
     (`FixActionPanel.tsx`), so a note added after "Mark valid" drops the row
     out of the total again, silently. **EXPIRY:** keeping is recorded in a
     fact no other action overwrites, and the ledger reads that fact.
   - (g) `queryPlanner.ts` pushes `DocumentFact.factType` and `DocumentFact.key`
     filters on `sum_expenses`, and the executor drops them.
     That is harmless only because the executor re-applies the same literals.
     Honouring them would narrow which documents qualify, and move a money
     figure. `queryPlanContract.test.ts` sends readers here for this with
     "see WORK-QUEUE.md"; this file never carried it before 2026-09-23.

**If home does not show money:** delete those routes, and the `rep1`–`rep3` /
`repDesc1`–`repDesc3` strings. **EXPIRY:** the direction decides.

**Step 2: the system**

- **"Mobile type scale (<md)" flattens `font-black` on every phone.**
  - The block with that heading in `apps/frontend/src/index.css` sets
    `.font-black { font-weight: 700; }` inside `@media (max-width: 767px)`. So no
    screen has a heaviest weight on a phone, and on the landing's pricing cards
    the price ties the plan name.
  - The rule exists because heavy, wide-tracked uppercase wrapped letter by
    letter on phones. That reason has to be answered, not only the symptom.
  - `landingTextContrast.test.tsx` derives floors from this block, so changing it
    moves the finished landing's floors: re-measure the landing when it changes.
  - **EXPIRY:** the new type scale replaces the rule deliberately, or keeps it and
    says why in its own comment.
- **Step 3: the landing pin. The new system must not repaint the finished
  landing.**
  - The landing is finished, but it still reaches token utilities: 43 at the
    2026-09-15 count. Re-count against `tailwind.config.cjs` before relying on
    that number.
  - A system that changes `:root` token values repaints the landing in light
    mode, and `landingLightPin.test.tsx` forces the pin to follow `:root` byte for
    byte.
  - **So give the app new tokens, or convert the landing to literals first, and
    delete the pin LAST, after a measurement, never on a prediction.**
  - Measured 2026-09-13: migrating the backgrounds alone strands the foregrounds,
    with text at 1.00:1 and 44 of 62 text nodes below floor in dark. Backgrounds
    and foregrounds move together.
  - The migration skips the hero mock. `LandingScreen.tsx` quotes this ruling
    word for word, so it is kept whole on one line:
    "excluding the hero mock, which #214 made deliberately literal because it is a PICTURE of the product".
    It is about the token migration only, never a contrast exemption.
  - `tokenLiteralPairing.test.ts` reads one class string at a time, so it cannot
    see a flipping background paired with a literal foreground on a child
    element. That is exactly this migration's hazard: measure it in a browser.
  - **EXPIRY:** the system lands and the landing measures unchanged, or the pin is
    deleted after a measurement.
- **The contrast instruments' "no published figure" guard is behind.** The
  `PUBLISHED` list in `contrastSweepInstrument.test.ts` lacks four figures
  published since #231: 17.8525, 6.9627, 1.0463 and 5.9146. (1.0955 is present,
  as the control.) It matters again because the sweeps become the hygiene gate
  on new screens. **EXPIRY:** the first commit that sweeps an app screen appends
  them.

**Step 3: the loop**

- **The reading state.** Today three things go wrong:
  - After a retry, the detail screen goes quiet. `POST /:id/reextract` sets
    `PROCESSING`, but `DocumentDetailScreen.tsx` has no `PROCESSING` branch, and
    `trackUpload` is called only from `CaptureSheet.tsx` and `UploadModal.tsx`,
    so the tray is never told.
  - Each upload blanks the whole dashboard into skeletons twice. `Layout.tsx`
    raises `refreshCount` on dialog success and again when processing settles,
    and `DashboardScreen.tsx` calls `fetchData(true)`, which replaces the screen.
    Nothing calls `fetchData(false)`.
  - The tray says `processingDone` ("Processing complete") for a `NEEDS_REVIEW`
    document too.
  - The rule for the new state: a document being read shows it, however the read
    started, and the settled state names its verdict.
- **What a finished upload shows.** The confirmation panel in `UploadModal.tsx`
  (Done / Manage Files) sits inside the `files.length > 0` block, and has been
  unreachable since #236. Redesign it or delete it.
- **The result screen.** Decide these together:
  - The decision banner is success-tinted beside a "Needs review" status chip.
  - The confidence pill reads "99% match" on almost every row: `TOTAL_AMOUNT` had
    one distinct confidence, `0.99`, across 199 rows (2026-09-11). The mobile
    search card already omits it.
  - The facts table is a three-column `<table>` with headers, usually for two
    rows.
  - The `noFacts` empty state became reachable with #206 and has not been read
    since.
  - Where `category` goes, if the categorizer earns a place, is a layout decision:
    category is a derived judgement, not something read off the page.
- **How often a clean read says "Needs review".**
  - `isWeak` in `persistence.ts` sends a document to review when any of these
    holds (corrected 2026-09-23; an earlier version of this list named only
    three cases):
    - confidence below `CONFIDENCE_THRESHOLD = 0.98`;
    - no date, no amount, or no facts at all;
    - fewer than two of the English anchor words (`total`, `subtotal`, `tax`,
      `vat`, `amount`, `item`, `receipt`, `invoice`, `cash`, `card`, `payment`,
      `merchant`, `store`), matched as substrings of the read text;
    - a template word: "template", "sample", "example", "your business name",
      "lorem ipsum";
    - two or more multi-document markers (invoice, receipt, subtotal, total, tax,
      thank you) that each appear more than once, counted as substrings, so
      "subtotal" also counts as a "total".
  - **Read 2026-09-23: the anchor words are English-only, so a receipt printed
    only in Arabic always lands in "Needs review", however well it was read.**
    Run on the nine synthetic receipts in the direction prototypes, the gate
    flagged four, and three of those were read correctly:
    - an Arabic bakery receipt, with no anchors;
    - a terse fuel receipt, with no anchors;
    - a French pharmacy receipt, with only "total".
  - The 2026-09-23 paced run sent 2 of 4 uploads to review. Both were the invoice
    test image, whose text contains `example` and repeats `invoice` and `total`.
  - How often a real receipt trips it is unmeasured. Recomputing `isWeak` over the
    historical corpus fails its own control, so measure only on rows the current
    code wrote.
- **Ingestion durations: the wait the reading state is designed around.**
  - The 2026-09-23 paced run took 8.4 s, then 9.9–16.3 s.
  - Every line of `processUploadAsync` in `ingestionService.ts` is a marker with
    no elapsed time, while `queryExecutor.ts` already records `executionTimeMs`.
  - Per-stage durations say which part can shrink. One candidate is the
    `isSingleDocument` validation call: a separate Gemini call on every document,
    before extraction.
- **Row-lock contention (UNCONFIRMED, DORMANT since 2026-09-23).** Ledger-first
  scans one receipt at a time, so its trigger does not fire. It wakes only if
  batch capture is ever added.
  - Every persist increments `scanCount` on the same `Organization` row, so one
    person batch-scanning serialises on that lock.
  - It was seen once: the tenth upload of a 5-second-cadence run took 14.0 s, and
    its persist threw.
  - **Settle it before batch capture ships:** ten uploads at 5 s against ten at
    30 s, reading the class recorded in `delivery_error`. Failures that track the
    cadence mean contention.

**Step 5: first run**

- **The confirmation link leaves the app.**
  - `supabase.auth.signUp({ email, password })` in `AuthScreen.tsx` passes no
    redirect, so the link goes to the Site URL configured in Supabase. When last
    recorded, that was a web page, so a first-time iOS user has to find their
    own way back to the app.
  - The direction decides between a code typed into the app and a link the app
    catches.
  - One signup in 2026-09 never confirmed its email (read-only, 2026-09-23). That
    is n=1: a pointer, not a finding.
- **Where a confirmation email comes from.** Ask Supabase → Authentication, not
  this file:
  - SMTP Settings: custom SMTP through Resend was set up during the closed test,
    to escape the built-in sender's cap.
  - URL Configuration: the Site URL was moved off `http://localhost:3000` during
    the same test.
  - Read both there before changing the confirmation path.
- **The top bar**, observed in the owner's screenshots on 2026-09-11 and never
  measured. In the Arabic UI at phone width, "Scan & Action" is in Latin script
  beside Arabic copy, and a camera button appears twice. Decide both when the
  shell is redrawn.

## KEPT OUTSIDE BOTH TRACKS

### INVARIANT — native (Android and iOS) anti-steering (do NOT violate)

A native build must **never** contain pricing, external-payment links, or any
copy or call to action that steers the user toward paying for PRO outside the
app. **Reflect entitlement state only**: "Pro Active", "Free Tier", the free scan
limit as information. Subscriptions are sold only on the web (Paddle), because
the Morocco-based developer account cannot register as a Google Play merchant.
This is also Apple 3.1.3(f)'s condition, word for word (APPLE TRACK), and
`isNativePlatform()` covers iOS.

- The `isNativePlatform()` gate in `PaywallModal.tsx` is the single most
  important guard. **Keep it intact.**
- On native, the Settings billing card and the scan-limit and multi-document
  triggers in `CaptureSheet.tsx` and `UploadModal.tsx` show neutral status. The
  strings are `freePlanLimitReached`, `freePlanSingleDoc` and `proAutoUnlock`.
- Any new Pro or upgrade surface goes behind `!isNativePlatform()`.
- `/privacy` and `/refund` mention Paddle and subscription cancellation, and no
  in-app surface links them. **Apple 5.1.1(i) now requires an in-app privacy
  link** (APPLE TRACK), so revisit that copy before linking it.

### Other kept items

- [ ] **Welcome email (dormant).** It is built, and held by two switches:
  - `MAIL_POSTAL_ADDRESS` must be set, because `mailer.ts` fails closed without
    a physical address (CAN-SPAM requires one).
  - `WELCOME_EMAIL_ENABLED` must be `true` (`welcomeEmail.ts`).
  - Both are Railway variables, and their values are not recorded here. It
    blocks nothing in this stage.
  - **EXPIRY:** new signups are wanted.
- [ ] **Real in-app purchase (RevenueCat): DEFERRED until there are users.** v1
  ships under 3.1.3(f), with no purchase, so this is not on the Apple track.
  - When it is built, it goes through `applyEntitlementChange`
    (`apps/backend/src/services/entitlement/`), the path the Paddle webhook
    uses. That path takes a row lock, guards against out-of-order events, and
    never writes `planOverride`.
  - Set `app_user_id` to the Supabase user id.
  - Give it a separate webhook with its own signature check. It maps each event
    to a per-source ACTIVE/INACTIVE status, never directly to a plan:
    - `INITIAL_PURCHASE` / `RENEWAL` / `PRODUCT_CHANGE` → ACTIVE.
    - **`CANCELLATION` turns auto-renew off and nothing else.** Access continues
      to the period end, so the source stays ACTIVE. **Never map CANCELLATION
      to FREE.**
    - `EXPIRATION` → INACTIVE. This is the real downgrade point.
    - `BILLING_ISSUE`, grace and dunning → stay ACTIVE.
  - `derivePlan` takes the maximum across sources, so Paddle and RevenueCat rows
    coexist.
  - An earlier mapping in this file sent CANCELLATION, EXPIRATION and
    BILLING_ISSUE to FREE. That was revenue-damaging.
  - **EXPIRY:** the owner decides to sell inside the iOS app.
- [ ] **Orphaned app rows: a privacy question with no decision.** Kept 2026-09-23,
  because deleting it would close it silently.
  - Four `public."User"` rows have no auth identity, and two of them hold two
    documents each that no living account can reach.
  - How they arose is not recorded, except for `1e1c8482`, which is the
    project's own (`docs/PRODUCTION_DATA_FIX_2026-09-04_ORPHAN_1e1c8482.md`).
  - The query:
    `SELECT u.id FROM public."User" u LEFT JOIN auth.users a ON a.id = u.id WHERE a.id IS NULL`.
    Its control, `SELECT COUNT(*) FROM auth.users`, must be non-zero, so that an
    empty result is real. It returned four rows on 2026-09-11.
  - Two uses:
    1. The owner decides retention of those documents under the privacy policy.
    2. It is the check behind the account-deletion verification in APPLE TRACK.
  - The standing rule: never remove an auth identity while leaving its
    `public."User"` row behind. See `IdentityEmailConflictError` in
    `authMiddleware.ts`, and §6 of `docs/FIRST_CUSTOMER_RUNBOOK.md`.
  - **EXPIRY:** the owner rules on retention, and a TestFlight deletion leaves the
    count unchanged.
- **Android release facts nobody would think to search history for.**
  - The package is `com.scanaction.app`.
  - Play App Signing was accepted at the first upload, so Google holds the app
    signing key (Play Console → App integrity).
  - The upload key is at `D:\keys\scan-action-upload.jks`, with `key.properties`
    untracked and gitignored.
  - What Play holds is read in Play Console, on every track including drafts,
    never here. Uploading a bundle consumes its version code permanently.
- [ ] **LOCAL DEV: the local `SUPABASE_SERVICE_ROLE_KEY` is a disabled legacy
  key.**
  - Supabase disabled this project's legacy `anon` / `service_role` keys on
    2026-06-12.
  - A local backend's `supabase.auth.getUser` returns
    `401 {"message":"Legacy API keys are disabled"}`, so every authenticated route
    fails with 401 locally, which reads like a broken login. Production is
    unaffected.
  - **Fix:** replace the local value with a current secret key from the Supabase
    dashboard.
  - **EXPIRY:** someone runs the backend locally against auth.

## STANDING RULES — not tasks

1. **Read before you claim.** A filename, a call path or a code behaviour you have
   not read this session is a hypothesis, including one in your own earlier
   instructions.
2. **No estimate without its population.** An extrapolation is a claim about a
   population. Write the population next to it, or measure the real figure
   instead.
3. **An expiry that only the blocked work can satisfy is a deadlock.** Read the
   expiry aloud and ask who can satisfy it. If the answer is "the item itself",
   rewrite it.
4. **Before writing into anyone else's account, say what they will see.** State
   what changes in their view of their own data, and whether the product
   explains it. This is a precondition beside the safety checks, not a
   follow-up.

The incidents behind each rule are in git, in the RECURRING FAILURE and recovery
sections of the file at `9751e813`.

## REMOVED 2026-09-23 — titles the tree still cites

> A citation into this file must never dead-end. A search of the live board for a
> removed title returns a clean zero, which reads exactly like "never existed".
> For the full text: `git show 9751e8139e2acd844c3e32eee85fe4bf74716917:WORK-QUEUE.md`.

- **"there is NO re-extraction path anywhere in the tree"**, cited in
  `documentController.reextract.test.ts`. Closed 2026-09-09 when
  `POST /:id/reextract` shipped; removed as history.
- **"`uploadController.ts` now routes its three error-log sites through `formatErrorForLog`"**,
  cited in `uploadController.errorLog.test.ts`. Done 2026-09-06; removed as
  history. The test file itself carries the item's
  reachability correction and the `LIMIT_REACHED` trap.
- **"the closing headline orphans its last word"**, cited in `LandingScreen.tsx`.
  **CLOSED 2026-09-23 as ACCEPTED.** That is the ruling its expiry asked the copy
  pass for: the owner declared the landing finished.
- **The published contrast figures and the card-fill observation** that
  `contrastSweep.browser.js`, `contrastShapeSweep.browser.js` and
  `contrastSweepInstrument.test.ts` describe as "on the board". They are in the
  closed DESIGN PASS entries at `9751e813` and in their PRs. The instruments do
  not read this file.
