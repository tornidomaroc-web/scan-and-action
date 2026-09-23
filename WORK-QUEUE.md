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
  3. Design step 1, direction prototypes, with no repository change. Built
     2026-09-23; waiting on his choice.
  4. The iOS platform and a CI → TestFlight pipeline, in one small PR, so every
     later design commit is judged on his iPhone. Unblocked: it waits only for
     an order.
  5. Design steps 2 to 7.
  6. Submission, once design steps 1 to 5 are done and every APPLE TRACK blocker
     is closed.

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
  it on his iPhone. Unblocked: the account is ready.
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

- [ ] **1. Direction: prototypes before any repository change.** BUILT
  2026-09-23; waiting on the owner's choice.
  - **Three phone-size prototypes, one per structure:** Capture-first,
    Ledger-first and Inbox-first.
    - They are private claude.ai pages titled "Scan & Action Capture", "Scan &
      Action Ledger" and "Scan & Action Inbox" (find them with the Artifact
      tool's `list`).
    - The look is identical across the three: one stylesheet, one engine and one
      data set, proved by hash at build.
    - They differ only in what the app opens to, what a scan turns into, and what
      brings him back.
  - **Each runs the same script, in Arabic and in English:**
    1. Scan four synthetic receipts: clean, crumpled, Arabic, and a repeat.
    2. Ask what was spent on food this month.
    3. Deal with what needs him.

    The capture is simulated.
  - **The honesty rule they follow: nothing unbuilt appears unframed.**
    - Anything not built or not measured sits in a dashed frame.
    - One tap on the frame shows what today's code does with the same receipts.
    - That text was computed by running the real categorizer and a guarded copy
      of the review gate on those receipts.
  - **Who chooses:** the owner, on his iPhone. Taste is his, and the best in the
    market comes from choosing between different pictures, not from iterating
    one.
  - **Content:** synthetic receipts only (CONSTRAINT).
  - **References, chosen for the loop:** Apple's document camera in Notes and
    Files, Microsoft Lens, Expensify's SmartScan, and Apple Wallet's transaction
    list.
  - **Decides:**
    - What home is for, which settles "Money by category".
    - Whether capture is batch, which triggers "Row-lock contention".
    - Then a second round, on the chosen structure, decides the icon and palette.
      Colour is held still in this round so that the choice is about structure.
      This replaces the old logo item: the icon is the App Store's first pixel
      and a required asset, and the brand comes before the system.
  - **EXPIRY:** the owner has chosen a direction.
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
- [ ] **4. Home**, per the direction.
- [ ] **5. First run.** Login and signup, an email confirmation that returns to
  the app, the icon and splash, every "coming soon" removed, `ProfileScreen.tsx`
  deleted, and the in-app privacy link.
- [ ] **6. The rest.** Documents and search, the review queue, settings with
  account deletion reachable, and the web-only paywall.
- [ ] **7. Store screenshots**, taken from the finished UI.

### Inputs, filed under the step that redraws them — not a checklist

> Most of these vanish with the screen they describe. Fixing one in place on the
> current screens is the admin-panel trap above.

**Step 1: "Money by category"**

**If home shows money, two things come first.** Nothing in the frontend calls
`/api/reports` or `/api/expenses` today.

1. **The categorizer is rebuilt.** As of 2026-09-11:
   - It answers `Other` for 43 of the 47 documents it has categorized. The `0.5`
     beside that answer is its hardcoded no-match return, not a measurement.
   - `expenseCategorizationService.ts` lists `'stationary'` where it means
     `'stationery'`.
   - Its keyword table is Latin-only, while `persistence.ts` passes the
     original-language `rawText`.
   - Run on the nine synthetic receipts in the direction prototypes (2026-09-23),
     it called only the two café receipts Food. The grocery receipt and the
     Arabic bakery came out Other.
2. **A fresh, tested summary query.** **Never revive the old ones as one-line key
   swaps:** turning an empty report into a populated wrong one ships a new wrong
   number. The known wrong reads:
   - (a) `monthly_expenses` reads `EXPENSE_CATEGORY`, which is never written; the
     categorizer writes `category`. Corrected, it would silently drop every
     document with no category fact, and whole currency lines with them.
   - (b) `monthly_expenses` has no date filter, despite its name.
   - (c) `find_upcoming_appointments` reads `APPOINTMENT_DATE`, which nothing
     writes.
   - (d) `expenseSummaryService.ts` reads fact key `'amount'`, which
     `normalizeFactKey` can never emit, so every figure it returns is zero.
   - (e) Its `merchantSpend` is a plain object, so a merchant named `__proto__`
     or `constructor` silently loses its spend.
   - (f) `sum_expenses` counts every status, `REJECTED` included, unless the user
     asks otherwise.
   - (g) `queryPlanner.ts` pushes `DocumentFact.factType` and `DocumentFact.key`
     filters on `sum_expenses` / `group_expenses`, and the executor drops them.
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
- **Row-lock contention (UNCONFIRMED).**
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
