# D8b PR-2 — DeleteAccountModal visual restyle (the FIRST modal restyle in the D-series)

**Explored from:** `main` @ `a88d9030a3a516ec3dce06f68904246fd9e71bb6` (working tree clean)
**Mode:** read-only mapping + decision pass. No code, no DB, no migrations touched.
**Date:** 2026-07-16

Every line number below was **re-derived from current source**. Nothing is trusted from
`D8B_MODAL_MIGRATION_MAP.md`'s body — its DeleteAccountModal refs are stale by +5 (its own
appendix, §C3, says so). Where the map or the framing is wrong, it is corrected with evidence.

---

## 0. Corrections to the framing — read this first

Nine findings contradict the brief, the map, or both. The first two change the plan.

| # | Claim as framed | Reality | Evidence |
|---|---|---|---|
| **C1** | *"DeleteAccountModal and PaywallModal:52 carry byte-identical overlay strings"* — implying one shell | **True but unrepresentative: that is 3 of 7 portal sites. There are FOUR distinct scrims.** The **panel**, not the overlay, is the real identical duplication (3/3 byte-identical) | §4.1 |
| **C2** | Map §2.3: *"the destructive red header maps to `danger`"* | **Disproven — a naive `bg-red-600 text-white` → `bg-danger text-white` migration FAILS WCAG AA: 2.77:1 in dark mode**, worse than today's 4.83:1 | §2.3 |
| **C3** | *"DeleteAccountModal has zero Class-B exposure"* (map §4) → reads as "RTL-safe" | **True about truncation, but it has TWO live physical-direction RTL defects** at `:80` and `:93`. No `truncate` ≠ no RTL hazard | §6 |
| **C4** | Making the restyle contract green proves migration | **The contract has holes**: `border-slate-`, `border-red-`, `shadow-red-` are **not banned**. DeleteAccountModal would keep 4 raw literals and CI would pass | §3.2 |
| **C5** | *"`formatFileMeta` is NOT needed here"* | **CORRECT — confirmed.** No file, size, type or date is rendered anywhere in the modal | §7 |
| **C6** | Tokens can express this modal | **No overlay/scrim token exists. No on-danger text token exists.** Both must be invented | §2.2 |
| **C7** | #96 built "the first coverage this path ever had" | True — but it covers the **error path only**. The **"cannot dismiss while deleting" contract (4 independent paths) has ZERO tests** and is the biggest silent-regression risk | §8.1 |
| **C8** | — | **`UploadModal` is the only overlay with NO `useBackDismiss`.** A shell that owns back-dismiss would *silently change UploadModal's native behaviour* in PR 4 | §4.4 |
| **C9** | — | **`PaywallModal` is NOT in D8b's scope** (the map's title names three modals; Paywall is not one). Tokenising the scrim naively would ship a **lasting two-scrim inconsistency** | §4.5 |

---

## 1. Current structure (re-derived from source)

`apps/frontend/src/components/DeleteAccountModal.tsx` — **146 lines**.

**State** (`:20`, `:21`, `:24`) — three vars:

| State | Line | Note |
|---|---|---|
| `confirmText: string` | `:20` | type-to-confirm input |
| `isDeleting: boolean` | `:21` | **gates four dismissal paths — see §8.1** |
| `error: string \| null` | `:24` | **holds a RAW CODE** since PR #96, translated at `:120` |

**Hooks / logic:** `useBackDismiss(isOpen && !isDeleting, onClose)` `:27` · early `return null` when `!isOpen` `:29` · `email` `:31` · `canDelete` (case-insensitive email match) `:35` · `handleDelete` `:37–:53`.

**Tree:** `createPortal` `:55` → overlay `:56–:59` → panel `:60–:66` (`role="dialog"` `:63`, `aria-modal` `:64`, `aria-label` `:65`) → red header `:67–:85` (icon tile `:69`, `<AlertTriangle>` `:70`, h2 `:72`, close button `:76–:84`) → body `:87` (warning `:88`, **subscription notice `:93–:97`**, label `:100`, input `:103–:115`, error `:118–:122`, actions `:124–:140`) → `document.body` `:144`.

**Props:** `isOpen`, `onClose`, `onDeleted` (`:10–:15`). **No `plan` prop, no paywall, no upload, no `isNativePlatform()` branch** — confirmed by reading all 146 lines. Mounted from exactly one place: `SettingsScreen.tsx:268`.

---

## 2. Raw literals vs `--sa` tokens

**Zero `--sa` token utilities today.**

### 2.1 Exact enumeration — 14 violating lines, 39 hits

Scanned mechanically against the contract's own lists — `RAW_PALETTE` (`documentDetailRestyle.test.tsx:465–470`), `LEGACY` (`:471`), `EMOJI` (`:472`) — not counted by eye. (The map's "~40 across 17 lines" was close.)

