# D8b PR 4 — UploadModal restyle (the LAST and most dangerous D8b piece)

**Explored from:** `main` @ `64aaad72c0296cc0deb7e088abb5b43323b604c6` (working tree clean)
**Mode:** read-only mapping + decision pass. No code, DB, or migration touched.
**Date:** 2026-07-17

Every `file:line` re-derived from current source at `64aaad7` — **after #98, #101, #102**. UploadModal was
last touched by #102 (the `isMultiDoc` cleanup), so its error path is already `isLimit`-only. Older docs'
line numbers are stale; where the brief or a prior doc disagrees with source, it is corrected with
evidence.

---

## TL;DR — PR 4 must be SPLIT into three, and the shell is ABANDONED

The whole D8b sequence exists to isolate silent-regression risk, and it all concentrates here: the
largest file (441 lines), the live multi-file anti-steering guard, the only overlay with no
`useBackDismiss`, and a hardware-back bug that **minimizes the app**. Cramming behavioural + i18n +
restyle into one PR is exactly what the sequencing forbids. Recommendation, argued in §11:

1. **PR 4a — add `useBackDismiss(isOpen, onClose)` + test.** Behavioural fix (today back minimizes the
   app). Its own PR, mirroring the #102 split.
2. **PR 4b — `formatFileMeta` + fix both meta lines.** Cross-file i18n/RTL correctness (dir-less,
   unlocalised in Arabic). Its own PR; touches the already-restyled CaptureSheet too.
3. **PR 4c — the restyle proper: classNames only, no copy change.** Tokens, typography, scrim, the one
   Class-B truncation, `pr-2`→`pe-2`, contrast-safe fills, `uploadModal` into the contract. Copy stays
   English so the anti-steering test couplings never move.
4. **Deferred (own PR): the 19 untranslated strings + hand-rolled pluralization + test-query hardening.**
5. **The shared shell: ABANDON the component; keep the shipped values.** Three geometries, a
   price-backstop consumer out of scope — the component is four components in a trench coat.

---

## 1. Current UploadModal — structure (441 lines, re-derived)

**Props** (`:13–18`): `isOpen`, `onClose`, `onSuccess?`, `plan?`.
**State** (`:22–30`) — **8 vars + 1 ref**: `files` `:22`, `isDragging` `:23`, `uploading` `:24`,
`progress` `:25`, `status` `:26`, `results` `:27`, `fileErrors` `:28`, `showPaywall` `:29`,
`cameraInputRef` `:30`.
**Logic:** reset-on-open `useEffect` `:37–47` · `addFiles` `:49–86` (**the multi-file batch guard**
`:60–75`) · drag handlers `:88–104` · `handleFileChange` `:106–111` · `removeFile` `:113–123` ·
`startUpload` `:125–199` (**the error-path guard** `:157–171`) · `resetToIdle` `:201–204` ·
`if (!isOpen) return null` `:206`.
**Tree:** `createPortal` `:208` → overlay `:209–212` → panel `:213` → header `:217–236` → body `:238–432`
(camera CTA `:240–258`, dropzone `:260–289`, file list `:291–340`, progress/status block `:342–413`,
idle actions `:415–428`) → **`<PaywallModal>` `:434` rendered INSIDE the portal** (nested child).

**Mounted at `Layout.tsx:123`** — the app shell, so it opens over every route incl. `/dashboard`
(a HOME_ROUTE — load-bearing for §4).

**No `useBackDismiss`** anywhere — confirmed: not imported (`:1–11`), not called. It is the **only**
overlay without it (§4).

### 1.1 Raw literals — the worst of the four modals

