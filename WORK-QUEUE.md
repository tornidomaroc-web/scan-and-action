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
  4. **DONE 2026-09-28: the iOS platform and the CI → TestFlight pipeline.**
     Four PRs: #260 (`d7ac2519`, the platform and the workflow), #261
     (`dade606f`, a wrong signing fix), #262 (`27e9ac7a`, its revert), #263
     (`1428dd2c`, purpose strings and the privacy manifest). Build 1.0.0 (5)
     from run 36366768462 passed Apple processing, joined the internal group
     "Internal" automatically, and is installed on the owner's iPhone from
     TestFlight. Every later design commit is judged there. The pipeline's
     hardening (job isolation, pinned actions, pipefail) is the PR of
     2026-09-28 that records this line; see APPLE TRACK.
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

## NOW 2026-09-25 — the ~2 s wait is fixed; next, Detail then Search, from zero

**The owner could not judge the redesign (#246) on his iPhone: Home and Queue
sat on their skeletons.** Measured from his signed-in browser against
production, every authenticated route answered in 1.75 to 2.5 s to first byte,
whatever it returned. Detail and numbers under "Every authenticated request
cost 1.75 to 2.5 s" in the DESIGN TRACK, Step 3 inputs. **Ruled order, not to
be reshuffled:**

1. **The perf PR** (#247): the per-token auth context cache and
   request timeouts, with the screens naming a timeout instead of showing grey
   blocks. Code only.
   **DONE:** merged as #247 (`1d569e9`).
2. **The region move.** **DONE 2026-09-25, by the owner:** the backend runs in
   **EU West (Amsterdam, `europe-west4`)**, one replica; `us-east4` was removed.
   Nothing else changed.
   - **The database** is Supabase in **AWS eu-west-1 (Ireland)**, reached
     through the Supavisor pooler: runtime `DATABASE_URL` on port 6543
     (transaction mode, `pgbouncer=true`), `DIRECT_URL` on the same pooler,
     port 5432 (session mode). This is read from `apps/backend/.env`, the local
     copy: Railway's own variables are dashboard-only.
   - **The measured effect:** the Railway edge-to-backend leg fell from ~130 ms
     to 55 to 64 ms, and a database query from the backend from ~280 ms to
     ~80 ms. Numbers are under "Every authenticated request cost 1.75 to 2.5 s"
     (DESIGN TRACK, Step 3 inputs).
3. **The owner judged #246 on his iPhone, 2026-09-25, at `81a2b6d`.**
   - **Approved:** Home, Queue, Activity, Settings and the tab bar.
   - **NOT approved:** Search and the receipt Detail screen, especially Detail's
     top part above the receipt image. His words: they "do not reach the level
     of a product people pay for", are "complicated and disorganised", their
     "design is not modern", and they "look as if they belong to another app".
   - #246 gives those two screens the shared surfaces only. Its diff leaves
     their structure and copy as in production.
4. **#246 merges** with that recorded.
5. **The Detail PR: DONE.** Approved by the owner on his iPhone at
   `8dbda49` on 2026-09-25 ("simple and good"), merged as #248 (`cc8b0c9`).
6. **Next: three redesigns, each in its own PR and its own judgement on the
   owner's phone.**
   - **Search**, planned under step 6.
   - **Home**, rejected by the owner on 2026-09-25 although approved at #245
     (step 4).
   - **Login**, rejected by the owner on 2026-09-25 (step 5).
   - **ORDER RULED by the owner on 2026-09-25: Search, then Login, then
     Home.** Each is its own PR.
     1. **Search first. DONE:** approved by the owner on his iPhone on
        2026-09-26, with his real data, at `4796d30`: September 2026 read
        USD 2,989.92 from 5 receipts, as the ledger does; "Pizza" read
        USD 750.00 from 1 receipt, its copies under "Found, not counted".
        One defect he found there (every uncounted row wore the Other tile)
        was fixed in the same PR at `1032852`, proven by tests that fail on
        `4796d30`. The backend route went first as #251 (`7e3172e`), so the
        new screen never reached a backend without it; the screen merged as
        #250 (`4c6772a`). Board item (f) closed with it (Step 1 inputs).
     2. **Login second. DONE:** approved by the owner on his iPhone on
        2026-09-26 and merged inside #255 (see "The visual language, Login,
        the landing" below). #254, the first Login redraw, was closed into
        #255, which carried its commit.
     3. **Home last.** The owner gives his reasons first. **Home is not to be
        started before he has.** They are still not recorded (2026-09-26).
        Home now wears the approved visual language (#255); that is a restyle,
        not the redraw this item waits for, so its EXPIRY is not met.

**The visual language, Login, the landing, Detail without the tab bar and the
Queue card: APPROVED and MERGED 2026-09-26.** The owner judged all of them on
his iPhone at the #256 preview (head `1868ea5`), in Arabic and English.
- **#255, merged as `402ae72`:** the HorizonX "Trading Dashboard" kit's visual
  language across the app (`styles/tokens.css`, `components/ui/`): dark page
  `#0F1014`, accent `#3563F0` under white text, pill tab bar with the scan
  button at its centre, 96 px web rail. Login redrawn in a new anatomy (the
  brand in the accent card, a Sign in / Create account switch, pill fields),
  with #254's behaviour and tests. Detail draws no tab bar on a pushed screen
  and its Approve / Reject bar sits above the safe area. The Queue card is the
  receipt as Detail shows it (merchant, ledger amount, the receipt's date, one
  status). A document never wears the Other tile: the backend's fallback
  "Other" is read as no category (`wornCategory` in `lib/documentCategory.ts`).
- **#256, merged as `5836fba`:** the public landing rebuilt on the structure of
  HorizonX's "Vantro" landing (read from its public preview; nothing
  downloaded), in the app's language, dark first, en / fr / ar. Its mockups
  are the app's own screens labelled as an example; the price is written once
  each; no dash in any landing string (`landingCopyDashes.test.ts`).
- **No raw kit file is in the repository.** The decoded kit and the harness
  live in `D:\RAGHAD JAD\horizonx-kits\`, outside it.
- **Neither PR touched the backend:** `git rev-parse <sha>:apps/backend` gives
  the same tree id before #255 and after #256.

**NEXT, ruled 2026-09-26: the iOS platform and the CI → TestFlight pipeline
(THE STAGE, item 4).** Every remaining design step is now blocked on it or
judged around it: the native scanner and the reading state (DESIGN TRACK
step 3), the icon and splash (step 5), the store screenshots (step 7), and
submission itself. Everything the owner has judged so far ran as a web page
in Safari, which cannot show a native camera, a splash screen or the App
Store's review build. Home waits on the owner's reasons whatever comes next,
so it cannot be the next thing started. **The one input is the owner's:** an
App Store Connect API key (Issuer ID, Key ID and the `.p8` file), created
signed in to his Apple account, then stored as Actions secrets. No Apple
credential is configured today; ask `gh secret list`. **EXPIRY (met
2026-09-28):** a CI run on `main` uploads a build that installs from
TestFlight on his iPhone. Build 1.0.0 (5) did; THE STAGE item 4 has the PRs.

**Error copy that blames the connection when the connection is fine: OPEN on
three screens (recorded 2026-09-26).** Search showed "Connection interrupted"
for a `404` from a backend without its route. #250 fixed Search only:
`lib/requestErrors.ts` tells no response (a rejected fetch or a timeout) from
a status, and only the first says "connection". The same mislabel remains on:
- **Home:** `title={locked ? s.accountLockedTitle : s.connectionError}` in
  `LedgerScreen.tsx`. Every failure, a `500` or a `401` included, is titled
  "Connection interrupted".
- **Queue:** `s.queueFetchError` in `ReviewQueueScreen.tsx`. The title is
  neutral, but the message tells the user to check the connection for every
  failure.
- **Overview:** `setError(s.dashboardConnectionError)` and the same
  `s.connectionError` title in `DashboardScreen.tsx`. When both of its calls
  fail, for any reason, it says it could not connect.
- **Not affected:** Detail (a timeout alone mentions the connection).
- **The fix is Search's:** the service throws `HttpStatusError` or
  `NetworkError` through `fetchOrNetworkError`; the screen asks
  `isConnectionFailure`. Home's belongs to the Home redesign; Queue and
  Overview can go in any small PR.
- **EXPIRY:** no screen says "connection" for a response that arrived.

**Prisma `relationJoins`: REJECTED 2026-09-25.** It cut the review, detail and
ledger reads from 4 statements to 1, but it is a preview feature (since 5.7.0,
still preview on the installed 6.19.2). Enabling it makes `join` the default
for EVERY top-level relation query in the backend: eleven call sites,
`exportCsv`, the ask path and billing's `resolveBillingOrg` among them, not
only the three it was meant for.
- **The evidence it is equivalent covers today's rows only.** Responses were
  byte-identical, and `ledgerReconcile.ts` found 0 mismatches over 161
  documents in 42 months.
- **Nested arrays have no guaranteed order** under either strategy, and facts
  are read with `find` by key.
- **The region move removes most of its value.** Four statements at ~20 ms is
  80 ms.
- **If the three reads still matter after the move,** write them as raw SQL
  rather than flip a global flag.

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
- **ATT is moot for the product, not for the binary.** App Tracking
  Transparency was on this list only for ads, and ads left the plan on
  2026-09-23. But `Info.plist` carries `NSUserTrackingUsageDescription` since
  #263, because `@capgo/capacitor-social-login` links the Facebook SDK by
  default and Apple's scan reads the linked code. Removing it is a submission
  blocker below.

### Blockers this file never had

- [x] **The iOS platform and the TestFlight pipeline: DONE 2026-09-28.** Build
  1.0.0 (5) is installed on the owner's iPhone from TestFlight. What it took,
  each with what was read:
  - **The repository:** `apps/frontend/ios` is the Capacitor 8 SPM template
    (#260 = `d7ac2519`). `.github/workflows/ios-testflight.yml` archives,
    signs and uploads on `macos-26` (Apple: uploads must be "built with Xcode
    26 or later" since 2026-04-28), on push to main touching `apps/frontend/**`
    or the workflow file, and on manual dispatch, never on pull_request.
  - **Signing:** API-key automatic signing, no certificate or profile in
    secrets. Secrets `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_KEY_P8` live in the
    GitHub Environment `testflight`, restricted to deployments from `main`
    (`gh api repos/{owner}/{repo}/environments/testflight` shows the policy,
    `gh secret list --env testflight` the names). The key has the Admin role.
  - **The archive signs for DEVELOPMENT and the export re-signs for the App
    Store.** Run 36355312731 (2026-09-27): "Your team has no devices from
    which to generate a provisioning profile". #261 forced `Apple Distribution`
    on the target; run 36355938894: "App has conflicting provisioning
    settings. App is automatically signed for development, but a conflicting
    code signing identity Apple Distribution has been manually specified".
    #262 reverted it; `iosPlatform.test.ts` forbids the override.
  - **Recorded facts about the owner's Apple account, both load-bearing, do
    not remove:** **CORRECTED 2026-10-01:** there is no single Development
    certificate. A hosted runner keeps no private key, so every run's
    automatic signing creates a new one, all named "Created via API", and
    Apple caps them at ten. Run 13 (36789875056, the scanner merge, 2026-09-30
    23:15Z) failed its archive with "Your account has reached the maximum
    number of certificates" and "No profiles for 'com.scanaction.app'", 45
    minutes after run 12 had succeeded and made the tenth. Read through the
    ASC API with the owner's local Admin key (2026-10-01): 10 DEVELOPMENT
    certificates expiring 2027-09-27 to 2027-09-30, 0 profiles (Xcode-managed
    profiles are not listed), one app and one bundle id on the team
    (`com.scanaction.app`; KnowFlow is not on it). The owner approved
    revoking all ten; done through the API, count 0 after; revocation does
    not touch builds already on TestFlight, which Apple re-signs at upload.
    **The durable fix** (the PR recording this): the signing job, after the
    key is placed, deletes every DEVELOPMENT certificate named "Created via
    API" that is older than six hours (age read from expirationDate minus one
    year, since Apple gives no created date and names every API-made
    certificate the same), so a certificate that a run in progress on this
    team may be using is never touched, whichever project the run belongs
    to. Cost: the cap returns only if more than ten runs start within six
    hours across the team. No certificate or .p12 becomes a secret. The sweep
    warns and continues on an API failure; the archive is what fails a run.
    Instrument for the state: `GET /v1/certificates` with a JWT from the key.
    **The sweep's first execution is the run after this PR merges;** the
    `testflight` environment deploys from `main` only, so no pull request can
    run it. Devices holds the owner's iPhone, "Abo Jad iPhone", iPhone 15,
    identifier `00008120-00060CC93A72201E`, registered 2026/09/28; the
    development profile cannot exist without it. The Distribution certificate,
    the App Store profile and the development profile for `com.scanaction.app`
    are what the console shows; read it there, this file does not track them.
  - **Purpose strings:** build 4 (run 36357884582) was rejected in processing,
    ITMS-90683, missing `NSPhotoLibraryUsageDescription`. #263 added the five
    keys every linked plugin can reach (camera, photo library read and add,
    microphone, tracking) in `Info.plist`, localized in `en`, `fr`, `ar`
    `InfoPlist.strings`, and the app's `PrivacyInfo.xcprivacy` (UserDefaults,
    `CA92.1`, for the social login plugin that ships no manifest). The test
    derives the keys from the plugin sources. Build 5 passed processing.
  - **Build numbers:** `CFBundleVersion` = the workflow run number (6 is
    next); `CFBundleShortVersionString` = `MARKETING_VERSION` 1.0.0 in the
    Xcode project, changed only by PR. `manageAppVersionAndBuildNumber` on.
  - **Nothing can be submitted from it:** `ExportOptions.plist` sets
    `testFlightInternalTestingOnly`, so every build it uploads "cannot be
    distributed via external TestFlight or the App Store". The submission
    build is a later PR that removes that key, after the blockers below.
  - **Automatic distribution works:** build 5 joined the internal group
    "Internal" on processing with nobody clicking (the owner, 2026-09-28).
  - **Hardened 2026-09-28 (the PR recording this):** two jobs, the Admin key
    never on a runner that has run npm (`web` builds and syncs with no
    environment secret and hands an artifact to `testflight`, which has no
    checkout, no setup-node, no npm and runs only xcodebuild); every action
    pinned to a full commit SHA with the release as a comment, moved only by
    Dependabot PRs (`.github/dependabot.yml`); `set -eu -o pipefail` with the
    output filter wrapped, so a failing xcodebuild fails its step. Three
    describes in `iosPlatform.test.ts` pin each rule; all failed against the
    previous workflow.
  - **What runs while the key exists (the owner's objection, 2026-09-28,
    upheld):** Swift packages are resolved and fetched, and their manifests
    evaluated, in a step BEFORE the key is written; then, still without the
    key, every fetched `Package.swift` is scanned and the job fails if any
    declares a build tool plugin or a macro (none does; audited 2026-09-28
    across capacitor-swift-pm, ion-ios-camera, facebook-ios-sdk,
    GoogleSignIn-iOS, AppAuth-iOS, GTMAppAuth, gtm-session-fetcher, Alamofire
    and the five Capacitor plugins); the archive runs with
    `-disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile`
    and never `-skipPackagePluginValidation` or `-skipMacroValidation`. A
    manifest is Swift code SwiftPM runs under `sandbox-exec` with
    `(deny default) (allow file-read*)` and no network (`Sandbox.swift`,
    swiftlang/swift-package-manager): it can read what the runner user can
    and leak only through its own output, so it runs while there is nothing
    to read. Residual: a manifest that misses SwiftPM's cache is re-run
    during the archive, sandboxed; the archive step prints the count of
    manifest cache files touched (0 expected).
  - **Fixed versions: DONE 2026-09-30 (the PR recording this).**
    `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`
    is committed: eleven pins, taken from artifact
    `package-resolved-5454f465...` of run 36693536724 (build 11), sha256
    `3a4d8dc1...24a20`, byte-identical to build 10's artifact (run
    36644629023), and its eleven identities are the eleven checkouts that
    run's signing job listed. The signing job's resolve step carries
    `-onlyUsePackageVersionsFromResolvedFile` and a `cmp` proving the file
    left the step unchanged; `ios-audit.yml` runs the same strict resolution
    on a pull request before its build. **Its `paths` are the iOS project,
    `capacitor.config.ts`, `patches/`, `package.json` and the lock file only
    (read 2026-10-04): a pull request that changes web code alone runs no
    simulator smoke test, and nothing on the PR says so. Dispatch it by hand
    on such a branch: `gh workflow run ios-audit.yml --ref <branch>`, then
    `gh run list --workflow=ios-audit.yml --branch <branch>`.** **When a plugin change moves the
    package graph,** the audit fails, resolves again without the flag and
    prints the new file in its log: commit that. An upstream release can no
    longer move the build without a commit here.
  - **Still tag-pinned, deliberately:** `ci.yml` and
    `password-policy-drift.yml`; they hold no Apple secret, and editing
    `ci.yml` risks every merge, so they are a separate change.
  - **A failed run touches nothing:** main, Railway and Vercel are unaffected;
    a failed upload consumes no build number. Retry with "Run workflow"; fix
    by PR.
- [x] **Placeholder text that 2.1(a) forbids is reachable today. CLOSED
  2026-09-30 by #271 (4951b2c2, TestFlight build 10).** The overview's two
  `dataComingSoon` sites became `overviewChartEmpty` and `overviewStatusEmpty`
  (copy that says what the widget will show and what starts it, en/fr/ar); the
  key is deleted from all three catalogues and `settingsLegalPanel.test.tsx`
  asserts it stays gone. The served production bundle carries the phrase only
  inside the inlined commit message (`VITE_VERCEL_GIT_COMMIT_MESSAGE`), which no
  screen renders. `ProfileScreen.tsx`'s `moreSettingsSoon` is unrouted and
  untouched (design step 5). Apple 2.1(a):
  *"placeholder text, empty websites, and other temporary content should be
  scrubbed before submission."*
  - `SettingsScreen.tsx`: **CLOSED by the design rollout PR (2026-09-25).** The
    "System information / Coming soon" panel and its seven strings
    (`comingSoon`, `systemInfo`, `v1Preview`, `invoiceHistory`,
    `teamManagement`, `apiKeyGen`, `webhookConfig`) are deleted from the screen
    and from all three catalogues; `designRollout.test.tsx` asserts the keys
    no longer exist.
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
- [x] **No privacy-policy link inside the native app. CLOSED 2026-09-30 by #271
  (4951b2c2, TestFlight build 10).** Settings gained a Legal panel between
  Preferences and the plan: Privacy Policy and Terms of Service rows, each a
  router Link to `/privacy` and `/terms`, on the same Panel and IconTile pieces
  as every other row, in en/fr/ar. `settingsLegalPanel.test.tsx` renders web
  and native, FREE and PRO: the panel names no price or plan, and the Go PRO
  button appears on web FREE only. The owner reviewed the preview on his iPhone
  (2026-09-30). The EXPIRY below is met: the linked copy names the operator
  (#269) and carries no purchase link. Found 2026-09-23 while writing this
  rewrite.
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

### Sign-in with Google and Apple — the owner's condition for both stores

Set by the owner on 2026-09-26: Google and Apple sign-in on the Login screen
before republishing on Play and publishing on the App Store. **Merged as
#258 = `a67149bc` on 2026-09-27**, squash of head `5f84c2d1` with an identical
tree (`48711e54`), after the owner reviewed the preview Login on his iPhone.
Instruments, re-run rather than quoted: `curl -sS https://<railway-host>/api/version`
served the merge SHA 100 s after merge; the production bundle, read from
freshly served HTML, carries `signInWithOAuth({provider:"google",...})` and
`signInWithIdToken(...)` by minified structure, and the pre-merge bundle
carried neither (the control). The rulings, each with what was read:

- **Google is what makes Apple mandatory, not the reverse.** Apple 4.8 "Login
  Services", read 2026-09-26 at developer.apple.com/app-store/review/guidelines
  (page dated June 8, 2026): apps that use a third-party login *"such as
  Facebook Login, Google Sign-In ... must also offer as an equivalent option
  another login service"* that *"limits data collection to the user's name and
  email address"*, *"allows users to keep their email address private"* and
  does not collect interactions for advertising; not required if *"Your app
  exclusively uses your company's own account setup and sign-in systems."*
  The section no longer names Sign in with Apple. Email and password cannot
  keep an address private; Sign in with Apple can.
- **Apple on iOS only, native, no secret.** Supabase's Apple guide: *"If
  you're building a native app only, you do not need to configure the OAuth
  settings"*, and for the web flow *"Apple requires you to generate a new
  secret key every 6 months"*. Apple's usage guidelines *recommend*, and do
  not require, offering it on other platforms. Reversing this costs a Services
  ID, a `.p8` key, a client secret pasted into Supabase that expires every six
  months, and a monitor for that expiry of exactly the class this repository's
  CLAUDE.md warns cannot be trusted quietly. Owner: the owner, if ever.
- **The way out of an Apple-only account on the web and Android** is the
  Settings card "Sign in on other devices" (`SetPasswordCard.tsx`): a signed-in
  user sets a password, and `supabase/auth` `user.go`
  (`ensureEmailIdentityForPassword`) creates the email identity, so the same
  address and that password sign in anywhere. It depends on nothing outside
  the app. The passive route, a reset mail to the relay address, works only
  after the relay registration below and only if the person finds their relay
  address in iOS Settings.
- **The lockout cannot return.** `ensureUser` keys on the Supabase uuid;
  Supabase attaches a verified-email identity to the existing user (docs,
  auth-identity-linking: *"If a match is found, the new identity is linked to
  the user"*), so the uuid does not change; a Hide-My-Email relay is a new uuid
  and a new address. `authMiddleware.identityLinking.test.ts` holds the three
  shapes and the control. **Live reading once the owner has signed in with
  Google on his own address:** from `apps/backend`, inside
  `SET TRANSACTION READ ONLY`, count `auth.identities` rows for his uuid
  (expect 2) and the `"User"` row count (expect unchanged).

**On the phone, 2026-09-28, build 1.0.0 (5), the owner's iPhone.** Continue
with Apple: the native sheet, "Share My Email", the dashboard of a new empty
account. Continue with Google: the native sheet, `tornido.maroc2024@gmail.com`,
which had no app account; a new empty account; Settings shows that address and
the "Sign in on other devices" card, as designed; no password was set. Nothing
else was tested on the phone (not the camera, not deletion, not a scan). **Two
production users now exist that did not before, both the owner's:** the Google
one above, and the Apple one, whose relay or shared address the owner has not
read. They are his rows and may be read; instrument, from `apps/backend` inside
`SET TRANSACTION READ ONLY`: `auth.identities` with `provider IN
('apple','google')` (expect 3: the 2026-09-27 link plus these two) and the
`"User"` rows created on or after 2026-09-28 (expect 2). The "REVISIT when
`provider = 'apple'` exceeds the owner's own" line below now starts from 1.
**2026-09-30: the Apple one is gone.** The owner deleted it in-app on build
11 (see the revocation item below); the Google one stays. The line below
starts from 0 again.

**Conditions still blocking the first App Store submission (2026-09-28, the
revocation row removed 2026-09-30), the index; details under each item:**

| Condition | Owner | EXPIRY |
|---|---|---|
| Trader status for the EU | the owner, App Store Connect | the app's trader status reads provided and verified before submission |
| Brand verification on the Google consent screen | the owner, Google Auth Platform | the consent page names the app |
| Android Google sign-in unverified | the owner, a borrowed device | one Google sign-in on a Play-installed build |

- [x] **Remove the Facebook SDK, then the tracking string. CLOSED 2026-09-30 by
  #270 (960eccd8).** The route below was taken as written. The audit is
  `.github/workflows/ios-audit.yml`: on a pull request touching the iOS paths,
  a macOS simulator build with no signing and no secret, then `otool -L`, the
  embedded Frameworks directory, the SwiftPM checkouts and `nm -u` on
  `App.app/App`, with UIKit and capacitor-swift-pm as positive controls; the
  same `otool -L` reading runs on the archive in `ios-testflight.yml` before
  every upload. Readings: PR runs 36637731099 and 36638543614, then the device
  archives of TestFlight builds 9 (run 36643747082) and 10 (run 36644629023):
  52 load commands each, UIKit present, no AppTrackingTransparency, no FBSDK,
  no Facebook, no facebook checkout among the eleven SwiftPM resolved,
  `nm -u` for ATTracking empty. `NSUserTrackingUsageDescription` and its three
  localizations were removed in the PR's second commit, after the first
  reading; the manifest keeps `NSPrivacyTracking` false. The import guard is
  `patches/@capgo+capacitor-social-login+8.5.11.patch` on `postinstall`; a
  plugin bump fails `npm ci` until it is regenerated. Not verified: the Android
  build under the plugin's `facebookDisabled` source set, which the same
  provider map now selects (CI runs no Gradle). The owner's objection,
  2026-09-28: `NSUserTrackingUsageDescription` exists only because
  `@capgo/capacitor-social-login` links `facebook-ios-sdk` unconditionally in
  its `Package.swift`; the app uses neither Facebook nor tracking, and a
  tracking prompt string in an app that does not track invites a 5.1.1 or
  5.1.2 question and must agree with the App Privacy answers.
  - **Route: the plugin's own switch,** not a fork and not another plugin.
    `capacitor.config.ts`, `plugins.SocialLogin.providers = { google: true,
    apple: true, facebook: false, twitter: false }`. The plugin's
    `capacitor:sync:before` hook (`scripts/configure-dependencies.js`, 8.5.11)
    comments the Facebook package and products out of its `Package.swift`
    (SPM honoured upstream since issues #432 and #445), and the workflow's
    `web` job runs `cap sync ios`. In `FacebookProvider.swift` the only
    `ATTrackingManager.requestTrackingAuthorization` call (line 179) sits
    inside `#if canImport(FBSDKLoginKit)` (lines 19 to 235); the stub compiled
    without Facebook never calls it.
  - **Measure before deleting the key:** line 9 `import AppTrackingTransparency`
    is outside that guard, so the binary may still link the framework. Add a
    CI step running `otool -L` on the built `App.app/App` and print the
    frameworks; remove `NSUserTrackingUsageDescription` only when
    AppTrackingTransparency is absent, else patch the import guard
    (patch-package) first. The purpose-string test derives keys from plugin
    SOURCE text, so it must learn the guard in the same PR.
  - Owner: engineering. **EXPIRY:** in the table above.
- [ ] **Trader status for the EU.** The Digital Services Act requires a trader
  status declaration in App Store Connect for apps distributed in the EU;
  Apple removes apps without one from the EU storefront. Read Apple's current
  page (App Store Connect Help, "Provide trader status") at submission time
  rather than this line; the owner declares as a trader with his business
  contact details, which then appear on the product page in the EU.
  - Owner: the owner, App Store Connect. **EXPIRY:** in the table above.
- [x] **Submission is BLOCKED until Apple token revocation on account deletion
  ships. CLOSED 2026-09-30 by #272 (`5454f465`, TestFlight build 11, run
  36693536724), proven by one real deletion on the owner's iPhone.**
  - **What shipped:** on iOS the delete dialog opens one more Apple sheet
    (`reauthenticateWithApple` in `socialAuth.ts`) and sends its authorization
    code with `DELETE /api/account`; `appleRevocationService.ts` exchanges it
    at `/auth/token` and revokes at `/auth/revoke`, with a client secret
    minted per call. Nothing is stored. A failed, skipped or unconfigured
    revocation never blocks the deletion and is named in the response
    (`appleRevocation`). The plugin setup gained `useProperTokenExchange`,
    which every Apple sign-in now goes through.
  - **Configuration:** `APPLE_TEAM_ID`, `APPLE_CLIENT_ID`, `APPLE_SIWA_KEY_ID`
    and `APPLE_SIWA_PRIVATE_KEY` on the Railway service `scan-and-action`
    (project `amiable-dream`, production). Ask
    `railway variable list --json` from `apps/backend` and print the names
    only. The key exists nowhere else once the owner's local copy is deleted;
    if Railway loses it, a new Sign in with Apple key is created in the Apple
    Developer account and this one revoked there.
  - **Part A, the owner, about 09:17 to 09:19Z, build 11:** Continue with
    Apple signed in (the sign-in change works); the dialog showed the Apple
    line; the Apple sheet cancelled; the dialog stayed open with "The Apple
    confirmation was cancelled. Your account was not deleted."
  - **Part B, the owner, about 09:22 to 09:25Z:** Scan & Action was listed in
    iPhone Settings, Sign in with Apple (the control); the empty Apple account
    was deleted with the sheet completed; no "Apple still lists" message; the
    app is gone from that list (the decisive reading, his).
  - **What was read afterwards, 2026-09-30:** Railway HTTP logs for deployment
    `b8df3268` (`railway logs <id> --http --json`) show exactly one
    `DELETE /api/account` in 09:15 to 09:30Z: 09:23:54Z, 200, 2334 ms upstream,
    1856 bytes in, 39 bytes out, an iPhone user agent. 39 bytes is the length
    of `{"ok":true,"appleRevocation":"revoked"}`; `skipped` has the same
    length and `failed` has 38, so the byte count alone cannot separate
    revoked from skipped. The deployment log for the same window holds no
    `apple_revocation` line, and `skipped`, `failed` and `not_configured`
    each write one, so skipped is excluded; the control for that stream is
    its ten `[DocumentController]` lines in the window. Supabase admin
    `listUsers`, read from `apps/backend`: 32 users, `app_metadata.providers`
    google 2, email 31, apple 0 (33 users and apple 1 before the deletion);
    no auth user and no `"User"` row with the deleted address or the uuid
    prefix `d204c01c`; the Google account `6e9f5dc5` created the same day is
    still there (the control). `listUsers` returns every user with an empty
    `identities` array, so count providers from `app_metadata`, never from
    `identities` on a list.
  - **A revoked outcome now writes a log line** (the PR recording this):
    `[AccountController] apple_revocation revoked user=<uuid>`. Before it,
    success left nothing in the log and was read as the absence of a failure,
    as above.
  - **`main` went red on the merge commit, and nobody looked.** #272's head
    passed `Backend — typecheck & build` at 2026-09-29T23:58Z; the same job
    failed on `5454f465` at 09:03Z (`gh api
    repos/{owner}/{repo}/commits/5454f465/check-runs`). Cause:
    `appleRevocation.test.ts` minted a five-minute token at a fixed
    `2026-09-30T00:00:00Z` and verified it against the wall clock, so it
    could pass only until 00:05Z. Production was never affected (test only;
    Railway deployed and served the commit). The PR recording this verifies
    at the minting instant (`clockTimestamp`). A required check gates the
    head when it ran, not the merge when it lands: read the push run on
    `main` after a merge.
  - **Not verified:** the `failed` path against Apple itself (tests only),
    and deletion of an Apple-linked account from the web, which reports
    `skipped` and shows the note telling the person where Apple still lists
    the app.
  - **The item as it stood:** Apple's "Offering account deletion in your app"
    support page, read 2026-09-26: *"Apps that support Sign in with Apple
    should use the Sign in with Apple REST API to revoke user tokens."*
    `AccountController.deleteAccount` deleted the Supabase identity and called
    nothing at Apple.
  - Cost: the Team ID, a Sign in with Apple key ID and its `.p8` as Railway
    secrets (never in this repository, never in chat), a client-secret JWT
    minted per call from the key, and one call to Apple's `/auth/revoke`
    before the identity is deleted, skipped for users with no Apple identity.
  - Owner: engineering, with the key created by the owner in his Apple account.
  - **EXPIRY:** before the first App Store review submission. TestFlight is
    internal; review is where Apple judges this. Deferred from
    `feat/social-sign-in` by the owner's ruling of 2026-09-26.
- [x] **The three iOS edits: JUDGED 2026-09-28 on build 5.** Apple and Google
  both signed in natively on the owner's iPhone; Google did not hang after
  consent, so edit 2 stays unmade; the nonce setting stayed OFF and worked.
  1. DONE: `Info.plist` carries the reversed Google iOS client id as a URL
     scheme; `iosPlatform.test.ts` derives it from `googleClientIds.ts`.
  2. NOT MADE, on evidence: Capacitor 8's SPM template has no
     `application(_:open:options:)` at all (URLs reach `SceneDelegate`), and
     the plugin's SPM package pulls GoogleSignIn-iOS 9 whose AppAuth user
     agent is `ASWebAuthenticationSession`, which hands the callback URL to the
     session itself; `GIDSignIn.handle(url)` matters only under Guided Access
     (AppAuth `OIDExternalUserAgentIOS.m`, read 2026-09-27). Importing
     GoogleSignIn in the app target would also need the product linked to it,
     which the CLI-managed `CapApp-SPM` does not do. **If the first build's
     Google sign-in hangs after consent:** add `import GoogleSignIn` and
     `GIDSignIn.sharedInstance.handle(context.url)` in
     `SceneDelegate.scene(_:openURLContexts:)`, link the product, record it.
  3. DONE: `App/App.entitlements` with `com.apple.developer.applesignin` =
     `Default`, wired by `CODE_SIGN_ENTITLEMENTS` in both configurations.
  - **EXPIRY (met 2026-09-28):** the first TestFlight build signs in with
    Apple and with Google.
- [ ] **Register `scan-action.com` as an email source for Apple's Private
  Email Relay.** Apple ("configuring-your-environment-for-sign-in-with-apple",
  read 2026-09-26): *"you must register your outbound email domains ... as email
  sources for the Private Email Relay Service"*, authenticated by SPF and/or
  DKIM, and the DKIM `d=` domain must match the From domain exactly. Resend
  sends From `noreply@scan-action.com`. Until registered, every mail to a
  Hide-My-Email user bounces: the welcome mail (non-fatal by test) and a
  password-reset link.
  - Owner: the owner, in Certificates, Identifiers & Profiles. Free.
  - **EXPIRY:** the domain shows verified there, and a test mail to a relay
    address of the owner's own Apple ID arrives.
- [ ] **The Android splash is repainted `#0F1014` and UNVERIFIED** (the owner,
  2026-09-27, Q2): `SPLASH_NAVY` in `generate-android-icons.py` moved from
  `#0f172a` and the eleven `splash.png` files were regenerated in
  `feat/ios-testflight`; no device has shown them. Judged with the Google item
  below on a borrowed device.
- [ ] **Android Google sign-in is UNVERIFIED and stays so until a device
  exists.** The owner's phone is an iPhone and there is no Android device
  (the owner; the 2026-09-04 pass used a borrowed Samsung). The path is the same plugin call as
  iOS, held by `socialAuth.test.ts`, but Credential Manager also needs the
  Android OAuth client to carry the SHA-1 of the Play App Signing key (Play
  Console, App integrity) and of the upload key; a mismatch fails with
  `[28444] Developer console is not set up correctly` on the device only.
  Both Android clients exist since 2026-09-27 (the owner); whether their
  SHA-1s match the installed APK is exactly what only a device can say.
  - Owner: the owner. **EXPIRY:** one Google sign-in on a Play-installed build
    on a borrowed Android device.
- [ ] **A Hide-My-Email sign-in by someone who already has an email-and-password
  account makes a second, empty account.** Ruled invisible in v1 (the owner,
  2026-09-26): the backend refuses every address-keyed read on a request (#147),
  so the duplicate cannot be detected, and the only signal is an empty ledger.
  The cure when it matters is Supabase manual linking (`linkIdentity`, beta)
  from Settings, which needs "Enable Manual Linking" in the dashboard.
  - **REVISIT when** a read-only count of `auth.identities` with
    `provider = 'apple'` exceeds the owner's own; 1 from 2026-09-28, his, and
    0 since he deleted that account on 2026-09-30 (read as
    `app_metadata.providers` over Supabase admin `listUsers`).
- [x] **The owner's console work, verified by a read and not by his word.
  DONE 2026-09-27.** Instrument: `GET https://<project>.supabase.co/auth/v1/settings`
  with the publishable key from the served bundle. On 2026-09-26 its
  `external` map showed `email` only; on 2026-09-27 it reads `apple`, `email`,
  `google`, with `mailer_autoconfirm: false` unchanged.
  - Google Cloud project `scan-and-action`, consent screen External and In
    production, clients Web, iOS, and two Android (Play App Signing SHA-1 and
    upload SHA-1), by the owner. The two public client ids are committed in
    `apps/frontend/src/lib/googleClientIds.ts` (`.env.production` is
    read-denied to the tooling; an env var of the same name still wins). The
    web client's secret is in Supabase only.
  - One conditional stays: Supabase's Google guide says to enable "Skip nonce
    check" for iOS. The plugin forwards a nonce, so it is left OFF; if the
    first iOS Google sign-in fails naming the nonce, turn it on and record it.
- [x] **LINKED, proven live on the preview, 2026-09-27.** From the owner's
  signed-in Chrome, "Continue with Google" on the `feat/social-sign-in`
  preview, choosing `tornido.maroc@gmail.com`, whose email-and-password
  account is `0b240bed`; no password was typed; the consent screen, then the
  dashboard with that account's September receipts. Read-only reading
  afterwards, from `apps/backend` inside `SET TRANSACTION READ ONLY`:
  `auth.users.raw_app_meta_data->'providers'` = `["email","google"]`,
  `auth.identities` for the uuid = `["email","google"]`, `"User"` rows for the
  uuid = 1 and for the address = 1; totals `auth.users` 31 before and after,
  `"User"` 31, social identities 0 before and 1 after. No production user was
  created; nothing to clean up. Control on the same session: Settings shows
  no "Sign in on other devices" card, since the account has an email identity.
- [ ] **Brand verification on the Google consent screen.** Observed live: the
  chooser and the consent page read "to continue to
  ujpdvjaxitgykrrsblfk.supabase.co", not "Scan & Action", because the
  project has no verified brand (Supabase's Google guide: *"Branding and
  Verification show a logo and name instead of the Supabase project ID in the
  consent screen"*). Free; Google says brand verification "may take a few
  business days". Sign-in works without it.
  - Owner: the owner, Google Auth Platform, Branding, with a logo and the
    `scan-action.com` domain. **EXPIRY:** the consent page names the app.
- [ ] **Step 10, the Private Email Relay registration, with the exact
  entries.** Read 2026-09-27 through public DNS only, nothing changed:
  - The backend welcome mail: Resend, From `noreply@scan-action.com`
    (`mailer.ts`, `DEFAULT_MAIL_FROM`, and `MAIL_FROM` in Railway). Supabase
    auth mail (confirm, reset): custom SMTP through Resend ("Where a
    confirmation email comes from"); its From address is read in Supabase,
    Authentication, SMTP settings, and Resend accepts only a verified domain,
    so it is on `scan-action.com` too.
  - DNS: `scan-action.com` TXT `v=spf1 include:_spf.mx.cloudflare.net ~all`
    (Cloudflare email routing, the inbound side, not Resend);
    `send.scan-action.com` TXT `v=spf1 include:amazonses.com ~all` and MX
    `feedback-smtp.eu-west-1.amazonses.com` (Resend's envelope sender, the
    Return-Path); `resend._domainkey.scan-action.com` holds the DKIM key, so
    the signature's `d=` is `scan-action.com` and matches the From domain;
    `_dmarc.scan-action.com` is `v=DMARC1; p=none;`.
  - Apple ("configure-private-email-relay-service"): outbound mail must pass
    SPF and/or DKIM; for SPF the envelope-sender domain must be registered and
    match exactly; for DKIM the `d=` domain must match the From domain and be
    registered. So register BOTH: `scan-action.com` (satisfies the DKIM check
    for every mail) and `send.scan-action.com` (satisfies the SPF check on the
    envelope). No DNS change is needed first; cost 0.
  - Owner: the owner, Certificates, Identifiers & Profiles, Services, Sign in
    with Apple for Email Communication. **EXPIRY:** both domains show verified
    there, and a welcome mail to a relay address of the owner's own Apple ID
    arrives.

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
  **Category colours are NOT part of that round (ruled 2026-09-24, on the
  owner's first iPhone judgement of the ledger home).** They carry meaning,
  like the status colours, not brand identity, so they shipped with the home
  (`--sa-cat-*` in `tokens.css`, held to 3:1 in both themes by
  `categoryPalette.test.ts`). The round still owns the app icon and the accent.
- [ ] **2. The design system, in code.**
  - **Started in the ledger-home PR (2026-09-24):** `components/ui/`
    (`CategoryIcon`, `Panel`, `CountChip`) and the figure / code / label / meta /
    count hierarchy written in `CountChip.tsx`. **The rollout PR (opened
    2026-09-25, after #245 merged as `5b46645`)** moves Search, Queue, Detail,
    Activity, Settings, the result table and the tab bar onto those pieces,
    adds `IconTile` (every non-category icon in a tile) and `DocumentIcon`
    (the category tile from the `category` fact, else a neutral document tile,
    never an invented "Other"), and `lib/documentCategory.ts`, so a receipt is
    the same category on the home, its row and its detail. Detail keeps its
    structure: the result screen is step 3's, redrawn from zero. Settings loses
    the "System information / Coming soon" panel (see APPLE TRACK 2.1(a)).
    `designRollout.test.tsx` holds it. **EXPIRY:** that PR merges.
  - **The owner's judgement of the rollout (2026-09-25, iPhone, `81a2b6d`).**
    Home, Queue, Activity, Settings and the tab bar are approved. **Search and
    Detail are NOT:** "complicated and disorganised", "not modern", "look as if
    they belong to another app". The rollout gives them shared surfaces only;
    each is redrawn from zero in its own PR, Detail under step 3 and Search
    under step 6.
  - **Bills moved off amber in the rollout PR.** `#B7791F` sat 7.4 ΔE from the
    amber review-chip text (`--sa-warning-text`) and read as the same colour
    (owner, 2026-09-25). It is `#5C940D` now, 61 away; `categoryPalette.test.ts`
    compares every fill against the warning text too, with the old Bills as
    the control that fails.
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
  - **The native scanner, iOS: BUILT 2026-09-30, UNJUDGED until the owner has
    used it on the TestFlight build that follows its merge** (standing rule 5).
    - **What it is:** Apple's VisionKit document camera
      (`VNDocumentCameraViewController`, public API only) behind a plugin in
      the app target, `ios/App/App/DocumentScannerPlugin.swift`, registered by
      `MainViewController.swift`, which `SceneDelegate.swift` installs as the
      root controller (`Main.storyboard` names it too, and that alone did
      nothing: UIKit builds the storyboard scene, then the scene delegate's
      line replaces it). No package was added: `Package.swift` and
      `Package.resolved` are untouched.
    - **The launch smoke test, and what it caught on its first day.** A build
      is not a launch, so `ios-audit.yml` now boots a simulator, installs and
      starts the app with `SA_LAUNCH_SMOKE=1`, and reads the marker file
      `MainViewController` writes (simulator builds only): the class ran, the
      web view finished loading the bundled page as a native Capacitor page,
      the scanner plugin is registered in it. Runs 36727666450, 36730444641
      and 36772794873 (2026-09-30) stayed red on the real branch with no
      marker while the storyboard change was the only wiring: the scene
      delegate still created the plain bridge controller in code, so the
      plugin was never registered and the scanner would have been silently
      absent on the phone, the capture sheet falling back to the camera every
      time. Controls: a storyboard naming a class that does not exist (run
      36727665346, "Unknown class ... in Interface Builder file") and the
      scene delegate with the plain controller, both red. The test costs
      about 15 minutes of free macOS time, most of it the first boot of the
      simulator.
    - **Why not a package.** `@capgo/capacitor-document-scanner` 8.4.6, the
      one maintained plugin with a Swift package, was read on 2026-09-30: its
      `DocScanner.swift` looks up the private class
      `VNDocumentCameraViewController_InProcess`, exchanges its
      `documentCameraController:canAddImages:` and reads `_targets`, `_target`
      and `_action` off gesture recognizers (Apple 2.5.1: public APIs only).
      `@capacitor-mlkit/document-scanner` is Android only by its own README.
      `capacitor-document-scanner` 2.0.0 is Capacitor 5 and CocoaPods, last
      released 2023-05.
    - **What the leaders ship, read the same day.** Expensify's own issue
      (#101916, opened 2026-09-22): "receipt capture on mobile is a viewfinder
      and a shutter", the saved image "the raw frame"; edge detection is a
      project it has just opened. Dext's help page: Single, Multiple and
      Combine modes, up to 50 photos; nothing about cropping.
    - **The contract** (`src/native/documentScanner.ts`): a plugin named
      `DocumentScanner` with `isSupported`, `scan`, `discard`. Android later
      implements the same three over ML Kit's document scanner (Google Play
      services) and adds `'android'` to `SCANNER_PLATFORMS`; no other web
      code changes.
    - **The fallback, held by `documentScanner.test.tsx`:** the camera input
      that was the whole capture path is reached on the web, when the plugin
      is missing from the binary, when the device does not support scanning,
      when the scanner fails (the sheet says so and the button becomes "Take
      photo"), and after a cancel (back on the chooser). The eight sheet tests
      fail against the previous `CaptureSheet.tsx`.
    - **Several pages become ONE PDF** (the owner's objection to "page one
      only", upheld). What was read: the upload route accepts
      `application/pdf` up to 10 MB (`documentRoutes.ts`); `geminiAdapter.ts`
      hands the whole buffer to the model inline with its mime type, in both
      the single-document check and the extraction, so every page is read; a
      long receipt carries its total on the last page, and the total is the
      one field the prompt calls mandatory, so page one alone would lose it.
      In the owner's three organisations 2 PDFs were ever uploaded, both
      `COMPLETED` (read-only count by file extension and status, 2026-09-30,
      control: 159 images); their page counts are unknown, so **a multi-page
      PDF through extraction is unmeasured**. The plugin makes the PDF fit
      10 MB by stepping the page size and JPEG quality down, and refuses
      (`TOO_LARGE`, "scan fewer pages") when it cannot. The sheet says how
      many pages were scanned and that they go as one document.
    - **The cost of that ruling, stated:** VisionKit has no public page
      limit and no way to tell two receipts from two pages. Two different
      receipts scanned in one go become one PDF, which the single-document
      check is there to refuse (`NEEDS_REVIEW`, no extraction). The sheet's
      note says to scan one receipt or invoice at a time. Dext's "Multiple"
      mode (several receipts, one upload each) is not built: a burst of
      uploads is what met the quota on 2026-09-08 and 09.
    - **A PDF has no picture on the result screen: FIXED where the browser
      can draw one (the reading-state PR, 2026-10-04).** `lib/pdfPreview.ts`:
      on an iPhone (WKWebView draws PDFs natively) and wherever
      `navigator.pdfViewerEnabled` is true, the first page sits in the same
      card a photo gets, in a frame that takes no taps so the card still
      opens the original; on Android and anywhere unknown the link row stays
      as it was. Held by `pdfPreview.test.tsx`. The frame on a real iPhone,
      with a real Supabase signed URL, is unwitnessed until the owner scans
      two pages on the build; a frame that shows nothing there means the
      storage response, not the code path, and the link below it still works.
    - **Guards added with it.** The purpose-string and privacy-manifest
      audits now read the app target's own Swift, and fail on an `Info.plist`
      without the camera string (`iosPlatform.test.ts`). A private-API scan
      reads the sources there and the binary's strings in `ios-audit.yml` and
      in the archive step, each proven first on a planted sample carrying the
      Capgo plugin's own lines.
    - **What no run before the phone can show:** the scanner's screen, the
      edges it finds, the camera permission prompt, the bridge reading the
      temporary file (`Capacitor.convertFileSrc`), the PDF's real size and
      whether its JPEG pages are embedded as they are. The simulator build
      proves the project compiles and links; VisionKit reports the scanner
      unsupported on a simulator.
    - **The owner's test on the build:** one receipt; one long receipt over
      two pages (the PDF, and whether the total is read); cancel; Choose file
      still working. **EXPIRY:** he has judged it, and the multi-page
      extraction is a measured number.
    - **Judged on build 1.0.0 (13), 2026-09-30 to 10-01 (run 36789875056,
      attempt 2, `5cee03c5`); the owner moved on 2026-10-04 and ruled that
      nothing below blocks other work.** One receipt: PASSED, witnessed. Two
      pages: reported fine by the owner, NOT witnessed (no screenshot of
      "Pages scanned: 2"). Cancel and Choose file: NOT DONE.
      **The database does not hold a multi-page scan.** Every upload whose
      name the scanner writes (`scan-<stamp>.jpg|pdf`,
      `src/native/documentScanner.ts`) is one of two, both `.jpg`, both in the
      owner's organisation `5ce3e185`, at 2026-09-30T23:43:45Z and 23:53:33Z;
      a scanner-named `.pdf` has never been uploaded (control: 393 documents
      in all, 5 of them PDFs from the file picker). A two-page scan makes a
      PDF by construction (`DocumentScannerPlugin.swift`, `pageCount == 1`
      is the only JPEG branch), so whatever "two pages" was, it did not reach
      the backend as one document. Instrument: from `apps/backend`, inside
      `SET TRANSACTION READ ONLY`, count `Document` rows whose
      `originalFileName ~ '^scan-[0-9]'`, by extension. The EXPIRY above is
      not met: the several-pages-one-PDF path has never run end to end.
  - **The result screen (Detail): REDRAWN FROM ZERO in the detail PR
    (opened 2026-09-25); open until the owner has judged it on his iPhone.**
    The owner rejected the previous one on 2026-09-25 (see "The owner's
    judgement of the rollout" under step 2).
    - **What it shows now, top to bottom** (`DocumentDetailScreen.tsx`): the
      category tile, the merchant as the title, the amount the ledger counts
      (`lib/ledgerAmount.ts`, "Edited" when corrected), the date printed on
      the receipt, ONE status; then "Needs your attention" as plain sentences
      with the fix actions and the retry inside it, only when something needs
      him; the receipt as a card that opens the original; the facts as rows
      with the file name last; Approve / Reject sticky while it waits.
    - **Cut:** the file name as the title, "Verified AI intelligence
      extraction", the 83% badge, the "99% match" labels, the relationships
      section, the status shown three times.
    - **What the leading apps showed (help pages read 2026-09-25).** Dext:
      one state (To review / Ready) and a list naming the exact missing
      fields. Expensify: the failure names the missing fields, errors sit on
      the field they concern. Ramp: a "(required)" label per field, actions in
      one sheet. QuickBooks: the status label under the amount. None shows a
      per-field confidence to the user. Taken: one state, a named list with
      the fix in place. Improved on: the amount leads (none of them puts it
      first), and problems are sentences a person can read, not labels.
    - **Kept, proved byte for byte or by unchanged tests** (the PR lists
      each): Approve, Reject and Retry; the fix-action writes; the
      `detailFacts.ts` allowlist; the lockout handling; the image fallback;
      the money rules; RTL.
    - **The owner's second judgement (2026-09-25, Arabic, the Joe's Pizza
      invoice): the top card approved; four defects fixed in the same PR:**
      the image no longer renders full size inline (a fixed-height cropped
      card that opens the original); Approve / Reject are `fixed` to the
      viewport, clear of the tab bar and the safe area (a `sticky` child of
      Layout's `overflow-y-auto` main never stuck; CLAUDE.md records how the
      screenshot missed it); the total no longer repeats as a row and the file
      row says "file"; every reason and fix-action sentence rewritten in
      plain, specific en/fr/ar.
    - **What the rule engine does not carry, and the smallest change that
      would.** `decision_reason` is a fixed English phrase per rule
      (`ruleEngineService.ts`: A amount > 500, B food and > 50, C no amount,
      D same merchant and amount as another document). So a sentence can
      name the CHECK ("the amount is above the review limit", "another
      receipt has the same merchant and amount") but not the FIGURE (the
      limit, the other receipt). Proposal, not done here and not a rule
      change: the engine writes one more fact, `decision_detail`, a JSON
      string per fired rule (`{ rule: 'A', limit: 500 }`,
      `{ rule: 'D', documentId }`), and the screen reads it to say "above
      500 MAD" and to link the other receipt. Nothing reads or counts that
      fact, so it moves no money.
    - **APPROVED by the owner on his iPhone at `8dbda49` on 2026-09-25**
      (Arabic, the Joe's Pizza invoice: the amount, one status, specific
      sentences, the compact receipt card, and Approve and Reject without
      scrolling; "simple and good"). Merged as #248 (`cc8b0c9`). **EXPIRY
      MET.**
    - **What is wrong above the image.** The title is the file name. "Verified
      AI intelligence extraction" appears on documents that say "Needs review".
      The status is shown three times: the badge, the decision banner and the
      Status tile. The Date tile is the UPLOAD date, while the ledger dates the
      same receipt by `TRANSACTION_DATE`. The amount, the one figure a money
      app leads with, first appears in the facts below the image.
    - **What it must keep, behaviour unchanged:** Approve, Reject and Retry
      extraction (the `reextractable` gate included); the fix actions and what
      they write; the facts allowlist in `detailFacts.ts`; the lockout
      handling; the image fallback; RTL.
    - **Money rule:** the amount at the top is the one the ledger counts (a
      correction beats the extraction, in the extraction's currency, marked
      "Edited" as on Home).
    - **The native scanner and the reading state stay in this step** and wait
      for the iOS build (THE STAGE, item 4). This PR redraws the result screen
      only.
  - **EXPIRY:** it ships on both native builds, with that measurement.
- [x] **4. Home: the ledger home. DONE: approved by the owner on his iPhone at
  `5a4eec1` (English and Arabic, 2026-09-25) and merged as #245 (`5b46645`).**
  His words on the last judgement: the coloured tiles, the four treatments
  inside each card, the plurals, the review card and the single scan button
  all work; the one change asked for, "Other" off grey, went in before the
  merge. Its precondition held: the duplicate
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
  - **The owner's first judgement (2026-09-24): the money was right, the look
    was not.** Icons blended into cards. Answered in the same PR: each
    category got a solid colour tile with a white glyph, and figure, label and
    count each got their own treatment. Arabic and French plurals now use every
    CLDR form. Scanning has one home on a phone, the tab bar's camera button.
    The "needs review" card names both of its numbers: this month's receipts
    and the Queue's total over all months (`GET /api/stats` pendingCount, the
    badge).
  - **EXPIRY MET 2026-09-25:** the owner used it on his iPhone and ruled on it.
  - **REOPENED 2026-09-25: the owner is not satisfied with the Home screen's
    design,** although he approved it at #245. It is redrawn in its own PR.
    - **Third in the ruled order (Search, Login, Home), and NOT to be started
      until the owner has given his reasons** (ruled 2026-09-25).
    - **His reasons are not yet recorded.** Ask them before designing: a
      redraw without them risks a third round on the screen he opens every
      day.
    - **What must hold:** the money rules of step 4 (one figure per currency,
      never summed; money only from `/api/ledger`) and the ledger and
      no-cross-currency tests, unedited.
    - **The row that tiled a receipt with no category as Other: CLOSED by
      #255 (2026-09-26).** `ReceiptRow` reads the category through
      `wornCategory` and draws the neutral tile for none and for the
      backend's fallback "Other"; `documentWearsNoOther.test.tsx` holds it.
      The Other card on Home still totals those receipts.
    - **EXPIRY:** the owner approves a redrawn Home on his iPhone.
- [ ] **5. First run.** Login and signup, an email confirmation that returns to
  the app, the icon and splash, every "coming soon" removed, `ProfileScreen.tsx`
  deleted, and the in-app privacy link.
  - **Login: APPROVED by the owner on his iPhone on 2026-09-26 and merged
    inside #255 (`402ae72`).** The password policy, the recovery routing and
    the lockout were proven byte-identical in that PR. The rest of this step
    (email confirmation back into the app, icon and splash, the "coming
    soon" removals, `ProfileScreen.tsx`, the privacy link) is still open.
  - **Login rejected by the owner on 2026-09-25.** It is redrawn in its own
    PR.
    - **What it shows today** (`AuthScreen.tsx`): a dark panel reading "Turn
      documents into actionable intelligence" and "Intellectual automation",
      and a "Continue to dashboard" button. That is the admin-panel vocabulary
      the DESIGN TRACK ruling names.
    - **Why it matters:** Login is the first screen an App Store reviewer and
      every new user sees.
    - **What must hold:** the password policy (`passwordPolicy.ts` and its
      drift test), the recovery routing, the error localisation tests.
    - **EXPIRY:** the owner approves a redrawn Login on his iPhone.
- [ ] **6. The rest.** Documents and search, the review queue, settings with
  account deletion reachable, and the web-only paywall.
  - **Search is redrawn from zero in its own PR. DONE: approved by the owner
    on his iPhone on 2026-09-26 and merged as #250 (`4c6772a`),** after its
    route went first as #251 (`7e3172e`). What it is now: one field
    (merchant or file name), the eight category chips, a month or every
    month, the home's own rows (`components/ui/ReceiptRow.tsx`), a total per
    currency, and the receipts the ledger does not count listed apart with
    their reason and their own category tile. The notes below are the brief
    it was built to. The Detail PR it waited
    for merged as #248. The owner rejected the current screen on 2026-09-25
    (see "The owner's judgement of the rollout" under step 2).
    - **What is wrong with it.** Today it is an "ask your workspace" tool:
      "Workspace insights gallery", "At risk assets", "Executive summary",
      response times in ms. It is not a way to find a receipt. No model is
      called per search, and that stays true.
    - **What it carries:** the ask path's money answer, (f) under Step 1,
      still live. Read 2026-09-25: `sum_expenses` (`queryExecutor.ts`) sums
      `TOTAL_AMOUNT` alone, so it also ignores corrections, on top of the
      statuses and duplicates (f) records. The row-amount defect beside it
      was closed by #248.
    - **What it becomes:** a search field, category chips and a month filter,
      with results as the same rows as Home.
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
     **CLOSED 2026-09-26 by #250 (`4c6772a`).** Both halves of the expiry:
     - **No screen asks the ask path for money any more.** Search reads
       `GET /api/search` (`services/ledger/receiptSearch.ts`), which applies
       `ledgerCore.judge` to every row, so a Search total is the ledger's
       total for the same receipts.
     - **`sum_expenses` itself now reads through `judge`** (`queryExecutor.ts`,
       pinned by `queryExecutor.sumExpenses.test.ts`), for its two remaining
       callers: `POST /api/search`, which the Android closed-testing bundle
       still calls, and `GET /api/reports/:id` (`reportController.ts`), which
       no screen calls.
     - **The measurement that ruled it** (read-only, 2026-09-25, recorded in
       #250's description; the script was not kept): in the owner's
       organisation `5ce3e185`, the old answer read USD **64,825.49** where
       the ledger reads **32,992.35**, CAD 9,638.87 against 8,067.83, CHF
       218.00 against 54.50. Across production, 3 of 24 organisations with
       money differed, 9 of 40 currency lines. The cause: 59 flagged
       duplicates and 8 rejected or unread rows carried a `TOTAL_AMOUNT`,
       and 6 corrections were ignored.
     - **The equivalence** (read-only replay on the owner's organisation, same
       day): Search against `readLedgerMonth` over 18 months, each whole month
       and each of the 8 categories, **162 comparisons, 0 mismatches**.
       `receiptSearch.test.ts` holds the same property on the ledger's own
       fixture, with a control that fails.
     - **Residual, named:** the ask path's period is still the upload date,
       not the printed one. Only the Android bundle and the unused reports
       route can see it.
   - **A corrected receipt can show the wrong amount on a Queue or Search row:
     OPEN money defect, live in production today (recorded 2026-09-25).**
     - **The mechanism.** `searchResultCard.getAmount` returns the FIRST fact
       whose `factType` is `AMOUNT`. A correction is written as a SECOND
       `AMOUNT` fact, `key: 'manual_amount'` with no `currency`
       (`documentController.ts`, the fix-action path). So a corrected
       receipt's row shows the old extracted amount, or a bare number with no
       currency, depending on the order the facts arrive.
     - **The ledger does the opposite** (`ledgerCore.ts` rule 2): the
       correction wins, read in the extracted total's currency. Home and the row
       can therefore disagree for the same receipt.
     - **Where it shows:** the Queue (an approved screen) and Search both use
       `getAmount`. The board records 9 stored corrections.
     - **MEASURED 2026-09-25, read-only:** 391 documents; 10 carry a
       `manual_amount`; all 10 count in the ledger by status; **2 of the 10
       showed the wrong amount** on their Queue / Search row (the extraction,
       the correction ignored; one in `5ce3e185`, one in another
       organisation), 8 matched because the correction re-typed the total.
       The bare-number case has 0 instances: `TOTAL_AMOUNT` always comes
       first in the include order. Re-run, never quote: replay the queue's
       include and compare the first AMOUNT fact with the ledger's rule.
     - **FIXED in the detail PR, not the Search PR** (ruled 2026-09-25 on that
       measurement: a live money defect on a screen the owner approved, and
       the detail needed the same helper): `lib/ledgerAmount.ts` applies the
       ledger's rule, `getAmount` (the Queue and Search rows) and the detail's
       top figure both use it, tested with a corrected document whose facts
       arrive in either order (`ledgerAmount.test.ts`).
     - **CLOSED by #248 (`cc8b0c9`), 2026-09-25.** A read-only replay of the
       shipped helper against production's corrected receipts gave 10
       corrected. The old row rule was wrong on 2 (`32425a09`, `3110b78d`),
       the shipped helper on 0: both now show the correction with its
       currency, marked corrected. The production bundle carries the helper.
       The rendered row was not seen on production: the owner's Chrome is not
       signed in there, and `32425a09` belongs to an organisation outside his
       three.
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

- **The reading state. BUILT 2026-10-04 (the reading-state PR), UNJUDGED until
  the owner has used it on the TestFlight build that follows its merge**
  (standing rule 5). The rule it was built to: a document being read shows it,
  however the read started, and the settled state names its verdict.
  - **What it is.** A scan from `CaptureSheet.tsx` opens the receipt screen of
    the new document at once (`navigate` after `trackUpload`; the toast and the
    tray are unchanged). While the row is `PROCESSING` the screen shows the
    picture, "Reading your receipt…" in place of the merchant, the figure's
    place held, one status "Processing", and a note saying where the result
    shows; no facts, no "Needs your attention", no Approve / Reject. It asks
    again every 3 s without the skeleton (`READING_POLL_MS`), says "longer than
    usual" after 90 s and stops asking after 5 min
    (`DocumentDetailScreen.tsx`). A retry from the screen puts it into the
    same state at once and tells the tray (`useProcessingOptional`, so a bare
    render still works). The tray chip, once nothing is in flight, names the
    outcome: a failure, else a document that needs review, else "Processing
    complete" (`processingFailedChip`, `processingNeedsReviewChip`).
    `readingState.test.tsx`, `captureOpensReadingState.test.tsx` and
    `processingChipOutcome.test.tsx` hold it in en/fr/ar; each assertion was
    shown red against the behaviour it replaces.
  - **What was wrong before,** kept for the record: after a retry the screen
    went quiet (`POST /:id/reextract` set `PROCESSING`, the screen had no such
    branch, and `trackUpload` was called from the two upload sheets only); the
    tray said "Processing complete" above a `NEEDS_REVIEW` document.
  - **Not in it: the double skeleton.** Home (`LedgerScreen.tsx`) already
    refreshes without blanking (its own comment at the `refreshCount` effect).
    The screen that still blanks on `fetchData(true)` is `DashboardScreen.tsx`
    at `/overview`, which design step 6 redraws.
  - **JUDGED by the owner on build 15 (2026-10-04): the loop works end to
    end.** One receipt (`scan-20261004-022706.jpg`): the screen opened on it,
    "Reading your receipt…", then Berghotel, 54.50 CHF, Needs review from the
    duplicate rule. The no-total page (`scan-20261004-023106.jpg`): Needs
    review with the "No total line is printed…" sentence, 54.50 at the top.
    Two pages of one receipt (`scan-20261004-023738.pdf`, 2.01 MB): "Pages
    scanned: 2", one PDF, Berghotel, 54.50, Jul 30 2007 read across both
    pages. **The several-pages-one-PDF path has run end to end.** Cancel and
    Choose file: not done on the phone (rule 6 now applies; see below).
  - **Three defects he saw, FIXED in the defects PR (2026-10-04), each cause
    read from the code first, each shown before and after in the harness:**
    1. **An empty grey box where the picture should be, for the whole read.**
       Cause: `getSignedFileUrl.ts` signs a fresh ten-minute URL on every
       detail read, and the reading state's 3 s poll handed each answer
       straight to the screen, so `<img src>` changed every tick and the
       `[signedFileUrl]` effect reset it to the skeleton; on a phone network
       no load finished inside a tick. Fix: the poll keeps the first URL for
       the same document (`DocumentDetailScreen.tsx`, the tick's `setDoc`).
       Harness, image delayed 2.5 s like a phone: before, the card never
       left the skeleton; after, loaded at 4 s and 7 s and settled, one URL.
    2. **The tray chip across Approve / Reject, and over the reason field.**
       Cause: geometry. The chip is `fixed bottom-24` (96 px) for a screen
       with the tab bar; Detail has no tab bar and its bar is `fixed` at
       `safe-area + 0.75rem`, 68 px tall, so with the iPhone's 34 px inset
       the bar spans 46 to 114 px and the chip 96 to 140 px: 18 px over both
       buttons' inner halves. Fix: the tray draws no chip on `/documents/`
       routes (`ProcessingTray.tsx`); the screen carries the state itself,
       the chip returns with the list. Harness with the inset pinned to 34
       px: before, overlap 18 px measured; after, no chip, overlap 0.
    3. **The PDF preview a zoomed fragment ("Walm", a blank strip).** Cause:
       the card showed the PDF through WebKit's plugin in an `<iframe>`,
       which draws at its own zoom and cannot be told to fit or read back.
       Fix: pdf.js (`pdfjs-dist`, loaded on first use, worker as a bundled
       asset) draws page 1 into a canvas at the card's width, cropped from
       the top like a photo (`lib/pdfFirstPage.ts`,
       `components/PdfPagePreview.tsx`); any failure falls back to the link
       row the card had before. Harness: a two-page PDF built the plugin's
       way drew page 1 at 358 x 478 CSS px, the receipt's head readable.
    - **And the two-receipts-in-one-PDF outcome** (his first attempt at check
      3): the refusal is right and stays; the message was wrong because the
      refusal wrote a status and nothing else. `markAsNeedsReview` now takes
      the reason (`MULTIPLE_DOCUMENTS_REASON`, written as the decision facts),
      and Detail says "This file seems to hold more than one receipt or
      invoice, so nothing was read from it. Scan one document at a time and
      upload it again." (en/fr/ar). The emergency fallback with no reason is
      unchanged and still reads "uncertain".
    - Tests: `readingState.test.tsx` (the URL does not rotate),
      `processingChipOutcome.test.tsx` (no chip on a receipt screen),
      `pdfPreview.test.tsx` (drawn, held, fallen back),
      `multipleDocumentsDetail.test.tsx`, `ingestionService.multiDocument
      .test.ts`; four single-line mutants of the fixes each turned the
      matching file red.
  - **What the harness cannot show and the real-backend run does** (rule 6):
    the hand-off from the sheet after a real upload, a real storage URL for
    the picture, and the poll against a real read; see the defects PR for the
    run against the Vercel preview with the review account.
  - **EXPIRY MET 2026-10-04** by the owner's judgement above.
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
  - **MEASURED 2026-10-04 on production `2371c9bd`: 48 of 56 clean real
    receipts landed in "Needs review" with no cause on the receipt (86%,
    Wilson 95% 74% to 93%). Silent errors: 0 of the 7 that landed Processed
    (95% upper bound 35%).**
    - **Sample.** 11 distinct real receipts from the owner's own uploads (of
      95 unique stored files; the rest were templates, stock mock-ups, AI
      images, earlier sessions' fixtures and copies), and 45 of a seeded
      random 140 drawn from Wikimedia Commons' receipt categories (3,532
      photos free-licensed, taken 2010 or later), kept when whole, single and
      legible. Licences: CC BY-SA 4.0 (36), CC BY-SA 3.0 (4), CC BY 4.0 (2),
      CC0 (2), public domain (1). Regions follow Commons: mostly Dutch,
      Taiwanese, Japanese, Polish; 9 English-language receipts in all.
    - **Method.** Merchant, total and date labelled from each image and
      written to disk before any upload. Uploaded one at a time through
      `POST /api/documents/upload` as the owner (org `5ce3e185`), the same
      endpoint Choose file uses; each settled before the next. Cause of each
      status recomputed read-only from the stored text with the conditions of
      `updateDocumentWithExtraction`; control: the recompute reproduced the
      stored status on 56 of 56 rows.
    - **Causes of the 49 rows in Needs review:** English anchor words below
      two, on every non-English receipt (43; French, German, Italian,
      Indonesian, Dutch, Polish, Japanese, Chinese); repeated "total",
      "subtotal", "tax" read as several documents, on English receipts (3 of
      9: Cabana, a US store, TK Maxx); the single-document check refusing a
      file (2: a receipt with its card slip, justified; a Taiwanese
      e-invoice with its sales detail, one transaction, not justified); a
      printed total read as not printed (1, `總計:1`). Only the card-slip row
      had a cause on the paper.
    - **English receipts alone:** 6 of 9 Processed, 3 of 9 in review, all 3
      from the repeated-marker heuristic. That is what an App Store reviewer
      scanning a US receipt meets.
    - **Rule decisions never move status.** `evaluateRulesAndSave` writes
      the decision facts only; status comes from the gate alone. So a
      receipt the duplicate rule flags, or Rule A sends to review, stays
      "Processed" (5 rows here) while Detail shows "Needs your attention".
    - **Reading quality, separately:** total exact on 53 of 54 extracted
      rows; date exact on every scored row; merchant right except the
      collapse below.
    - **Cost:** 110 Gemini calls (56 single-document checks, 54
      extractions, no retries), 158,500 input and 148,076 output tokens,
      $1.57 at the paid tier's published $1.50 / $9.00 per million (AI
      Studio usage, project `gen-lang-client-0493028299`, 3 Oct PT, before
      and after). All 56 rows rejected; read-only: 56 REJECTED in
      `5ce3e185`, none elsewhere, the org's 85 earlier documents unchanged.
    - **EXPIRY:** the gate stops sending a well-read receipt to review for
      its language or for repeating "total", measured the same way with the
      false-review rate reported per language.
    - **CODE HALF DONE 2026-10-05, PR #282:** both conditions left the gate,
      removed rather than replaced. The anchor condition held back exactly
      one bad read in the run (o19, a French receipt whose year was read one
      off, total right), and held it for being French: a date-echo signal
      measured read-only in its place (the stored date in any numeric form,
      Arabic-Indic digits folded, ROC and era years included) catches 0 of
      that 1 and sends 5 of 54 correct reads to review (two English, two
      Japanese, one Dutch). The marker heuristic, narrowed to the owner's
      spec (subtotal and tax no longer counted), still fires on 16 of 162
      earlier rows with text in the owner's orgs, all English, each an
      invoice or receipt printing "invoice", "receipt" or "total" two to
      five times; whole, it fires on 21.
      - **Predicted over the same 56 stored texts, zero cost** (old gate
        recomputed as control, 56 of 56 statuses reproduced): 3 of 56 in
        review, down from 49. By language, old then new: zh 15 then 1 of 16,
        nl 15 then 0 of 15, en 5 then 2 of 11, ja 5 then 0 of 5, pl 5 then 0
        of 5, fr/id/it/de 1 then 0 of 1 each. The 3 are the two
        single-document refusals (decided before this gate) and the `總計:1`
        row (total at 0.6). With no cause on the receipt: 2 of 56 (the
        e-invoice refusal and the `總計` read), down from 48.
      - **The measurement half stays open:** the re-run costs about $1.57
        and needs the owner's approval. The prediction is a recompute of the
        gate, not of the model: it cannot see a different extraction.
      - **PREPARED 2026-10-07, NOT RUN. The re-run, once #283 (the two prompt
        wordings) is merged and `/api/version` reports a commit holding both
        #282 and #283:**
        - **Files:** the same 56 (`manifest-owner.json` + `manifest-commons.json`
          from the 2026-10-04 run, copied out of temp into the 2026-10-07
          session scratchpad `run-prev/`), plus one control the 56 never
          held: the owner's two-page PDF `scan-20261004-023738.pdf` (Walmart
          page, Berghotel page; two purchases, hash `0387db891f826480`). 57
          uploads, as the owner, org `5ce3e185`, one at a time through
          `POST /api/documents/upload`, each settled before the next
          (`run.mjs`), then every row REJECTED through `PATCH
          /documents/:id/status` (`reject.mjs`), counts printed, and the
          org's earlier documents counted unchanged before and after.
        - **Calls and cap:** expected 2 calls per upload, 1 if refused, 3
          with a retry: about 112 calls. Priced at the measured $0.0143 per
          call (158,500 in + 148,076 out over 110 calls, 3 Oct), about
          $1.60 expected; worst case 57 × 3 = 171 calls, $2.45. **Hard cap
          $2.50**: `run.mjs` stops before the upload whose worst case would
          pass it, and `PER_CALL` is corrected from 0.0095 to 0.0143 first.
          Read the Spend page before and the usage page after; the price is
          the same-day token delta, not the estimate.
        - **What it measures, per row:** status as written by the current
          gate; `totalPrinted`; the refusal, if any; merchant, total and date
          against the labels written 2026-10-04.
        - **Separating the gate from the wording.** Four cells, two of them
          free: the gate is a pure function of the stored text (`gate.js`),
          the wording changes only what the model returns. Old text + old
          gate = the 2026-10-04 statuses (`gate.json`, 49 in review). Old
          text + new gate = the 2026-10-05 recompute (3 in review). New text
          + new gate = what this run writes. New text + old gate = `gate.js`
          with the old conditions over the new text, free. The gate's effect
          is the difference down a column (same text); the wording's effect
          is the difference across a row (same gate), and it can only show
          on rows whose extraction changed. The two wordings are judged on
          their target rows directly: c083 (e-invoice with sales detail)
          must not be refused and must read 75 TWD; c119 must come back
          `totalPrinted: true` with 1. Their control: c004 (receipt with its
          card slip) must still be refused, and the two-page PDF must still
          be refused, with MULTIPLE_DOCUMENTS as the reason on both. Any
          other row whose refusal or `totalPrinted` flips is reported by
          name as a side effect of the wording.
        - **Expiry of the item:** the false-review rate per language from
          the new text + new gate cell, with the two refusals and the
          `總計` row accounted for individually.
      - **Residual, registered:** a wrong date at 0.99 confidence is
        invisible to the gate (1 of 54 dated reads here). No language-neutral
        signal measured so far catches it at an acceptable false-review cost.
- **Merchants written only in Chinese, Japanese or Arabic collapse into one
  merchant per organisation. FOUND 2026-10-04 by the measurement above.**
  - `canonicalizeEntityName` (`utils/canonicalName.ts`) keeps `[A-Z0-9\s]`
    and deletes everything else, so a name with no Latin letter or digit
    becomes `''`. `resolveOrGenerateEntity` (`entityResolution.ts`) then
    finds the first entity of the org with `canonicalName: ''` and reuses it.
  - Measured: 9 of 9 all-CJK merchants in the run (McDonald's Japan, Camel
    Mart, 伊神切手社, 美麗華百樂園 and five more) were shown as
    "新宇科技服務(股)公司", the first all-CJK merchant uploaded.
  - **Production before the run: no entity had an empty key** (read-only:
    152 entities, 1 empty, created by the run). The run left that entity
    (`7fb4df45`, org `5ce3e185`, 10 rejected documents attached), so the
    next all-CJK or all-Arabic merchant uploaded to that org will read as
    "新宇科技服務(股)公司" until the code is fixed or the entity removed. For a
    Moroccan user this is every receipt printed only in Arabic.
  - The duplicate rule is safe from it: `checkDuplicate` returns false on an
    empty key.
  - **EXPIRY:** an all-Arabic and an all-CJK merchant each resolve to their
    own entity, held by a test that fails on today's code.
  - **FIXED IN CODE 2026-10-05, PR #282.** A name with no Latin letter is
    keyed from the letters it has (`canonicalName.ts`); every name holding a
    Latin letter keeps its key byte for byte (read 2026-10-05: 152 entities,
    0 keys of digits alone, 1 empty). `resolveOrGenerateEntity` never matches
    an empty key. Held by `canonicalName.test.ts` and
    `entityResolution.test.ts`, 9 cases red on `2371c9bd`.
    - **Entity `7fb4df45` stays as it is.** No production write is needed:
      after the fix nothing can match its empty key, and its 10 documents are
      all REJECTED. Removing it would change nothing a user sees.
    - **Side effect, intended:** the duplicate rule (Rule D) now reaches
      Arabic and CJK merchants, since their keys are no longer empty.
- **Registered 2026-10-05 from the same run, each needing a Gemini call to
  verify, so none is in PR #282:**
  - **The single-document check refuses a Taiwanese e-invoice with its sales
    detail** (one transaction, two printed sections). The prompt in
    `geminiAdapter.ts` asks only "more than one distinct document, receipt,
    or business card?". Proposed wording, to test on the next approved run:
    "A receipt printed with its own itemised detail, QR section or
    duplicate stub is ONE document. A card-terminal slip beside a receipt is
    TWO." The card-slip refusal in the run was fair and must stay.
  - **A printed total read as not printed** (`總計:1`, the row then carries
    "Total not printed" at 0.6). The prompt names Total, Amount due, Net to
    pay and Grand total "in any language"; proposed: add 總計, 合計, 合计,
    المجموع, الإجمالي, Montant, Totaal as examples. Verifiable only by a call.
  - **Rule A is currency-blind:** `amount > 500` fires on the face value, so
    JPY 1,200 and TWD 5,041 read as "Amount exceeds threshold" while MAD 500
    does not. In the run: a "$" on a Taiwanese receipt was stored as USD
    (medFirst, TWD 5,041), and "NTD" and "Rp" as no currency; Rule B (food
    over 50) fires on yen, NT dollars, rupiah and rupees the same way. The
    threshold's currency is the owner's call: the smallest change is a
    per-currency table with MAD as the reference and the rule standing down
    when the currency is unknown. Rule decisions never move status, so this
    shows as "Needs your attention" on Detail, not as "Needs review".
- **A total the page never printed is stored as if it had been. RULED
  2026-10-04: it must say "Needs review", with the figure kept as a draft.**
  Found on the owner's iPhone test of build 13: a page with no Total line came
  back as 54.50, the sum of its items.
  - **Why the code cannot tell.** The prompt calls the total mandatory
    (`2. FINAL TOTAL: The actual amount paid/due. Mandatory.` in
    `geminiAdapter.ts`), and its schema has no field saying whether the figure
    was printed or worked out. Every total is then written with confidence
    0.99 and `sourceSpan: 'Primary Total'`. The two rows of that test
    (2026-09-30T23:43:45Z and 23:53:33Z, organisation `5ce3e185`) hold
    exactly that: `TOTAL_AMOUNT` 54.5, confidence 0.99, "Primary Total",
    byte-identical to a printed total.
  - **Why nothing catches it.** `isWeak` in `persistence.ts` and Rule C in
    `ruleEngineService.ts` react to a MISSING amount only, and nothing reads
    how a total was obtained. Those two rows say "Needs review" for an
    unrelated reason: `decision_reason` is "Possible duplicate expense"
    (Rule D) on both. Uploaded once, the page reaches review only if some
    other check happens to fire.
  - **Why it matters here more than in general.** The ledger counts
    `TOTAL_AMOUNT` as money, and Home leads with that figure. A sum of items
    leaves out tax, service, discounts and tip. On page one of a long receipt
    it also leaves out every item on the pages after it: the multi-page
    ruling exists because "a long receipt carries its total on the last
    page". A page with no Total line is most often exactly that page.
  - **The change, BUILT 2026-10-04 in the reading-state PR:** the prompt's
    schema gains `totalPrinted` (true only when a Total / Amount due / Net to
    pay line with that figure is printed, in any language). An explicit
    `false` writes the total at confidence 0.6 with `sourceSpan
    'Inferred Total'` (`totalProvenance.ts`); anything else, the field absent
    included, is today's 0.99 "Primary Total", so a silent model changes
    nothing. The 0.6 sends the document to review through the existing gate
    (`persistence.ts`, `isReviewed`); Rule E in `ruleEngineService.ts` reads
    the span and writes "Total not printed", and stands down once the owner
    has typed the printed amount (`manual_amount`) or kept the figure
    (`review_action marked_valid`). Detail says it in a sentence (en/fr/ar,
    `reasonTotalNotPrinted`) above the same amount field "Missing amount"
    gets. The figure is kept as a draft; the prompt is not changed to refuse
    a sum. No ledger rule changes: `COUNTED_STATUSES` in `ledgerCore.ts`
    counts NEEDS_REVIEW too, so the figure stays in the ledger; what changes
    is that it waits in the Queue with a reason the owner can read, and an
    edit there is what the ledger then counts. No stored row changes: a
    `TOTAL_AMOUNT` without the span is a printed total, as it was read.
  - **Its control, both ways, measured 2026-10-04 against the pinned model
    (`gemini-3.5-flash` reported), two synthetic receipt photos identical but
    for the TOTAL block, from `apps/backend` with the key loaded by dotenv:**
    with a printed "TOTAL 58.86" (items 54.50 plus tax) the answer was 58.86,
    0.99, "Primary Total", overall 0.99; the same page cut before the tax and
    total lines answered 54.50, 0.6, "Inferred Total", overall 0.795. Both in
    about 5 s, the same as before the field. One pair, not a rate: the
    model's honesty on his real receipts is still the unmeasured part.
    `geminiAdapter.totalPrinted.test.ts`, `ruleEngineService.totalNotPrinted
    .test.ts`, `persistence.inferredTotal.test.ts` and
    `inferredTotalDetail.test.tsx` pin the path; each was shown red against
    the behaviour it replaces.
  - **Cost on the extraction side:** one boolean in the JSON answer and two
    prompt sentences; no second call, no schema change in `types/schemas.ts`,
    no latency the probe could see.
  - **EXPIRY:** a total the page does not print is never COMPLETED: it
    always arrives in the Queue saying it was added up. Judge it on the
    owner's phone with the page that found it.
- **Ingestion durations: the wait the reading state is designed around.**
  - The 2026-09-23 paced run took 8.4 s, then 9.9–16.3 s.
  - Every line of `processUploadAsync` in `ingestionService.ts` is a marker with
    no elapsed time, while `queryExecutor.ts` already records `executionTimeMs`.
  - Per-stage durations say which part can shrink. One candidate is the
    `isSingleDocument` validation call: a separate Gemini call on every document,
    before extraction.
- **Every authenticated request cost 1.75 to 2.5 s to first byte, whatever it
  returned.** Measured 2026-09-25 from the owner's signed-in browser against
  production, three runs each:

  | Route | Size | Time to first byte |
  |---|---|---|
  | stats | 420 bytes | 1.75 s |
  | ledger | | 2.1 s |
  | review | | 2.1 s |
  | detail | | 2.2 s |
  | `/api/version`, no auth, no database | | 0.15 s |

  - **The time is round trips, not work.** One statement costs ~126 ms of
    network and under 1 ms of execution: `EXPLAIN ANALYZE` reads 0.27 ms on
    the review base query, and every index the queries need exists.
  - **Where the round trips come from.**
    - Before every handler, the auth middleware makes a Supabase `getUser`
      call, then a User upsert with nested includes.
    - Each `include` then runs as 4 sequential statements.
  - **Root cause: the backend and the database sit in different regions.** See
    "NOW 2026-09-25" at the top.
  - **Fixed in the perf PR (code only):**
    - A one-minute per-token context cache in the middleware
      (`authContextCache.ts`). It never outlives the token's `exp`, and account
      deletion clears it at once. A repeat request skips `getUser`, `ensureUser`
      and `ensureOrganization`.
    - 20 s request timeouts on the ledger, review, stats, detail and activity
      reads, and 10 s on the session read, each named on screen.
    - On the detail screen, the receipt image holds a frame while it loads and
      says "preview unavailable" when it fails.
  - **What the cache serves stale, for at most 60 s.**
    - Only `{id, email, organizationId}`.
    - Plan, billing and money are read from the database on every request.
    - A signed-out token was already honoured by Supabase until its 1-hour
      `exp`, so the cache adds at most one minute to that.
  - **Re-measure, never quote.** From a signed-in tab, time `fetch` to the five
    routes three times each and read the time to first byte. From
    `apps/backend`, inside `SET TRANSACTION READ ONLY`, replay the handler's
    query with Prisma's query log on.
  - **EXPIRY MET 2026-09-25:** after #247 and the region move, a repeat request
    reads 0.25 to 0.48 s on the four authenticated routes, three runs each from
    the owner's signed-in browser:

    | Route | Repeat request |
    |---|---|
    | stats | 252, 447, 258 ms |
    | ledger | 390, 383, 400 ms |
    | review | 378, 399, 383 ms |
    | detail | 424, 456, 483 ms |

    - **First request after 62 s idle:** 0.9 to 1.4 s, against 2.8 to 3.8 s on
      US East. One 4.2 s outlier fell in a slow two-minute stretch that did not
      recur.
    - **What remains:** a query still costs ~80 ms against a ~20 ms round trip,
      i.e. about four round trips per query through the transaction pooler.
      That is the next lever if speed matters again; measure it before blaming
      distance.
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
5. **A native screen is judged after merge, behind a fallback** (the owner,
   2026-09-30). The owner reviews screens on his iPhone before a merge, and a
   web screen still is. A native piece cannot be: a Vercel preview runs in
   Safari, and TestFlight builds only from `main`, because the `testflight`
   environment's branch policy is `main` alone
   (`gh api repos/{owner}/{repo}/environments/testflight/deployment-branch-policies`),
   a fence the owner chose and keeps. So a native piece merges with a safe
   fallback in place, and he judges it on the TestFlight build that follows.
   The fallback must keep the path that existed before working when the
   native piece fails or is missing, and a test must hold it.
6. **The owner runs no manual tests on his phone** (the owner, 2026-10-04).
   Functional testing is engineering's, by every free means: the unit suites;
   the simulator job (`ios-audit.yml`, dispatched by hand when its path filter
   skips a PR); the phone-viewport harness outside the repository
   (`D:\RAGHAD JAD\sa-search-harness`, `detail.html`, the real `Layout` with
   the service modules replaced; pictures with Playwright at 390 x 844); and
   the real backend with the review account `22d51116`, signed in through an
   admin magic link minted from `apps/backend` with the key dotenv loads,
   with every document it creates rejected afterwards so the ledger is left
   as it was. Each report says what was witnessed (picture, run id) and what
   was not and why. Only an action that genuinely needs a camera on a real
   iPhone is his, named, justified with evidence, and kept to the smallest
   possible step. Rule 5 stands for judgement: he looks at what ships when he
   chooses to; he is not a test script.

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