| Line | Violations |
|---|---|
| `:57` | `bg-slate-` ×1 *(the scrim)* |
| `:61` | `bg-white`, `dark:bg-slate`, `bg-slate-`, `dark:border-`, **`rounded-[32px]`** |
| `:67` | `bg-red-` *(the header fill)* |
| `:69` | `bg-white` *(`bg-white/20` icon tile)* |
| `:72` | **`font-black`** |
| `:80` | `bg-white` *(`hover:bg-white/10`)* |
| `:88` | `text-slate-` ×2, `dark:text-` |
| `:93` | `bg-amber-` ×2 |
| `:94` | `text-amber-` ×2, `dark:text-` |
| `:100` | `text-slate-` ×2, `dark:text-`, **`font-black`** |
| `:114` | `dark:bg-slate`, `text-slate-`, `bg-slate-` ×2, `dark:text-`, `dark:border-` |
| `:119` | `text-red-` ×2, `dark:text-` |
| `:128` | `bg-red-` ×2, **`font-black`** |
| `:135` | `text-slate-` ×2, `bg-slate-` ×2, `dark:text-` |

Totals: `text-slate-` 7 · `bg-slate-` 6 · `dark:text-` 6 · `bg-white` 3 · `bg-red-` 3 · `font-black` 3 · `dark:bg-slate` 2 · `dark:border-` 2 · `bg-amber-` 2 · `text-amber-` 2 · `text-red-` 2 · `rounded-[32px]` 1.

### 2.2 Two tokens the vocabulary NEEDS and does not have

**(a) No overlay/scrim token.** Grepped `tokens.css` and `tailwind.config.cjs` for `overlay|scrim|backdrop`: **zero matches.** The scrim `bg-slate-900/60` (`:57`) has no token equivalent, yet `bg-slate-` is banned by the contract. **PR 2 cannot satisfy the contract without inventing this token.**

**(b) No on-danger text token.** `--sa-danger-text: #B23A2E` (`tokens.css:56`) is *danger-coloured text on a light surface* — **not white text on a danger fill**. There is no `--sa-on-danger`. See §2.3.