Every colour is raw Tailwind (the map's "~120 across 44 lines" is the right order of magnitude). The
compliance-relevant clusters, against the stricter `RAW_PALETTE_EXTENDED`
(`d8bModalRestyle.test.tsx:80–86`):

- **Scrim** `:210` — `bg-gray-900/80 dark:bg-black/60` (§2). `bg-gray-` is banned; `bg-black` is **not**
  in the list.
- **Panel** `:214` — `bg-white dark:bg-slate-900 rounded-2xl … border dark:border-slate-800`.
- **Accent CTAs** `:244` (`bg-blue-600 … shadow-blue-500/25 border-blue-500/50`), `:280`/`:283`/`:310`
  (`text-blue-*`), `:405` (`bg-slate-900 dark:bg-blue-600`).
- **Error rows** `:298`, `:304`, `:308`, `:315`, `:333` (`bg-red-*`/`text-red-*`/`border-red-*`).
- **Success block** `:371–393` (`bg-emerald-*`/`text-emerald-*`/`border-emerald-*`) — incl. the trap at
  `:389` (§8).
- **Status icons** `:347` (`text-emerald-600`), `:349` (`text-amber-600`), `:351` (`text-red-600`),
  `:353`/`:362` (`text-blue-600`/`bg-blue-*`).
- **Neutral greys** throughout: `text-gray-*`, `bg-gray-*`, `dark:*-slate-*` (all banned).

### 1.2 Coarse typography + legacy classes

- **`font-black` ×9:** `:244`, `:356`, `:375`, `:383`, `:389`, `:399`, `:405`, `:418`, `:424`. Banned
  (`d8bModalRestyle.test.tsx`).
- **Legacy `btn-primary`/`btn-secondary` ×6:** `:383`, `:389`, `:399`, `:405`, `:418`, `:424`. On the
  LEGACY ban list (`d8bModalRestyle.test.tsx:87`).
- **Ad-hoc sizes:** `text-2xl` `:219` → `text-title-lg`; `text-lg` `:282` → `text-section`; `text-[10px]`
  `:317` and `text-[11px]` `:333` → `text-label`; `uppercase tracking-wider` shout at `:317`.
- **Raw radii:** `rounded-2xl`/`rounded-xl`/`rounded-lg` throughout → `rounded-card`/`rounded-btn`.
  (`rounded-lg` is the *large* size, **not** a `rounded-l` physical property — it does not trip the
  contract's `PHYSICAL_DIRECTION` regex, which requires `rounded-l\b` or `rounded-l-`.)

---

## 2. The vocabulary carry-over — and the scrim is the biggest pixel move of the three

Inherits unchanged from #98/#101: `bg-surface-raised`/`border-line`, `rounded-card`/`-btn`,
`text-title-lg`/`-section`/`-label`, `font-semibold`, `text-ink*`, `bg-accent text-white` (the only safe
fill), `animate-in`. **Where the pure-centred variant genuinely differs:** UploadModal is
`items-center` (not `items-end`), `max-w-[560px]` (not 480), `zoom-in-95` (no `slide-in-from-bottom`),
and it renders `<PaywallModal>` as a nested child portal (`:434`). These are real geometry differences
(§3).

### 2.1 The scrim — quantified, and it moves in BOTH modes

UploadModal's scrim (`:210`) is `bg-gray-900/80 dark:bg-black/60` — **a different base palette from every
other overlay, and the ONLY one with a `dark:` variant.** The token `bg-overlay` is
`rgba(15,23,42,0.6)` = `#0F172A @ 0.60`, same in both modes. Composited (computed):

| Mode | Current | `bg-overlay` | Δ |
|---|---|---|---|
| **Light** (over white) | `#111827 @0.80` → `#414652` | `#0F172A @0.60` → `#6F747F` | **25% less dimming** — visibly lighter |
| **Dark** (over `#0B1220`) | `#000000 @0.60` → `#04070D` | `#0F172A @0.60` → `#0D1526` | pure black → navy, same opacity |

**Should it happen here? Yes, but flag it as the largest scrim move of the three.** The contract bans
`bg-gray-`, so the light scrim **must** change; the only tokenised scrim is `bg-overlay`. `dark:bg-black`
is not banned, but leaving the dark scrim as raw black while the light one is the token would be
inconsistent. Adopt `bg-overlay` for both (keep `backdrop-blur-sm`). Unlike CaptureSheet's `/70→/60`,
this is a **base-palette + opacity** change in light and a **black→navy** change in dark — call it out
explicitly in the PR body. Not a token-rename; a deliberate convergence with a visible delta.

---

## 3. DECISION — the shared shell: **ABANDON the component. Keep the values.**

All geometries are finally in view, and they refute extraction rather than enable it:

| Component | Align | Width | Animation | Back-dismiss condition |
|---|---|---|---|---|
| DeleteAccountModal | `items-end sm:items-center` | `max-w-[480px]` | slide + `sm:zoom-in-95` | `isOpen && !isDeleting` |
| PaywallModal (**oos**) | `items-end sm:items-center` | `max-w-[480px]` | slide + zoom | `isOpen` |
| CaptureSheet | `items-end` | `w-full` | `slide-in-from-bottom` | `!!file && !uploading` (×2) |
| **UploadModal** | **`items-center`** | **`max-w-[560px]`** | **`zoom-in-95`** | **none today** |

**Reasoning, strongest first:**

1. **Three geometries, and even the two "centred" ones differ** (UploadModal `items-center`/560/zoom vs
   DeleteAccountModal `items-end sm:items-center`/480/slide+zoom). A shared shell needs variant props for
   alignment, width, animation, safe-area (sheet-only), the nested-portal case, **and** a back-dismiss
   condition that is different at every single consumer. That is a `switch`-bodied component with an API
   larger than the duplication it removes — the opposite of an abstraction.
2. **The one true duplication is the panel string, shared with PaywallModal — which is out of scope and
   is the price backstop.** Extraction either leaves that duplication (defeating the point) or refactors
   `PaywallModal` — the component holding the `isNativePlatform()` guard (`PaywallModal.tsx`) and the
   hardcoded prices — inside a restyle. That is the worst risk/benefit trade in the codebase, and
   PaywallModal is explicitly not a D8b file.
3. **The compounding value already shipped as VALUES, not an API.** `--sa-overlay` and the named z-scale
   (`tailwind.config.cjs`) landed in #98; all restyled modals consume them. That captured the 80% at 0%
   component risk. A component adds risk for the remaining, non-compounding 20%.
4. **No future modal consumer is in sight.** Extracting a shell at the *end* of the modal work, with
   nothing left to consume it, is speculative abstraction. YAGNI.

**This is the definitive call the sequencing was built toward, and the answer is: the values were the
real output. Decline the component.** Record it in the progress tracker so it is not re-proposed.
(Contradicts nothing — the tracker already said PR 4 is where the shell is "designed once, **or
explicitly declined**.")

---

## 4. DECISION — the missing `useBackDismiss`: **ADD it, its own commit, with a test.**

### What actually happens today (traced, `NativeBackButton.tsx:29–42`)

UploadModal never registers on the overlay stack (`overlayStack.ts`), so on hardware-back:

```
:30  if (closeTopOverlay()) return;   // UploadModal is NOT on the stack → returns false
:33  if (HOME_ROUTES.has(path)) { App.minimizeApp(); return; }   // '/', '/dashboard'
:37  if (MAIN_TABS.has(path))  { navigate('/dashboard'); return; }
:41  navigate(-1);
```

`HOME_ROUTES = {'/', '/dashboard'}` (`:9`). UploadModal is mounted in `Layout.tsx:123` and is opened
primarily from the dashboard. **So today, a native user opens the upload modal, presses hardware-back to
dismiss it, and the app MINIMIZES** (or, from a main tab, navigates the screen *underneath* the still-open
modal). Every other overlay closes on back; UploadModal traps the user and does something surprising.

### Fix or behavioural change? Both — which is exactly why it must not ride the restyle

It is a **fix** (the current behaviour is a bug) but also a **behavioural change** (back's effect changes
from minimize/navigate to close). Per the #102 precedent, behavioural changes get their **own commit with
a test**, never buried in a restyle diff.

**Recommendation: `useBackDismiss(isOpen, onClose)` — bare `isOpen`, NOT `!uploading`.** UploadModal is
**deliberately dismissable mid-upload**: the scrim (`:211`) and header X (`:230`) call `onClose`
**unguarded**, and the comment at `:33–35` states the modal "can close freely" because the app-level tray
owns the in-flight upload. So its back-dismiss must match — bare `isOpen`, like PaywallModal's
(`:39`). Adding `!uploading` would contradict the modal's own scrim/X. **Test:** native back closes the
modal; and it composes with the nested PaywallModal via LIFO (back closes the paywall first when both are
open, then the modal). This also disarms the old shell trap for good: UploadModal will already have the
correct behaviour, so no future adoption can silently change it.

---

## 5. DECISION — `formatFileMeta`: its own PR; localised + dir-safe, not just dedup

The expression is **byte-identical** at **`UploadModal.tsx:318`** and **`CaptureSheet.tsx:226`** (the
brief's `~:319`/`~:227` are approximate):

```tsx
{(f.size / 1024 / 1024).toFixed(2)} MB • {f.type.split('/')[1]?.toUpperCase() || 'FILE'}
```

**The defect is RTL + i18n, not duplication.** The meta `<p>` has **no `dir`** and the string mixes
European numbers + Latin (`MB`, `PDF`) with a neutral bullet. In an Arabic (RTL) paragraph the Unicode
bidi algorithm reorders those runs, so the owner observed **"MB • PDF 0.00"** on the preview — the number
displaced from its logical front. Confirmed in source: **#101 added `dir="auto"` only to the *filename*
`<p>` (`CaptureSheet.tsx:224`), never the *meta* `<p>` (`:225–226`)**; and `UploadModal.tsx:317` is
identically dir-less. It is also **unlocalised**: `MB` and the `'FILE'` fallback are hardcoded English and
the number is not locale-grouped.

**Proposed helper API:**

```ts
// lib/formatFileMeta.ts
formatFileMeta(file: { size: number; type: string }, s: Strings, lang: Lang): string
// → e.g. "0.00 ميغابايت • PDF"  (localised unit, grouped number, extension upper-cased)
```

- **i18n keys needed** (en/fr/ar ×): `fileSizeMb` (the "MB" unit; French wants a `U+00A0` before it),
  and `fileTypeUnknown` (the `'FILE'` fallback). The number uses the existing `formatCount`
  (`lib/formatNumber.ts`).
- **dir-safety:** the call sites wrap the result in a `dir="auto"` `<p>` (or isolate the number with a
  U+2066…U+2069 LTR-isolate). Both meta `<p>`s (UploadModal:317, CaptureSheet:225) get `dir="auto"` **in
  this PR**, symmetrically — so the two files don't diverge.
- **Scope:** its **own PR** (cross-file, i18n/RTL correctness — it touches the already-restyled
  CaptureSheet). Not part of the restyle. Land it before or after PR 4c; if after, 4c must not touch the
  meta line's content or dir (only its className), and this PR rebases trivially.

---

## 6. The live anti-steering guards — CONFIRMED covered; do NOT weaken

- **G1, the multi-file batch guard (LIVE):** `UploadModal.tsx:60–75`. `if (totalPotentialCount > 1)` →
  `plan === 'FREE'` → `isNativePlatform()` → `showToast(s.freePlanSingleDoc, 'info')` (`:64`); web →
  `setShowPaywall(true)` (`:66`); `plan === undefined` → neutral toast (`:72`). Covered by
  `nativeAntiSteering.test.tsx:344–354` (adds 2 files via `input[multiple]` `:331`, asserts the neutral
  status, paywall never opens `:351`, nothing uploads `:353`) and `uploadGating.test.tsx:86–94` (web).
- **G2, the error-path guard:** `UploadModal.tsx:157–171` — post-#102 it is `isLimit`-only (`:158`).
  Native → `showToast(s.freePlanLimitReached)` (`:161`); web → paywall (`:165`). Covered by
  `nativeAntiSteering.test.tsx:356+` and `uploadGating.test.tsx:105–114`.

**Confirmed: all anti-steering tests drive the `isLimit`/`LIMIT_REACHED` arm** (the `isMultiDoc` arm is
gone since #102). The restyle touches **markup only**; leave `:60–75` and `:157–171` byte-for-byte.
`isNativePlatform()` stays the outer decision; `setShowPaywall(true)` stays web-only. **Android stays
silent.**

### 6.1 ⚠️ Test coupling that constrains the restyle's copy

`nativeAntiSteering.test.tsx` (`:361`, `:382`, `:414`) and `uploadGating.test.tsx` locate the submit
button by the **text** `'Start Extraction (1)'`, and both find the dropzone input by `input[multiple]`
(`:331`, `:64`). **The restyle must keep the `'Start Extraction'` copy and the `multiple` attribute**, or
those compliance tests break. This is the single strongest reason the restyle should change **classNames
only, no copy** (§11) — leaving copy English keeps every anti-steering test untouched.

---

## 7. RTL hazards — one Class-B truncation + one physical property (fewer than the map implies)

- **Class-B truncation — `UploadModal.tsx:314`** (brief's `~:315` is close): `<p className="text-sm
  font-bold truncate …">{f.name}</p>` — user filename, **no `dir`**. Same defect as CaptureSheet's; fix
  with `dir="auto"` on the `<p>`. (Do **not** `<bdi>`-wrap — that creates the Class-A bug CI *does*
  catch.)
- **One physical-direction property — `pr-2` at `:293`** (`overflow-y-auto pr-2`, the scroll-gutter). In
  Arabic the scrollbar is on the inline-start, so the gutter should be `pe-2` (padding-inline-end). The
  contract's `PHYSICAL_DIRECTION` regex `/\bpr-\d/` will flag it once `uploadModal` joins FILES. **This is
  the only one** — the `rounded-lg`/`absolute inset-0` matches are false positives (`inset-0` is
  four-sided; `rounded-lg` is a size).
- **Icon/text order:** the header (`:217`), file rows (`:301`), and camera CTA (`:242`, `gap-3`
  icon-then-label) are all in-flow `flex` — they mirror correctly under RTL automatically. **Do not add
  `flex-row-reverse`.** Following #101's framing: assert the **absence** of physical props (the shared
  `PHYSICAL_DIRECTION` block), and do **not** require the logical idiom where the layout is already
  in-flow.
- **Meta line dir** — see §5; owned by the `formatFileMeta` PR, symmetric with CaptureSheet.
- **jsdom has no layout engine.** The class-name guard proves no physical prop was reintroduced; it does
  not prove the Arabic pixels. Open the Arabic UI and look at the file rows.

---

## 8. Contrast — the success button is the live trap; `bg-accent` is the only safe fill

Computed (sRGB WCAG 2.1), for every fill I would place behind `text-white`:

| Fill | Light | Dark | AA normal (4.5) |
|---|---|---|---|
| **`bg-accent`** `#635BFF` (does **not** flip) | **4.70:1** | **4.70:1** | **PASS** |
| `bg-success` (the trap) | `#2E9E6B` → **3.38:1** | `#4ADE80` → **1.74:1** | **FAIL both** |
| *(today's raw `bg-emerald-600` `#059669`)* | 3.77:1 | 3.77:1 | fails normal, passes large |

**`--sa-success` flips light in dark** (`tokens.css:59` `#2E9E6B` → `:126` `#4ADE80`), exactly like
`--sa-danger`. So the success-block **"Manage Files"** button (`:389`, `bg-emerald-600 text-white`) must
**NOT** map to `bg-success text-white` — that computes to **1.74:1 in dark**. Note the current
`bg-emerald-600` is already only 3.77:1 (fails AA normal), so the restyle is a chance to *fix* a
pre-existing borderline. **Map every solid CTA — camera (`:244`), Start Extraction / Manage Files /
Close-modal primaries — to `bg-accent text-white` (4.70:1).** Never `bg-success`/`bg-danger`/`bg-warning`
behind white. The success/status *tint surfaces* (`bg-emerald-50` `:371`) map safely to
`bg-success-tint` + `text-success-text` (the quiet idiom), and the emerald/amber/red **status icons**
(`:347/:349/:351`) become `text-success`/`text-warning`/`text-danger` on a surface (not fills) — safe.

---

## 9. Locked-while-working — UploadModal's contract is INVERTED from #98/#101

Unlike DeleteAccountModal (`isDeleting`, irreversible) and CaptureSheet (`uploading`, guards dismissal),
**UploadModal deliberately does NOT lock dismissal while uploading.** The scrim (`:211`) and header X
(`:230`) call `onClose` **unguarded**; the comment (`:33–35`) is explicit that the modal "can close
freely" because the app-level tray owns the in-flight upload. What `uploading` *does* gate is **editing
affordances only**:

| Path | Site | Effect while uploading |
|---|---|---|
| camera CTA | `:240` `{!uploading && status === 'idle' && …}` | hidden |
| remove-file button | `:322` `{!uploading && …}` | hidden |
| action buttons → progress view | `:342` `uploading || status !== 'idle' ?` | swapped |

**So there is no irreversible-action dismissal lock to protect** — the opposite of #98/#101. The restyle
must **preserve the `!uploading` conditionals** (`:240`, `:322`) so editing affordances stay hidden, but
there is **no "locked dismissal" contract to test**, because dismissal is intentionally open. (This is
also why §4's back-dismiss uses bare `isOpen` — consistency with the deliberate close-freely design.)
These conditionals are currently untested; a small render test that asserts the remove/camera controls
disappear while `uploading` is worth adding with the restyle, but it is UI-state, not a safety contract.

---

## 10. Shared primitives — what applies, what is cargo-cult

**Genuinely applies (in use — don't regress):** `translateUploadError` (`:164`, `:170`, `:334`) — keep
raw code in `fileErrors` state, translate only at the render site; `isNativePlatform` (`:62`, `:159`) —
the anti-steering gate; the token vocabulary + the quiet danger/success **tint** idioms (§8).

**Applies newly:** `formatFileMeta` (§5) and `formatCount` (`lib/formatNumber.ts`) inside it;
`dir="auto"` (Class-B, §7).

**Rejected as cargo-cult from D5/D7 screens (re-verified):** `EmptyState` — UploadModal's idle dropzone
(`:260–289`) is an *input affordance*, not an empty list; `getStatus`/`formatDateValue` — operate on
document rows, none here; `SectionHeading` — a modal header is not a screen section; the
DeleteAccountModal-specific logical-idiom *requirement* (`d8bModalRestyle.test.tsx:132–137`) — UploadModal
has one physical prop to *remove* (`pr-2`), not a logical one to *require*. Assert absence, don't demand
the idiom.

---

## 11. RECOMMENDATION — PR 4 is THREE PRs (plus a deferral), in order

> **Split. The file concentrates all of D8b's silent-regression risk, and it holds three independent
> concerns — a behavioural bug, a cross-file i18n/RTL fix, and a large visual restyle — that the
> sequencing philosophy (proven by the #102 split) says must not share a diff. Abandon the shell.**

### PR 4a — `useBackDismiss` (behavioural, FIRST, its own PR + test)
Add `useBackDismiss(isOpen, onClose)` (bare `isOpen`, §4). Fixes the hardware-back-minimizes-the-app bug.
Test: native back closes the modal, and composes with the nested PaywallModal (LIFO). **Zero restyle, zero
copy change.** Mirrors #102.

### PR 4b — `formatFileMeta` (i18n/RTL correctness, its own PR)
Extract the helper (§5); localise the unit + fallback (new keys `fileSizeMb`, `fileTypeUnknown`), group
the number via `formatCount`; add `dir="auto"` to **both** meta `<p>`s (UploadModal:317, CaptureSheet:225)
so they stop bidi-scrambling in Arabic. Touches the already-restyled CaptureSheet — hence separate.

### PR 4c — the restyle proper (classNames only, NO copy change)
- ~120 literals → tokens; `font-black`×9 → `font-semibold` + type scale; `btn-*`×6 → token buttons.
- **Scrim → `bg-overlay`** (both modes) — flag the pixel move (§2.1: light 25% lighter, dark black→navy).
- **Class-B truncation `:314` → `dir="auto"`**; **`pr-2` `:293` → `pe-2`**.
- **Every solid CTA → `bg-accent text-white` (4.70:1)**; the success/status blocks use tint + `-text` +
  icon-on-surface, **never** `bg-success`/`bg-danger` behind white (§8, the `:389` trap = 1.74:1 dark).
- Preserve the `!uploading` editing-affordance conditionals (`:240`, `:322`) and the anti-steering guards
  (`:60–75`, `:157–171`) **byte-for-byte**.
- Add `uploadModal` to `d8bModalRestyle.test.tsx` FILES (inherits palette + `PHYSICAL_DIRECTION` — the
  latter now flags `pr-2` until fixed). **Do NOT** require the logical idiom (§7, §10).
- **Copy stays English** → the `'Start Extraction (1)'` and `input[multiple]` test couplings (§6.1) never
  move → all anti-steering/gating tests stay green untouched. This is the core safety property of doing
  the restyle as classNames-only, exactly as #101 did for CaptureSheet.

### DEFERRED (own PR, NOT PR 4) — i18n of the 19 untranslated strings
`:72`, `:82`, `:184`/`:188`/`:195`, `:222`, `:225–228`, `:326`, `:349`, `:375`, `:377`, `:385`, `:391`,
`:401`, `:407`, `:420`, `:426`, etc. This is a genuine i18n design task, not mechanical: the toasts at
`:184`/`:188` use **hand-rolled English pluralization** (`document${n>1?'s':''}`) that cannot express
Arabic's six plural forms — it needs count-based/ICU keys. This PR also **hardens the anti-steering test
queries to `data-testid`** (§6.1) *before* translating `'Start Extraction'`, so compliance coverage never
depends on copy. Keeping it out of 4c is what lets 4c stay copy-stable and low-risk.

### The shell — ABANDONED (§3)
Keep `--sa-overlay` + the z-scale (already shipped). Do not extract a component. Record the decision so it
is not re-proposed.

### Ordering & why
4a and 4b are independent and can land in any order (both are non-restyle). 4c ideally lands after 4b (so
it never touches the meta line 4b owns) — or before, with a trivial rebase. The i18n PR lands last, after
4c, because it depends on 4c's final markup and must re-point the compliance queries. **Never** combine
4a/4b into 4c: a behavioural change or an i18n/pluralization change hidden inside a 120-literal restyle is
precisely the failure mode this whole sequence was designed to avoid.

---

**Explored from `main` @ `64aaad72c0296cc0deb7e088abb5b43323b604c6`.** No code, DB, or migration touched.
Every `file:line` re-derived from current source; contrast + scrim composites computed, not estimated;
Arabic hazard identified structurally (the dir-less meta line) — and the Arabic pixels still need a real
browser, because jsdom has no layout engine and green proves nothing about RTL.

---

## CORR-1 — implementation corrections (appended 2026-07-18, post-merge)

This is the exploration/decision doc, written at `64aaad7`. PR 4 shipped as the recommended
three-PR split; the notes below correct what implementation superseded. Per the exploration-doc
discipline, the body above is left **as written** and the deltas are recorded here.

**Landed as three merged PRs (not one):**
- **PR 4a — `#104`** (`c750ec6`): `useBackDismiss(isOpen, onClose)` + test. Bare `isOpen`, as §4/§11.
- **PR 4b — `#105`** (`cf29d81`): `formatFileMeta` + the Arabic meta-line fix, as §5/§11.
- **PR 4c — `#106`** (`097fef7`): the classNames-only restyle, as §11. Shell **abandoned** (§3/§11).

`main` is at `097fef7` after all three. The whole arc is complete.

**1. The number formatter — §5/§11 were WRONG about `formatCount`.** §5 (line ~213) and §11 (4b)
say the meta number "uses the existing `formatCount` (`lib/formatNumber.ts`)". It does **not**, and
must not: `formatCount` is **integer-only** — `new Intl.NumberFormat(language)` with no fraction
digits (`lib/formatNumber.ts:13-16`) — so a `1.23 MB` file would render **`1`**, dropping both
decimals vs today's `.toFixed(2)`. PR 4b instead used a **2-decimal `Intl.NumberFormat`**
(`minimumFractionDigits: 2, maximumFractionDigits: 2`) inside `formatFileMeta`, keeping the same
bare-subtag convention `formatCount` documents (Latin digits on `ar`, localised separator → fr
`0,00`). Verified in this runtime: bare `'ar'` emits Latin digits.

**2. A defect §5 did not anticipate — the French `MO`.** UploadModal's meta `<p>` carried a
`uppercase` class (CaptureSheet's did not). Localising the unit to French `Mo` under `uppercase`
renders **`MO`** — the wrong symbol. `.toUpperCase()` already caps the type token and en `MB` / the
Arabic unit are unaffected by the class, so `uppercase` corrupted **only** the new French unit. PR 4b
removed `uppercase` from that one `<p>` (kept `tracking-wider`); the owner approved keeping this i18n
fix in 4b rather than deferring to 4c.

**3. Line numbers are stale after 4a.** Every `:NN` above was re-derived at `64aaad7`, **before** 4a
inserted the `useBackDismiss` import + comment + call (~+12 lines). Do not trust the body's `:NN` for
UploadModal after 4a. Final landed anchors on `main` (`097fef7`): the two live guards at
`UploadModal.tsx:73` (multi-file batch) and `:171` (`isLimit` error-path); the meta call at
`UploadModal.tsx:331` and `CaptureSheet.tsx:229`; `Start Extraction ({files.length})` at `:439`;
`input[multiple]` at `:285`.

**4. `dir="auto"` split across 4b/4c exactly as §11 planned.** 4b added it to both **meta** `<p>`s;
4c added it to UploadModal's **filename** `<p>` (the Class-B truncation, §7). CaptureSheet's filename
`<p>` already had it from #101.

**5. Everything else shipped as specified.** Shell abandoned (§3); scrim → `bg-overlay` (the biggest
of the three, declared in the #106 body); every solid CTA → `bg-accent` `#635BFF` (4.70:1 both modes),
the success "Manage Files" explicitly **not** `bg-success` (§8 trap: 1.74:1 dark); `pr-2` → `pe-2`
(the only physical prop, §7); copy byte-for-byte unchanged so the anti-steering couplings never moved.
The Arabic render and the lighter scrim were owner-reviewed on the Vercel preview before each merge.