> **Why PR 2 may invent `--sa-overlay` but must NOT invent a solid-danger token.** `tokens.css:1–7` states the values are *"Extracted from the approved Claude Design file"* — it is a sourced brand artefact, not a free-for-all. `--sa-overlay` merely **codifies a value already shipped** (`rgba(15,23,42,0.6)` = today's `slate-900/60`), so it invents nothing. A `--sa-danger-solid` + `--sa-on-danger` pair would require **new hue decisions in two modes** that the design file never specified — a brand call that belongs to the design owner, not a restyle PR. That asymmetry is why §2.3 recommends the quiet pattern rather than a tokenised saturated header.

### 2.3 ⚠️ THE FINDING THAT DECIDES THE HEADER: `bg-danger text-white` fails WCAG

The map (§2.3) says the red header "maps to `danger`". **Computed, it does not.** `--sa-danger` is `#D9584A` in light (`tokens.css:55`) but flips to a *light* red in dark mode (`tokens.css:122`, inside the `.dark` block opened at `:91` → `#F87171`) because the semantic tokens are designed as **text/dot/icon colours on dark surfaces**, not as fills:

| | Contrast vs `text-white` | AA normal (4.5) | AA large (3.0) |
|---|---|---|---|
| **Today** `bg-red-600` `#DC2626` | **4.83:1** | PASS | PASS |
| `bg-danger` light `#D9584A` | **3.86:1** | **FAIL** | PASS |
| `bg-danger` **dark** `#F87171` | **2.77:1** | **FAIL** | **FAIL** |

**The naive migration is an accessibility regression that fails even large-text AA in dark mode.** And it would be inherited three times: CaptureSheet and UploadModal have saturated `bg-blue-600` headers.

For contrast, the accent *is* safe as a fill (`--sa-accent: #635BFF` is identical in both modes → **4.70:1**, PASS) — which is exactly why `bg-accent text-white` is the codebase's only established solid-fill idiom (`FixActionPanel.tsx:88`, `Layout.tsx:90`, `BottomTabBar.tsx:68`, `DashboardScreen.tsx:445`).

**The system's actual danger idiom is quiet** — tint surface + `-text` foreground + `/30` border:
- `ErrorState.tsx:17–21` — `border-danger/30 bg-danger-tint` + `bg-danger/15 text-danger` icon tile + `text-danger-text` heading. **Contrast 5.17:1, PASS.**
- `DecisionBanner.tsx:50` — `bg-danger-tint border-danger/30 text-danger-text`.
- `ClarificationCard.tsx:10–15` — the same shape for `warning`.

`bg-danger`/`bg-warning`/`bg-success` appear as **fills only for 2×2 status dots and an 18px badge** (`SharedComponents.tsx:35`, `DashboardScreen.tsx:64`, `BottomTabBar.tsx:44`) — never behind body text.

---

## 3. Typography

`tailwind.config.cjs:84–91` exposes `text-kpi`/`text-title-lg`/`text-section`/`text-label`. **The modal uses none of them.**

- **`font-black` ×3** — `:72`, `:100`, `:128`. Forbidden by `documentDetailRestyle.test.tsx:484–488`.
- **`rounded-[32px]`** at `:61` (`rounded-t-[32px] sm:rounded-[32px]`) — literally the forbidden mega-radius. Token radii top out at `--sa-radius-card: 12px` (`tokens.css:63`).
- **`uppercase italic`** h2 at `:72` — the map (§3.2) calls this "out of step with the restyled screens' calm voice". Agreed.
- Ad-hoc sizes: `text-2xl` `:72` → `text-title-lg`; `text-sm` `:94`/`:100`/`:119` → `text-label`/`text-section`; `text-lg` `:128`.

### 3.2 ⚠️ The contract has holes — green ≠ migrated

`RAW_PALETTE` (`documentDetailRestyle.test.tsx:465–470`) bans `text-*`/`bg-*` but **not `border-*` or `shadow-*`**. These would survive a "green" restyle:

| Hole | Site |
|---|---|
| `border-slate-200` / `border-slate-700` | `:61`, `:114` |
| `focus:border-red-500` | `:114` |
| `shadow-red-500/20` | `:128` |

**Closing the holes is FREE.** I tested a stricter list (`border-slate-`, `border-blue-`, `border-red-`, `border-amber-`, `border-emerald-`, `border-rose-`, `border-gray-`, `shadow-blue-`, `shadow-red-`, `shadow-emerald-`, `shadow-amber-`, `text-gray-`, `bg-gray-`) against **all eight** already-restyled files (`DocumentDetailScreen`, `DecisionBanner`, `FixActionPanel`, `SharedComponents`, `ActivityScreen`, `DashboardScreen`, `SearchScreen`, `ReviewQueueScreen`): **every one still passes.** No restyled file needs touching.

Each restyle PR already writes its **own** contract file (`documentDetailRestyle`, `activityRestyle`, `dashboardRestyle`, `searchRestyle`), so a stricter D8b list is **local and free**.

---

## 4. THE SHELL DECISION

### 4.1 The framing is based on a real duplication, but the wrong one

*"Byte-identical overlay strings"* is true — for **3 of 7** portal sites. Measured:

| Variant | Sites | String |
|---|---|---|
| **1** | `DeleteAccountModal.tsx:57`, `PaywallModal.tsx:52`, `PaywallModal.tsx:141` | `… z-[11000] flex justify-center items-end sm:items-center bg-slate-900/60 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-300` |
| **2** | `CaptureSheet.tsx:137`, `CaptureSheet.tsx:192` | `… z-[10000] bg-slate-900/70 backdrop-blur-sm flex items-end` |
| **3** | `UploadModal.tsx:211` | `… z-[10000] flex justify-center items-center bg-gray-900/80 dark:bg-black/60 backdrop-blur-sm p-4` |
| **4** | `ProWelcome.tsx:20` | `… z-[12000] flex justify-center items-center bg-slate-900/70 backdrop-blur-md p-4 animate-in fade-in duration-300` |

**Four distinct scrims.** Opacity varies **60/70/80**; blur varies **md/sm**; **UploadModal uses a different base palette entirely** (`bg-gray-900/80 dark:bg-black/60`) and is the **only** overlay with a `dark:` variant. A shell designed from DeleteAccountModal would encode variant 1 and meet three surprises later.

**The genuinely identical duplication is the PANEL** — byte-identical across **3 of 3** centered modals (`DeleteAccountModal.tsx:61`, `PaywallModal.tsx:56`, `PaywallModal.tsx:145`):

```
w-full max-w-[480px] bg-white dark:bg-slate-900 rounded-t-[32px] sm:rounded-[32px] shadow-2xl
overflow-y-auto max-h-[92vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-300
border border-slate-200 dark:border-slate-800
```

But **both** its consumers besides DeleteAccountModal are `PaywallModal` — see §4.5.

### 4.2 The z-index ladder, as found (undocumented folklore, now written down)

**8 `createPortal` sites across 6 components.** Full ladder:

| z | Component | Site |
|---|---|---|
| `z-[60]` | Layout header, BottomTabBar | `Layout.tsx:81`, `BottomTabBar.tsx:58` |
| `z-[70]` | ProcessingTray chip | `ProcessingTray.tsx:45` |
| `z-[9000]` | ProcessingTray expanded | `ProcessingTray.tsx:57` |
| `z-[10000]` | CaptureSheet ×2, UploadModal | `CaptureSheet.tsx:137`, `:192`, `UploadModal.tsx:211` |
| `z-[11000]` | **DeleteAccountModal**, PaywallModal ×2 | `DeleteAccountModal.tsx:57`, `PaywallModal.tsx:52`, `:141` |
| `z-[12000]` | ProWelcome | `ProWelcome.tsx:20` |

Two structural facts worth recording:

1. **The ladder encodes nesting.** UploadModal (`10000`) and CaptureSheet (`10000`) each render `<PaywallModal>` (`11000`) *inside their own portal* — the gap is what makes the paywall paint above its opener. Not arbitrary.
2. **⚠️ `DeleteAccountModal` and `PaywallModal` are at the SAME z (`11000`) and are mounted as SIBLINGS from the same parent** — `SettingsScreen.tsx:263` (Paywall) and `:268` (Delete), with independent state (`:39`, `:40`). If both were ever open, **paint order is decided only by DOM order** (Delete wins, being later). Undefined-by-design rather than a live bug — no path opens both — but a shared scale must not enshrine it.

**A second, independent ordering exists.** `native/overlayStack.ts:10–29` is a **mount-order LIFO** driving the Android back button. z-index is a **hand-picked visual order**. Nothing keeps the two in sync. A shell should eventually own both; **that is an argument for designing it carefully, not quickly.**

### 4.3 ✅ RECOMMENDATION: **restyle in place. Extract the shell in PR 3 (CaptureSheet), with n=2. Do NOT touch PaywallModal.**

Reasoning, strongest first:

1. **You cannot design this API from n=1, and n=1 is the least representative sample.** DeleteAccountModal is the *only* one of the four that is single-portal, centered-only, prop-driven `isOpen`, and guard-free. CaptureSheet needs **two independent portals** (`:136`, `:191`) with **two separate back-dismiss registrations** (`:44`, `:45`) and an **imperative `open()` via `useImperativeHandle`** (`:38`) — not an `isOpen` prop. UploadModal needs a **nested child portal** and carries the only `dark:`-variant scrim. A shell shaped by DeleteAccountModal would be rewritten at PR 3 — **and rewriting it means re-touching DeleteAccountModal**, i.e. the restyle lands twice.

2. **Extraction only pays if it absorbs PaywallModal — and PaywallModal is the price backstop.** The panel string's other two consumers are *both* PaywallModal (`:56`, `:145`). But `PaywallModal.tsx:49` holds the `isNativePlatform()` guard that renders the neutral panel instead of the priced upsell, and `:194`/`:211`/`:248` carry the hardcoded `$9`/`$59`. It is the single most compliance-sensitive component in the app. **Refactoring it inside the first-ever modal restyle — for an abstraction whose API is still unknown — is the worst risk/benefit trade in this batch.** And per §4.5, **PaywallModal is not even in D8b's scope.**

3. **The durable half of the shell needs no component at all.** The two things that *must* be settled now — the **scrim** and the **z-scale** — are **values**, not APIs. Ship them as tokens/constants (§4.6). That captures the vocabulary's compounding value at zero API risk, and PR 3 extracts the component once it has two real consumers to answer to.

4. **The "byte-identical, extract now" argument expires on contact.** PR 2 tokenises DeleteAccountModal's overlay; PaywallModal keeps its literals (it is out of scope). The strings diverge **whatever** we do. Preserving identity would require restyling PaywallModal — back to reason 2.

**What I am rejecting:** extracting `ModalShell` + `SheetShell` now. The map (§8.3) calls it "the single highest-leverage structural output of D8b" — **I agree it is the destination, and disagree it is the first step.** Its own §10 already says the order exists to *buy certainty about the vocabulary* before touching the risky surfaces; extracting the shell from the smallest sample inverts that logic.

### 4.4 ⚠️ A trap for whoever extracts it later

**`UploadModal` never calls `useBackDismiss`.** Registrations: `CaptureSheet.tsx:44`, `:45`, `DeleteAccountModal.tsx:27`, `PaywallModal.tsx:39`, `ProcessingTray.tsx:33`, `ProWelcome.tsx:16`. **UploadModal is absent** — so on Android, hardware-back while it is open does *not* close it.

If a shared shell owns `useBackDismiss`, adopting it in UploadModal **silently changes native behaviour** — probably a fix, but a **behavioural change riding inside a restyle PR**, exactly the anti-pattern the `isMultiDoc` cleanup was split out to avoid. Land it deliberately, with a test, or not at all.

Note also `DeleteAccountModal.tsx:27` passes `isOpen && !isDeleting`, and `PaywallModal.tsx:39` passes a bare `isOpen`. **The `&& !isDeleting` is load-bearing** (§8.1). A shell with a naive `useBackDismiss(isOpen, onClose)` would destroy it.

### 4.5 ⚠️ PaywallModal is not in D8b's scope — which constrains the scrim

The map's title is *"UploadModal, CaptureSheet, DeleteAccountModal"*. **PaywallModal is not one of the three**, and no tracker entry schedules its restyle. So after PR 2, PaywallModal keeps `bg-slate-900/60` **indefinitely**.

If PR 2 gives DeleteAccountModal a *different-looking* scrim, the app ships **two scrims with no scheduled convergence** — and both are reachable from the *same screen* (`SettingsScreen.tsx:263`, `:268`).

**This is solvable, and it decides the token's value:** define `--sa-overlay` to **exactly** today's `slate-900/60` → `rgba(15, 23, 42, 0.6)`. The scrim becomes tokenised and contract-clean while remaining **pixel-identical** to the un-restyled PaywallModal. Zero visual drift; convergence is then a one-line change per component as each is restyled.

### 4.6 What PR 2 should centralise instead of a component

- **`--sa-overlay: rgba(15, 23, 42, 0.6)`** in `tokens.css` (same value in `:root` and `.dark` — `:57` has no `dark:` variant today, so one value is faithful) + `overlay: 'var(--sa-overlay)'` in the Tailwind `colors` map → `bg-overlay`.
- **A named z-scale** replacing the magic numbers, documenting the ladder in §4.2 (including the nesting rationale and the `11000` collision).
- Both are additive, adopted by DeleteAccountModal only, and cost nothing to change later.

---

## 5. `deleteAccountSubscriptionWarning` — compliance

### 5.1 Evidence

`strings.ts:178` (en) / `:503` (fr) / `:828` (ar) — verified 3 occurrences (en/fr/ar parity). Rendered at `DeleteAccountModal.tsx:95`, inside the amber box `:93–:97`. **`SettingsScreen` is reachable on native**, so this text does render inside the Play shell.

Probed mechanically against the anti-steering contract's own detectors (`nativeAntiSteering.test.tsx:83–87`):

| Locale | `PRICE_REGEX` `/\$\s*\d\|\d+\s*\/\s*(mo\|yr\|month\|year)/i` | `FORBIDDEN_CTA` (`Upgrade Now`/`Upgrade to PRO`/`Go PRO`) | URL/link |
|---|---|---|---|
| en | no | no | no |
| fr | no | no | no |
| ar | no | no | no |

**Arabic, verified by code point** (not terminal rendering): 125/175 chars in the Arabic block `U+0600–06FF`; **no bidi/zero-width controls**; Latin runs are exactly `AppStoreGooglePlay` — the brand names, correctly left untransliterated.

**A false positive I must own:** my first probe flagged the Arabic as containing a purchase CTA. **It was my regex, not the copy** — `اشتر` matches `اشتراك` ("subscription", noun) as well as `اشترِ` ("buy", imperative). Re-probed precisely: **zero** buy imperatives (`اشترِ`/`اشتري`/`ابتع`), **zero** upgrade verbs (`ترقية`), 4× `اشتراك` (the noun), and exactly **one** imperative — `ألغِ` = **"cancel"**. The Arabic reads *"Deleting your account does not cancel the active subscription. Cancel it first: in-app subscriptions via App Store or Google Play, and web subscriptions via the billing portal. Otherwise charges may continue."*

### 5.2 Verdict: **compliant, and required. Do not change the copy.**

It contains **no price, no purchase CTA, no link**. It names the billing portal as a **cancellation route**, not a purchase route — the opposite of steering. Its only imperative is *cancel*. Each route is correctly matched to where that subscription can actually be cancelled: a Play subscription **can only** be cancelled through Play; a web subscription **can only** be cancelled through the portal. Omitting either would leave users being charged with no route to stop it — a consumer-protection problem, and the disclosure exists precisely to prevent it (`:92` comment: *"required: deletion does not cancel billing"*).

A native user can hold a **web** subscription (subscribe on web, then install the app), so the billing-portal clause is **not dead copy** on native.

### 5.3 ✅ RECOMMENDATION: **add anti-steering coverage for this modal in PR 2. Change no copy.**

`nativeAntiSteering.test.tsx` contains **zero** references to `DeleteAccountModal` (grep: 0). The gap is **coverage, not conduct**.

PR 2 is the right moment *because* it is the restyle: markup churn is exactly when copy gets "tidied". The guard must assert **both directions**:

- **No steering:** no `PRICE_REGEX` match, no `FORBIDDEN_CTA`, `proComingSoonTitle` never appears, `getPaddle`/`checkoutOpen` never called — reusing the established `expectSilentNative` shape (`nativeAntiSteering.test.tsx:293–:302`).
- **The disclosure still renders** (`strings.<locale>.deleteAccountSubscriptionWarning` present, all three locales). **This half matters more.** The realistic failure here is not someone adding an upsell — it is someone deleting an "ugly amber box" during a restyle. Nothing today would catch that.

---

## 6. RTL — two live defects the map never checked

The map (§4) concluded DeleteAccountModal has **zero Class-B exposure**. **That is true and it is not the whole picture.** Confirmed: **no `truncate` anywhere** in the file, and its only `dir` is `dir="ltr"` at `:109`, which is **correct and deliberate** (an email is LTR regardless of UI language — keep it).

But truncation is one RTL class. **Physical-direction properties are another, and there are two:**

| # | Site | Class | Defect in Arabic |
|---|---|---|---|
| **R-1** | `:80` | `absolute top-2 right-2` | The close button is **pinned to the physical right**. In RTL it should sit at the **inline end** (top-left). It stays top-right — visually detached from the reading order. |
| **R-2** | `:93` | `border-l-4 … rounded-r-2xl` | **The subscription-disclosure box.** Its amber accent bar is pinned to the physical **left** and the rounding to the physical **right**. In Arabic the bar lands on the **trailing** edge and the rounding inverts — the callout points the wrong way. |

**R-2 is the more embarrassing one:** the required compliance disclosure is the element rendering wrong in Arabic.

**The fix idiom already exists in this codebase.** Tailwind is `^3.4.3` (`package.json:44`), so logical properties are available, and there is an exact precedent for R-2 — a left-accent-bar callout done logically:

```
SearchScreen.tsx:204   rounded-e-card border-s-4 border-accent bg-surface-alt px-4 py-3
```

For R-1, `BottomTabBar.tsx:44` uses `-end-2.5`. So: `right-2` → `end-2`; `border-l-4 rounded-r-2xl` → `border-s-4 rounded-e-card`. The codebase already carries **11 `rtl:` variant sites** and `text-start` in 7 files — logical properties are the house idiom, not a new invention.

**⚠️ jsdom cannot prove any of this.** It has no layout engine: it will not tell you which side the bar renders on. So:
- **Test what jsdom CAN prove:** the *class names* — assert the source/DOM carries `border-s-`/`rounded-e-`/`end-` and **not** `border-l-`/`rounded-r-`/`right-`. That is a real, cheap regression guard.
- **It does not prove the pixels.** Per the D5 lesson (`activityRestyle.test.tsx:150–168` exists precisely because green CI, the Vercel preview and jsdom **all** missed a live RTL defect), the Arabic modal must be opened in a real browser at a narrow width. **Green checks prove nothing about RTL.**

---

## 7. Shared primitives — what applies, what would be cargo-cult

**Confirmed: `formatFileMeta` is NOT needed here — your framing is correct.** The modal renders no file, no size, no MIME type, no date. `formatFileMeta` belongs to PR 4 (`UploadModal.tsx:319` / `CaptureSheet.tsx:227` carry the duplicated expression).

**Genuinely applies (already in use — do not regress):**
- `translateAccountError` (`lib/accountErrors.ts:53`) — used at `:120`. **Keep the raw code in state; translate only at the render site.**
- `useBackDismiss` (`:27`) — **with `isOpen && !isDeleting`**, not a bare `isOpen`.

**Applies newly:**
- The **token vocabulary** (§2) and the **logical-property idiom** (§6).
- The **quiet danger pattern** — `ErrorState.tsx:17–21` is a directly reusable *shape* for the header (§2.3).

**Rejected as cargo-cult** (extending the map's §8.2 pushback, which I re-verified):
- **`EmptyState`** — for an empty *list*. This modal renders no list.
- **`getStatus`** (`lib/searchResultCard.ts:88`), **`formatDateValue`** (`lib/formatCellValue.ts:32`) — operate on *document rows*. No status, no dates here.
- **`formatCount`** (`lib/formatNumber.ts:13`) — no numbers rendered.
- **`SectionHeading`** — for screen sections; a modal header is not one.
- **`ErrorState` the component** — the error at `:118–:122` is an **inline field-level alert**, not a full-panel error state. Reuse its *visual grammar*, not the component.

---

## 8. Tests — what must exist BEFORE the restyle

### 8.1 ⚠️ The biggest silent-regression risk: the "locked while deleting" contract has ZERO tests

Account deletion is **irreversible**. The modal enforces — through **four independent code paths** — that it cannot be dismissed while the delete is in flight:

| # | Path | Site |
|---|---|---|
| 1 | Android hardware back is **unregistered** while deleting | `:27` `useBackDismiss(isOpen && !isDeleting, onClose)` |
| 2 | Scrim click-to-close is **disabled** while deleting | `:58` `onClick={isDeleting ? undefined : onClose}` |
| 3 | The **close (X) button is unmounted** while deleting | `:76` `{!isDeleting && (` |
| 4 | The confirm button is **disabled** while deleting | `:127` `disabled={!canDelete \|\| isDeleting}` |

**Nothing tests any of them.** `accountErrorI18n.test.tsx` (PR #96, the *only* test referencing this modal) drives the **failure** path exclusively — after which `isDeleting` is already back to `false` (`:51`).

These four are one coherent safety property expressed in four places, each easy to drop in a restyle — especially #1 and #2, whose ternaries look like noise. **This is what must be written first.** A shell extraction (PR 3+) is even likelier to flatten #1 into a bare `useBackDismiss(isOpen, …)` (§4.4).

### 8.2 The rest of the pre-restyle net

1. **A11y invariants** — untested today: `role="dialog"` `:63`, `aria-modal="true"` `:64`, `aria-label` `:65`, `aria-label` on the close button `:79`, the `htmlFor`/`id` pairing `:100`/`:104`, and the `min-h-[44px]` touch targets (`:80`, `:114`, `:125`, `:133`).
2. **`dir="ltr"` on the email input** (`:109`) — deliberate; assert it survives.
3. **The type-to-confirm gate** — `canDelete` (`:35`) is case-insensitive; the button enables only on an exact match. Untested.
4. **RTL class assertions** (§6) — logical props present, physical props absent.
5. **Anti-steering for this modal** (§5.3) — both directions.
6. **The D8b restyle contract** — a new `d8bModalRestyle.test.tsx` mirroring `documentDetailRestyle.test.tsx:457–489`, **with the §3.2 holes closed** (free).
7. **A contrast guard** (cheap, high value): assert that whatever the header fill resolves to, it is **not** paired with `text-white` unless the ratio ≥ 4.5:1. Prevents §2.3 being reintroduced by hand in PR 3/PR 4.

### 8.3 What #96's tests pin — and how the restyle could break them

`accountErrorI18n.test.tsx` is the safety net, and it is **structurally coupled** to the current markup:
- It queries the input by **`#delete-confirm`** — the restyle **must keep that id** (or the test must change in the same commit, visibly).
- It finds the confirm button by **exact text match** on `strings[lang].deleteAccountConfirmButton`.
- It asserts `strings.ar.*` copy reaches `document.body.textContent`.

None of that is fragile *by accident* — but a restyle that renames the id or wraps the button label will turn a **green i18n suite red**, and the failure will look like an i18n regression when it is a selector drift. **Expect it; fix the selector, do not "fix" the modal.**

---

## 9. Risks

| # | Risk | Mitigation |
|---|---|---|
| **R1** | `bg-red-600 text-white` → `bg-danger text-white` ships a **WCAG failure** (2.77:1 dark) and is then copied into CaptureSheet + UploadModal | §2.3. Use the quiet `ErrorState` pattern. Add the §8.2.7 contrast guard so it cannot be reintroduced |
| **R2** | The shell is extracted from n=1 and rewritten at PR 3, re-touching DeleteAccountModal | §4.3. Defer the component; ship the scrim + z-scale as values now |
| **R3** | The scrim is tokenised to a *new* value → two scrims, PaywallModal unscheduled | §4.5. Define `--sa-overlay` = `rgba(15,23,42,0.6)` = today's exact value. Pixel-identical |
| **R4** | The restyle silently drops one of the four **"locked while deleting"** paths | §8.1. Write those tests FIRST — they do not exist |
| **R5** | The amber disclosure box gets "tidied away" during the restyle | §5.3. Guard its **presence**, in all three locales |
| **R6** | Green CI is mistaken for RTL correctness | §6. jsdom has no layout engine. Assert classes; **verify Arabic in a real browser** |
| **R7** | A "green contract" is mistaken for a completed migration | §3.2. Close the holes — it is free |
| **R8** | #96's i18n suite goes red on a selector change and is misread as an i18n regression | §8.3. Keep `#delete-confirm`; if the selector must change, do it visibly in the same commit |
| **R9** | Touching PaywallModal to "share the shell" destabilises the price backstop | §4.3. **PR 2 does not touch PaywallModal.** It is out of D8b's scope entirely |
| **R10** | A shell adopting `useBackDismiss` silently changes UploadModal's native back behaviour | §4.4. Land that deliberately with a test in PR 4, never as a refactor side effect |

**Anti-steering:** PR 2 touches **no guard**. DeleteAccountModal has no `plan` prop, no paywall, no upload, no `isNativePlatform()` branch (all 146 lines read). PR 2 **adds** the first anti-steering coverage this modal has ever had. **Android stays silent.**

---

## 10. FINAL RECOMMENDATION — PR 2 scope and boundaries

> **Restyle `DeleteAccountModal` in place onto tokens. Do NOT extract the shell — ship the scrim and z-scale as VALUES, and extract the component in PR 3 when CaptureSheet gives it a second, genuinely different consumer. Do NOT touch `PaywallModal`. Replace the saturated red header with the system's established quiet danger pattern, because `bg-danger text-white` fails WCAG AA at 2.77:1 in dark mode. Fix the two physical-direction RTL defects using the `SearchScreen.tsx:204` idiom. Write the "locked while deleting" tests FIRST — that contract has four independent paths and zero coverage today. Add the modal's first anti-steering guard, asserting both that nothing steers AND that the disclosure still renders. Change no copy.**

### LANDS in PR 2

1. **Tests first** (the net does not exist): the four **"locked while deleting"** paths (§8.1) · a11y invariants · `dir="ltr"` · the type-to-confirm gate · RTL class assertions · **anti-steering for this modal, both directions** (§5.3) · `d8bModalRestyle.test.tsx` with the **holes closed** (§3.2) · the **contrast guard** (§8.2.7).
2. **Two additive tokens/values:** `--sa-overlay` = `rgba(15, 23, 42, 0.6)` (**exactly** today's scrim → pixel-identical) and a **named z-scale** documenting §4.2.
3. **The restyle:** 14 lines / 39 literals → tokens · `font-black` ×3 → `font-semibold`/`font-bold` + type-scale classes · `rounded-[32px]` → `rounded-card` · drop `uppercase italic` · **header → the `ErrorState.tsx:17–21` quiet pattern** (`bg-danger-tint`, `border-danger/30`, `bg-danger/15 text-danger` icon tile, `text-danger-text` heading).
4. **The two RTL fixes:** `right-2` → `end-2`; `border-l-4 rounded-r-2xl` → `border-s-4 rounded-e-card`.

### DEFERS (explicitly, so nothing is lost)

- **`ModalShell` / `SheetShell`** → **PR 3**, designed against n=2. It is the right destination, wrong first step (§4.3).
- **`PaywallModal`** → untouched. Out of D8b's scope; the price backstop (§4.3, §4.5).
- **`deleteAccountSubscriptionWarning` copy** → **no change**. Compliant and required (§5.2). The *coverage* gap closes in PR 2; the copy does not move.
- **`formatFileMeta`** → PR 4. Not applicable here (§7) — your framing was right.
- **UploadModal's missing `useBackDismiss`** → flagged, not fixed. A behavioural change; PR 4 with a test, or its own commit (§4.4).
- **The `11000` collision** between DeleteAccountModal and PaywallModal → documented (§4.2), not "fixed". No path opens both; a speculative reshuffle in PR 2 buys nothing.

### The one counter-argument, and why I reject it

*"Extract the shell now — the strings are byte-identical, and DeleteAccountModal is the safe place to do it."* The safety is real; the premise is not. **The overlay is byte-identical across only 3 of 7 portal sites — there are four distinct scrims** (§4.1), and the one place the duplication is total (the panel, 3/3) has **PaywallModal as its other two consumers** — the component holding the `isNativePlatform()` guard and the hardcoded prices, and the one component in this family D8b does not even own. So "extract now" means either designing the API blind from the least representative sample, or opening the price backstop in the first modal restyle PR. **Both are worse than waiting one PR.** Meanwhile the part that genuinely compounds — the scrim value and the z-scale — needs no component at all, and PR 2 ships it.

---

**Explored from `main` @ `a88d9030a3a516ec3dce06f68904246fd9e71bb6`.** No code, DB, or migration touched. Every `file:line` re-derived from current source; contrast ratios computed, not estimated; Arabic verified by Unicode code point.

---

## APPENDIX — correction appended 2026-07-17 (after D8b PR 3 explored + implemented CaptureSheet)

*Appended, not edited into the body above. §4.3's "extract the shell in PR 3" recommendation is
**superseded**. Verified against `main` @ `a0e7a09db01e613cc684135f2177b51a7517c22f`.*

### CORR-1. §4.3 / §10 "extract the shell in PR 3 (CaptureSheet), with n=2" — SUPERSEDED

§4.3 concluded the shared shell should be extracted in PR 3, "with n=2", treating CaptureSheet as a
second instance to generalise DeleteAccountModal's shell from. **That call was made before anyone
measured CaptureSheet's panel geometry against DeleteAccountModal's. Measured, the premise does not hold,
and PR 3 shipped an in-place restyle with NO shell — shared or local.**

The evidence (re-derived at `a0e7a09`): there are **three** panel geometries across the four modals, not
two instances of one.

| Component | Alignment | Width | Radius | Family |
|---|---|---|---|---|
| DeleteAccountModal `:57`/`:61` | `items-end sm:items-center` | `max-w-[480px]` | `rounded-t-card sm:rounded-card` | centred-hybrid |
| PaywallModal (oos) | `items-end sm:items-center` | `max-w-[480px]` | same | centred-hybrid |
| **CaptureSheet** `:137`/`:139` | **`items-end` only** | **`w-full`, no max** | **`rounded-t-3xl` (top only)** | **pure bottom-sheet** |
| UploadModal `:211` | `items-center` | (centred) | (centred) | pure-centred |

"n=2" conflated DeleteAccountModal (centred-hybrid) with CaptureSheet (pure bottom-sheet) — **different
families**. A single shell serving both needs a `variant` prop plus per-variant width/radius/safe-area/
scrim, i.e. four inlined components behind a `switch`. That is not an abstraction; it is the thing the
abstraction was meant to remove.

CaptureSheet's *genuine* duplication is its **own two portals** (`:137`/`:139` == `:192`/`:194`,
byte-identical) — but that is one file, written together, identical by construction. It justifies a
**local** helper at most, and even that is marginal (the wrapper is ~2 lines; the two portals' bodies are
entirely different; their two `useBackDismiss` conditions differ — `chooserOpen` vs
`!!file && !uploading`). PR 3 chose **not** to introduce even the local helper, keeping the PR a pure
restyle + vocabulary-validation.

Two independent reasons reinforce the deferral, both already latent in this doc:
- **§4.4's back-dismiss trap is now load-bearing for the shell's timing.** `UploadModal` has **no**
  `useBackDismiss`. A shared shell that owns back-dismiss silently grants UploadModal hardware-back
  dismissal when adopted in PR 4 — a behavioural change riding a restyle. Designing that API correctly
  needs the UploadModal case *in hand*, which is PR 4, not PR 3.
- **The durable half already shipped in PR 2** as `--sa-overlay` + the named z-scale. CaptureSheet
  *consumes* both in PR 3 (`bg-overlay`, `z-modal`). Nothing compounding is lost by waiting for the
  component.

**Revised recommendation:** extract the shared shell in **PR 4 (UploadModal), or a dedicated shell PR**,
once all four geometries and the UploadModal back-dismiss decision are in view. Same principle this doc
already argued ("buy certainty about the vocabulary before abstracting") — new geometry evidence, one PR
later than §4.3 guessed.

### CORR-2. PR 3's one deliberate pixel move — the scrim `/70 → /60`

PR 2 could define `--sa-overlay` = **exactly** DeleteAccountModal's shipped `slate-900/60`, so "zero
pixels moved" (§4.5). **CaptureSheet did not have that luxury.** Its scrim was `bg-slate-900/**70**`
(variant 2, `:137`/`:192`); the only tokenised scrim is `bg-overlay` = `/**60**`, and the contract bans
`bg-slate-`. So adopting `bg-overlay` **lightens CaptureSheet's scrim 70 → 60 — a real, intentional pixel
change**, called out explicitly in the PR 3 body as convergence onto the one scrim value (not smuggled in
as a token rename). `backdrop-blur-sm` was kept.

Full PR 3 mapping/decision record: `docs/D8B_PR3_CAPTURESHEET_RESTYLE.md`.
