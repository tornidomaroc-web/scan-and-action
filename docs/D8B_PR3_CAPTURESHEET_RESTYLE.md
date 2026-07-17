# D8b PR-3 — CaptureSheet restyle (the SECOND modal restyle; validates the vocabulary on a bottom-sheet)

**Explored from:** `main` @ `a0e7a09db01e613cc684135f2177b51a7517c22f` (working tree clean)
**Mode:** read-only mapping + decision pass. No code, DB, or migration touched.
**Date:** 2026-07-17

Every `file:line` below is **re-derived from current source at `a0e7a09`** (i.e. *after* #98 landed).
Nothing is trusted from `D8B_MODAL_MIGRATION_MAP.md` (its refs are stale) or from
`D8B_PR2_DELETE_ACCOUNT_RESTYLE.md`. Where a prior doc or the brief is wrong, it is corrected with
evidence. **CaptureSheet was not touched by #96 or #98**, so its line numbers are close to the map —
but I re-verified all of them, and the map's headline anchor for the guard/dead-branch was already
`:94/:96`, not the stale `:91` in the brief.

---

## 0. Corrections to the brief — read first

| # | Claim as framed | Reality | Evidence |
|---|---|---|---|
| **C1** | "the silent-steering guard at CaptureSheet:94" | `:94` is the **dead `isMultiDoc` line**. The **guard** is `:96`; the native branch is `:97–:100` | `CaptureSheet.tsx:94`, `:96`, `:97` |
| **C2** | dead `isMultiDoc` branch "~:91" | It is **`:94` (declared), `:96` (used)** | `CaptureSheet.tsx:94`, `:96` |
| **C3** | Class-B truncation "~:225" | **Exactly `:225`** — confirmed, no drift | `CaptureSheet.tsx:225` |
| **C4** | scrim question — "which one CaptureSheet uses" | Variant 2: `bg-slate-900/70 backdrop-blur-sm`, **and it must change** — but the change is **/70→/60**, a real (small) pixel move, not a token-only rename | `CaptureSheet.tsx:137`, `:192` vs `tokens.css:48` |
| **C5** | "extract a shared shell in PR 3" (PR-2 §4.3's stated plan) | **I recommend DEFERRING it — and I am contradicting PR-2's own plan with new evidence.** CaptureSheet is a **third** panel geometry, not a second instance of DeleteAccountModal's. No shell has two same-geometry consumers across different files. See §3 | `CaptureSheet.tsx:137` `items-end` vs `DeleteAccountModal.tsx:57` `items-end sm:items-center` vs `UploadModal.tsx:211` `items-center` |
| **C6** | item 7's danger-fill trap applies here | **It cannot — CaptureSheet has no danger/warning/success UI at all.** The only solid fill is the primary CTA. The trap is real but out of reach; the *analogous* trap here is `bg-blue-600` (literal blue, not the accent) | `CaptureSheet.tsx:169`, `:244` |
| **C7** | — | CaptureSheet's close buttons are **already RTL-safe** (in-flow `justify-between`, not `absolute right-2`). It has **zero** physical-direction defects — unlike DeleteAccountModal, which had two. The *only* RTL hazard is the one Class-B truncation | grep: no `absolute`/`right-`/`left-`/`border-l`/`rounded-r` in the file |

---

## 1. Current CaptureSheet — full structure (re-derived)

`apps/frontend/src/components/CaptureSheet.tsx` — **261 lines**.

**Form:** `forwardRef<CaptureSheetHandle>` (`:26`) + `useImperativeHandle` exposing `open()` (`:38–:40`).
This is **not** an `isOpen`-prop modal — it is imperatively opened via a ref handle. Structurally
unlike DeleteAccountModal.

**Props:** `plan?: 'FREE' | 'PRO'` (`:19–:21`) — the anti-steering input. That is the *only* prop.

**State** (`:30–:34`), five vars: `chooserOpen`, `file`, `previewUrl`, `uploading`, `showPaywall`.
Refs: `cameraInputRef` `:28`, `fileInputRef` `:29`.

**Hooks/logic:** `useBackDismiss` **twice** — `:44` (`chooserOpen`), `:45` (`!!file && !uploading`).
`releasePreview` `:47`, `handleFileChange` `:51`, `close` `:65`, `handleRetake` `:72`, `handleExtract`
`:77–:113`.

**Tree — two hidden inputs then TWO independent portals:**

| Element | Lines |
|---|---|
| hidden camera input | `:117–:125` (`data-testid="capture-input"`) |
| hidden file input | `:126–:133` (`data-testid="file-input"`) |
| **Portal A — source chooser** | `:135–:188` (`data-testid="source-chooser"` `:141`) |
| ‣ scrim | `:137` `z-[10000] bg-slate-900/70 backdrop-blur-sm flex items-end` |
| ‣ panel | `:139` `rounded-t-3xl … border-t border-slate-200` |
| ‣ header + close | `:143–:152` (`X` `:150`, `aria-label="Close"` `:147`) |
| ‣ Take Photo CTA | `:155–:173` (`bg-blue-600 text-white` `:169`) |
| ‣ Choose File CTA | `:174–:183` (outline `:179`) |
| **Portal B — confirm sheet** | `:190–:253` (`data-testid="capture-sheet"` `:196`) |
| ‣ scrim | `:192` `z-[10000] bg-slate-900/70 backdrop-blur-sm flex items-end` |
| ‣ panel | `:194` (identical string to `:139`) |
| ‣ header + close | `:198–:211` (close `disabled={uploading}` `:205`, `aria-label="Close"` `:206`) |
| ‣ image preview OR file-meta card | `:213–:231` |
| ‣ **file-meta expression** | `:227` (the `formatFileMeta` dup — §9) |
| ‣ **filename truncate** | `:225` (Class-B — §6) |
| ‣ Retake / Extract actions | `:233–:249` (Extract `bg-blue-600` `:244`) |
| `<PaywallModal>` | `:255` |

**Two portals with the byte-identical scrim+panel wrapper (`:137`/`:139` == `:192`/`:194`).** This is a
genuine within-file duplication and it matters for the shell decision (§3).

### 1.1 Raw literals — CaptureSheet uses ZERO `--sa` tokens

Every colour/radius/type literal is raw Tailwind. Violating lines against the **stricter**
`RAW_PALETTE_EXTENDED` that #98 shipped (`d8bModalRestyle.test.tsx:71–77`):

| Line | Literals |
|---|---|
| `:137`, `:192` | `bg-slate-900/70` *(scrim)* |
| `:139`, `:194` | `bg-white`, `dark:bg-slate-900`, `border-slate-200`, `dark:border-slate-700`, **`rounded-t-3xl`** |
| `:144`, `:199` | `text-slate-900`, `dark:text-white` |
| `:148`, `:207` | `text-slate-400`, `dark:hover:text-slate-200` |
| `:169`, `:244` | `bg-blue-600`, `hover:bg-blue-700`, `shadow-blue-500/25` *(primary CTA)* |
| `:179`, `:237` | `border-slate-200`, `dark:border-slate-700`, `text-slate-700`, `dark:text-slate-300`, `hover:border-blue-500`/`hover:border-slate-400` |
| `:200`, `:222` | `text-blue-500` *(icon tint)* |
| `:217` | `bg-slate-100`, `dark:bg-slate-800` |
| `:220`, `:221` | `bg-slate-50`, `dark:bg-slate-800`, `border-slate-100`, `bg-white`, `dark:bg-slate-900`, `border-slate-200` |
| `:225` | `text-slate-900`, `dark:text-white` |
| `:226` | `text-slate-400` |

`border-slate-*`, `shadow-blue-*` and `hover:border-blue-*` are among these — the exact "holes" #98's
extended list closed. A restyle that only fixed `text-*`/`bg-*` would leave them and **still fail the
PR-3 contract** (which is correct — that is the point of the stricter list).

### 1.2 Coarse typography

- **`font-black` ×7:** `:144`, `:169`, `:179`, `:199`, `:225`, `:237`, `:244`. Banned
  (`d8bModalRestyle.test.tsx:116`).
- **`uppercase tracking-wider` shouting** on every button + the meta line: `:169`, `:179`, `:226`,
  `:237`, `:244`. Out of step with the restyled screens' calm voice (map §3.1).
- **`rounded-t-3xl`** panel (`:139`, `:194`) → `rounded-t-card`. (Not the forbidden `[32px]`, but still
  a raw radius; token radii: `nav 8 / btn 9 / card 12 / pill 999`, `tailwind.config.cjs:68–71`.)
- Ad-hoc sizes: `text-lg` (`:144`, `:199`) → `text-section`; `text-[10px]` (`:226`) → `text-label`;
  the button `text-sm uppercase` → `text-label` without the shout.
- Other raw radii: `rounded-2xl` (buttons/image/card), `rounded-xl` (close/icon-tile) → `rounded-btn` /
  `rounded-card` / `rounded-pill` per the DeleteAccountModal precedent.

---

## 2. The #98 vocabulary — what carries over, what the sheet changes

#98 did not just restyle a modal; it minted a concrete vocabulary. What CaptureSheet **inherits
unchanged**:

| Concern | #98 token/idiom | CaptureSheet adopts |
|---|---|---|
| scrim colour | `bg-overlay` (`--sa-overlay = rgba(15,23,42,0.6)`, `tokens.css:48`) | **yes — but see §2.1, it is a pixel move here** |
| z-index | `z-modal` (`10000`, `tailwind.config.cjs:106`) — **CaptureSheet's exact level, already named** | `z-[10000]` → `z-modal`, zero paint change |
| panel surface | `bg-surface-raised`, `border-line` | direct |
| radii | `rounded-t-card` / `rounded-btn` / `rounded-pill` | direct |
| type scale | `text-title-lg` / `text-section` / `text-label` | direct |
| weight | `font-semibold` / `font-medium` (never `font-black`) | direct |
| ink | `text-ink` / `-secondary` / `-tertiary` / `-muted` | direct |
| primary fill | **`bg-accent text-white`** — the *only* WCAG-safe solid fill (§7) | replaces `bg-blue-600` |
| animation | `animate-in slide-in-from-bottom duration-300` | already present (`:139`), keep |

### 2.1 Where the bottom-sheet genuinely DIFFERS from the centred modal

This is the part the brief asked to be explicit about. Four real differences:

1. **Panel geometry / alignment.** DeleteAccountModal is `items-end sm:items-center` (bottom sheet on
   mobile, **centres on desktop**) with `max-w-[480px]` and full radius `sm:rounded-card`
   (`DeleteAccountModal.tsx:57`, `:61`). CaptureSheet is **`items-end` only** — a pure bottom sheet at
   *every* width, full-bleed `w-full`, top-rounded only (`rounded-t-3xl`), no `max-w`
   (`CaptureSheet.tsx:137`, `:139`). **These are different shells, not a shared one with a prop** (§3).

2. **Scrim value.** CaptureSheet uses `bg-slate-900/**70**` + `backdrop-blur-**sm**` (variant 2);
   the token `bg-overlay` is `/**60**`. The contract bans `bg-slate-`, so CaptureSheet **must** drop it,
   and the only tokenised scrim is `bg-overlay` (`/60`). **Adopting it lightens the scrim 70→60 — a real
   pixel change**, not the "zero pixels moved" that #98 enjoyed (its `--sa-overlay` was defined to
   *equal* DeleteAccountModal's existing `/60`). This is desirable (it converges the sheet onto the one
   scrim value), but it must be **named as a deliberate visual change in the PR**, not smuggled in as a
   token rename. Blur: `backdrop-blur-sm` is not a palette literal and is not banned; I recommend
   keeping `blur-sm` for the sheet (the centred family uses `md`, but the sheet covers less of the
   viewport and `sm` reads correctly) — either is defensible; **decide once and note it**.

3. **Safe-area insets.** CaptureSheet's panel carries `pb-[max(1.25rem,env(safe-area-inset-bottom))]`
   (`:139`, `:194`) — a bottom-sheet concern (home-indicator clearance) that the centred modal handles
   differently (`DeleteAccountModal.tsx:95` puts the inset on the body, with `sm:pb-8` to drop it on
   desktop). **Preserve CaptureSheet's inset exactly.** A shell modelled on the centred modal would get
   this wrong.

4. **Dismiss affordance + the z-ladder role.** CaptureSheet is a `z-modal` opener that renders
   `<PaywallModal>` (`z-modal-top`) inside its own portal (`:255`) — the gap is load-bearing
   (`tailwind.config.cjs:87–91`). DeleteAccountModal is a leaf `z-modal-top`. No drag-to-dismiss exists
   in either (dismiss = scrim tap + hardware back); do **not** add one in a restyle.

**Carries over unchanged:** the token names, the quiet-voice typography, the `font-semibold` weight, the
`bg-accent` fill idiom, the animation, and the contract's structure. **Differs:** alignment geometry,
scrim opacity (a pixel move), safe-area handling, and the two-portal + imperative-`open()` shape.

---

## 3. THE SHELL DECISION — **defer again, to PR 4+. I am overriding PR-2's stated plan, with evidence.**

PR-2 §4.3 concluded: *"Extract the shell in PR 3 (CaptureSheet), with n=2."* **That call was made
before anyone measured CaptureSheet's geometry against DeleteAccountModal's. Measured, the premise does
not hold, and I recommend deferring.**

### 3.1 The evidence that changes the call: there are THREE panel geometries, not two instances of one

| Component | Alignment | Width | Radius | Shell family |
|---|---|---|---|---|
| DeleteAccountModal `:57`/`:61` | `items-end sm:items-center` | `max-w-[480px]` | `rounded-t-card sm:rounded-card` | centred-hybrid |
| PaywallModal (oos) | `items-end sm:items-center` | `max-w-[480px]` | same | centred-hybrid |
| **CaptureSheet** `:137`/`:139` | **`items-end` only** | **`w-full`, no max** | **`rounded-t-3xl` (top only)** | **pure bottom-sheet** |
| UploadModal `:211` | `items-center` | (centred) | (centred) | pure-centred |

"n=2" in PR-2's plan meant *DeleteAccountModal + CaptureSheet*. But those two are in **different
families**. A single shell serving both needs a `variant: 'sheet' | 'centered' | 'hybrid'` prop plus
per-variant width/radius/safe-area/scrim — i.e. a config-heavy component whose body is a `switch`. That
is not an abstraction; it is four inlined components wearing a trench coat.

### 3.2 CaptureSheet's real "n=2" is *within one file* — that argues for a local helper, not a shared shell

The genuine duplication is **CaptureSheet's own two portals** (`:137`/`:139` == `:192`/`:194`,
byte-identical scrim+panel wrapper). That is a real n=2 — but it is one file, written together, identical
by construction. It justifies **at most a local `<BottomSheet>` sub-component inside CaptureSheet**, not
a shared `SheetShell` in `components/`. And even that is marginal: the wrapper is ~2 lines, the two
portals' *bodies* are entirely different (chooser buttons vs preview+actions), and the two
`useBackDismiss` conditions differ (`chooserOpen` vs `!!file && !uploading`) — so a local shell would
have to take the dismiss-condition as a prop anyway.

### 3.3 The back-dismiss trap makes premature extraction actively dangerous

`useBackDismiss` registrations: `CaptureSheet.tsx:44`, `:45`; `DeleteAccountModal.tsx:27`;
`PaywallModal.tsx:39`; **`UploadModal` has NONE** (verified — grep across all four). A shared shell that
*owns* back-dismiss would, when adopted by UploadModal in PR 4, **silently give it hardware-back
dismissal it does not have today** — a behavioural change riding a restyle, the exact anti-pattern the
`isMultiDoc` cleanup was split out to avoid (map §C9). And CaptureSheet's `:45` condition carries the
load-bearing `!uploading` (mirroring DeleteAccountModal's `!isDeleting`, `:27`) — a naive shell with
`useBackDismiss(isOpen, onClose)` would destroy the lock. Designing that API correctly needs the
UploadModal case *in hand*, which is PR 4.

### 3.4 The durable half is already shipped

The two things that had to be settled early — the **scrim value** and the **z-scale** — #98 already
shipped as `--sa-overlay` and the named `zIndex` ladder. CaptureSheet consumes both this PR
(`bg-overlay`, `z-modal`). The compounding vocabulary value is captured **without** a component. The
component has no second cross-file consumer of its geometry to answer to yet.

### 3.5 Recommendation

**Defer the shared shell to PR 4 (UploadModal), or better, to a dedicated shell PR once all four
geometries are in view.** In PR 3, restyle CaptureSheet **in place** and do **not** introduce even a
local `<BottomSheet>` — keep this PR a pure restyle + vocabulary-validation, because CaptureSheet's job
in the D8b arc is to *prove the tokens work on a bottom sheet and surface where it differs* (§2.1), not
to abstract. Extraction lands when it has a real, different-file second consumer and the back-dismiss
contract can be designed deliberately with a test.

> **This overrides PR-2 §4.3.** I am not doing so lightly — PR-2's author reserved the shell for "when
> CaptureSheet gives it a second, genuinely different consumer." The measured finding is that
> CaptureSheet gives it a *genuinely different geometry*, which is the opposite of a second instance to
> generalise from. Same principle ("buy certainty before abstracting"), new evidence, later step.

---

## 4. The silent-steering guard (item 4) — CONFIRMED present and covered; DO NOT weaken

**Guard:** `CaptureSheet.tsx:96` `if ((isLimit || isMultiDoc) && plan !== 'PRO')`. Native branch
`:97–:100`:

```
if (isNativePlatform()) {
  showToast(isLimit ? s.freePlanLimitReached : s.freePlanSingleDoc, 'info');  // :100 — NO paywall
} else { … setShowPaywall(true); }                                            // :104 — web only
```

**Coverage:** `nativeAntiSteering.test.tsx:432–491` mounts `CaptureSheet` (`:434`, `:444`), drives an
upload rejection, and asserts via `expectSilentNative` (`:489`): neutral status shows, paywall **never
opens**, no price, no CTA, Paddle never touched, raw code never rendered (`:490`).

**The nuance the brief flagged is exact:** the test drives **`LIMIT_REACHED` only** (`:470`). The
`isMultiDoc` arm — the `: s.freePlanSingleDoc` half of the `:100` ternary — is **never exercised** by any
test. It is both dead in production (§5) and unprotected by the suite.

> **Constraint:** the restyle touches markup, not this logic. `isNativePlatform()` stays the outer
> decision; `setShowPaywall(true)` stays unreachable on native. Do not reorder, inline, or "simplify"
> `:96–:109`. **Android stays silent.**

**Test-coupling to watch:** the guard test finds the submit button by the **text** `'extract'`
(`nativeAntiSteering.test.tsx:477`, `:482`) and the file input by `input[type="file"]` (`:456`). The
restyle must **keep an accessible "Extract" label and the two `type="file"` inputs with their
`data-testid`s** (`:124`, `:132`), or update the test in the same commit, visibly.

---

## 5. The dead `isMultiDoc` branch (item 5) — boundary CONFIRMED, do NOT remove here

- **Declared** `:94`, **used** `:96`. The prose string `'Please upload a single document per image'`
  exists in source at exactly three places: `CaptureSheet.tsx:94`, `UploadModal.tsx:158`,
  `uploadGating.test.tsx:117` — **zero backend occurrences** (re-verified).
- **`s.freePlanSingleDoc` in CaptureSheet is reachable ONLY through this dead branch** (`:100`, the
  ternary's else-arm). CaptureSheet handles one file at a time and has no multi-file guard — so unlike
  UploadModal (where `freePlanSingleDoc` is *also* the live G1 multi-file guard at `:64`), in
  CaptureSheet the collapse `(isLimit || isMultiDoc)` → `isLimit` would be **total and local**, and the
  `s.freePlanSingleDoc` reference would vanish cleanly with it.
- **The trap still stands:** `uploadGating.test.tsx:116` ("GATE 2: the multi-document validation error
  also paywalls non-PRO users") mocks the dead prose string (`:117`) and asserts the paywall opens. It
  is **green today, pinning production-impossible code.** On removal it goes **red and looks like a
  paywall regression** — the classic misread.

> **Boundary for PR 3:** do **not** remove the dead branch in this restyle. It is scheduled as its own
> commit (map §10, the cleanup landing between CaptureSheet and UploadModal). Removing it here would
> bury a behavioural change + a test deletion inside a ~50-literal restyle diff. **PR 3 restyles around
> `:94`/`:96` and leaves the logic byte-for-byte.**

---

## 6. RTL (item 6) — one Class-B truncation, and NOTHING else

**Class-B truncation — CONFIRMED at `:225`** (brief's `:225` is exact; the map's earlier `:221` was
already corrected to `:225`):

```
:225  <p className="… truncate">{file.name}</p>    // user filename, NO dir → Class-B
```

`rtlTruncation.test.ts` covers **Class A only** — a truncating box with **no `dir` at all** is invisible
to CI. In Arabic (page `dir="rtl"`), this box inherits RTL and clips a **Latin** filename from its
**leading** (identifying) end. **Fix:** add `dir="auto"` **on the `<p>`** (the established idiom:
`ActivityScreen.tsx:114`, `ResultTable.tsx:124`, et al.). Do **not** wrap in `<bdi>` — that creates the
Class-A bug and *would* fail CI.

**Every other RTL axis — CLEAN (verified, and better than DeleteAccountModal was):**

- **No physical-direction properties.** Grep for `absolute`/`right-\d`/`left-\d`/`ml-`/`mr-`/`pl-`/`pr-`/
  `border-l`/`border-r`/`rounded-l`/`rounded-r`/`text-left`/`text-right`: **zero matches.** The close
  buttons sit in normal flow via `justify-between` (`:143`, `:198`) — they land at the inline-end in
  both directions automatically. This is the trap DeleteAccountModal fell into (`absolute right-2`) and
  **CaptureSheet does not have it.** The PR-3 contract's `PHYSICAL_DIRECTION` scan
  (`d8bModalRestyle.test.tsx:84–97`) will pass for CaptureSheet as-is — keep it that way.
- **Icon/text order:** buttons are `flex … gap-4` with icon-then-label (`:171`+`:172`, `:246`+`:247`).
  Under RTL, flex reverses so the icon leads from the right — correct reading order. No `flex-row-reverse`
  needed; do not add one.
- **The one caveat the map's §C7 lesson demands:** "no truncate ≠ RTL-safe" cut *against*
  DeleteAccountModal but *for* CaptureSheet — I swept the physical-property class too, and it is genuinely
  clean. Still: **jsdom has no layout engine.** The class-name guard proves no physical property was
  *added*; it does **not** prove the Arabic pixels. Open the Arabic UI at a narrow width and look at the
  filename box (`:225`) after adding `dir="auto"`.

---

## 7. Fills & contrast (item 7) — the danger trap can't fire here; the real trap is `bg-blue`

CaptureSheet has **no destructive, warning, or success surface** — so `--sa-danger`/`-warning`/`-success`
never appear, and the #98 "flips-light-in-dark" trap **cannot occur** unless someone invents such a
surface (do not). The only solid fill behind white text is the **primary CTA**.

**Every fill I propose, with computed contrast (sRGB WCAG 2.1, not estimated):**

| Element (current → proposed) | Fill | vs `text-white` | Light | Dark | AA normal 4.5 |
|---|---|---|---|---|---|
| Take Photo `:169`, Extract `:244` — `bg-blue-600 text-white` → **`bg-accent text-white`** | `--sa-accent #635BFF` | **4.69:1** | #635BFF | #635BFF *(does not flip — `tokens.css:22` == `:103`)* | **PASS** |
| Choose File `:179`, Retake `:237` — `border-2 border-slate-* text-slate-*` → **`border border-line text-ink-secondary`** | *(outline, no fill)* | n/a | — | — | n/a |
| icon tints `:200`, `:222` — `text-blue-500` → **`text-accent`** | *(text on tint/surface)* | ≥ 4.5 on `surface` | — | — | PASS |

`bg-blue-600` today renders **literal Tailwind blue `#2563EB`** (the palette is additive and does not
shadow Tailwind — `tailwind.config.cjs:15`, locked by `designTokens.test.ts`), which is **the wrong hue**
from every restyled screen (the app accent is indigo `#635BFF`). `bg-accent` fixes the hue *and* is the
codebase's only WCAG-safe solid fill. **Verified the accent does not flip across modes** (`#635BFF` in
both `:root` and `.dark`), so 4.69:1 holds light and dark. **Do not** substitute any
`bg-danger/warning/success` fill, and **do not** keep `bg-blue`.

> Computation for `#635BFF` on `#FFFFFF`: L(accent) = 0.1736, L(white) = 1.0 → (1.0+0.05)/(0.1736+0.05) =
> **4.69:1**. (PR-2 reported 4.70; rounding. Either way, PASS AA normal.)

---

## 8. Tests (item 8) — the "locked while uploading" contract, and what silently regresses

**Yes, CaptureSheet has a "locked while working" contract analogous to #98's `isDeleting` — keyed on
`uploading`:**

| # | Path | Site | vs DeleteAccountModal |
|---|---|---|---|
| 1 | hardware-back **unregistered** while uploading | `:45` `useBackDismiss(!!file && !uploading, …)` | same idiom as `:27` |
| 2 | confirm-sheet scrim click-to-close **disabled** while uploading | `:192` `onClick={uploading ? undefined : close}` | same idiom |
| 3 | close (X) button **disabled** (not unmounted) while uploading | `:205` `disabled={uploading}` | DeleteAccountModal **unmounts** its X (`:84`); CaptureSheet **disables** — a real difference, preserve CaptureSheet's |
| 4 | Retake + Extract **disabled** while uploading | `:236`, `:243` | same idiom |

**Severity is lower than #98's** — a background upload is **not irreversible** (the file can be
re-picked; nothing is destroyed), whereas account deletion is. So this contract is a correctness/UX
property, not a safety-critical one. But it is still four easy-to-drop ternaries, and **nothing tests
paths 1–4 directly** — `nativeAntiSteering.test.tsx:432–491` drives the *upload* but asserts anti-steering,
not dismissal-locking.

**What must exist before/with the restyle:**

1. **The PR-3 restyle contract** — add `captureSheet: read('../src/components/CaptureSheet.tsx')` to
   `d8bModalRestyle.test.tsx`'s `FILES` (`:59`); the file's header (`:42`) already says CaptureSheet joins
   in PR 3. The existing `RAW_PALETTE_EXTENDED`, `LEGACY`, `EMOJI`, `font-black`, type-scale, and
   `PHYSICAL_DIRECTION` blocks then apply to it **for free**. **Do not** add the DeleteAccountModal-specific
   `border-s-`/`rounded-e-`/`end-` *requirement* (`:132–137`) to CaptureSheet — it has no logical-direction
   element to require, and forcing one would be cargo-cult (§9).
2. **A DOM-level Arabic assertion** that the filename box (`:225`) carries `dir="auto"` — the one thing
   source-scan + jsdom *can* prove about its single RTL hazard.
3. **The four "locked while uploading" paths** (above) — mirroring the net #98 wrote for `isDeleting`.
   Lower priority than #98's (reversible action) but cheap and it guards a real contract.
4. **Preserve, or update-in-commit, the two markup couplings** the anti-steering test depends on: the
   `'Extract'` button label text and the `type="file"` inputs' `data-testid`s (§4).

**What could silently regress:** (a) the `dir`-less truncate staying `dir`-less (CI won't catch it —
§6); (b) a dropped `!uploading`/`disabled={uploading}` re-enabling mid-upload dismissal; (c) the anti-
steering test breaking on a renamed Extract label and being "fixed" by loosening the query; (d) the
scrim silently going `/60` with nobody noting the intended `/70→/60` convergence (§2.1).

---

## 9. Shared primitives (item 9) — what applies, what would be cargo-cult

**`formatFileMeta` — CONFIRMED duplicated verbatim, and it does NOT belong in PR 3.**

```
UploadModal.tsx:319   {(f.size / 1024 / 1024).toFixed(2)} MB • {f.type.split('/')[1]?.toUpperCase() || 'FILE'}
CaptureSheet.tsx:227  {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type.split('/')[1]?.toUpperCase() || 'FILE'}
```

Byte-identical; no `formatFileMeta` helper exists yet (grep: 0). The `'MB'`/`'FILE'` literals are
untranslated and the number is not locale-grouped (`formatCount`, `lib/formatNumber.ts`, exists for
exactly that). **But extracting it in PR 3 is premature:** a shared helper wants **both** call sites
migrated together to prove the API against two consumers, and UploadModal is PR 4. Extracting it now
means touching UploadModal (out of PR 3's scope) or shipping a one-caller "shared" helper. **Defer
`formatFileMeta(file, s, lang)` to PR 4**, where both sites collapse onto it at once. (This matches PR-2
§7's disposition — it was correctly deferred there too.)

**Genuinely applies (already in use — do not regress):**
- `translateUploadError` (`lib/uploadErrors.ts`) — `CaptureSheet.tsx:103`, `:108`. Keep raw code in the
  error path; translate only at the render/toast site.
- `useBackDismiss` (`:44`, `:45`) — **preserve both, with `:45`'s `!uploading`**.
- `isNativePlatform` (`native/shell.ts`) — the anti-steering gate at `:97`. Untouched.

**Rejected as cargo-cult from the D5/D7 screen restyles (I re-verified each):**
- **`EmptyState`** — for an empty *list*. CaptureSheet renders no list. The chooser is an input
  affordance, not an empty state.
- **`getStatus` / `formatDateValue` / `formatCount`** — operate on document rows / dates / grouped
  numbers. CaptureSheet renders no status, no date; its only number is a file size (→ `formatFileMeta`
  in PR 4, not `formatCount` directly).
- **`SectionHeading`** — for screen sections; a sheet header is not one.
- **The DeleteAccountModal logical-direction *requirement*** (`d8bModalRestyle.test.tsx:132–137`) — #98
  needed `border-s-`/`rounded-e-`/`end-` because it *had* an accent-bar callout and an absolute close
  button. CaptureSheet has neither. Requiring the idiom here would force a logical property onto an
  element that has no physical one to replace — cargo-cult. **Assert the *absence* of physical props
  (shared block), not the *presence* of logical ones.**

---

## 10. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Restyle drops the `dir`-less→`dir="auto"` fix; CI stays green (Class-B invisible) | §6. Add `dir="auto"` at `:225`; DOM-assert it. Verify Arabic in a real browser |
| R2 | Anti-steering test breaks on a renamed "Extract" label and is "fixed" by loosening the query | §4/§8. Keep the label + `type="file"` testids, or update the query in the same commit |
| R3 | A restyler removes the dead `isMultiDoc` branch "while in here", deleting a green test and looking like a paywall regression | §5. **Leave `:94`/`:96` untouched.** Cleanup is its own commit, not PR 3 |
| R4 | `bg-blue-600` → `bg-danger`/any semantic fill, reintroducing the #98 white-on-fill WCAG trap | §7. Only `bg-accent text-white` (4.69:1). No `bg-danger/warning/success` fill exists or should |
| R5 | Scrim silently changes `/70→/60` with no note; or someone "restores" `/70` with a raw literal, failing the contract | §2.1. Adopt `bg-overlay` deliberately, note the convergence in the PR body |
| R6 | Shell extracted from CaptureSheet's within-file n=2, then rewritten at PR 4 (re-touching CaptureSheet), or silently granting UploadModal back-dismiss | §3. Defer the shell; ship a pure in-place restyle |
| R7 | A dropped `!uploading`/`disabled={uploading}` re-enables mid-upload dismissal | §8. Add the four "locked while uploading" tests |
| R8 | Green CI mistaken for RTL correctness | §6. jsdom has no layout engine. Assert classes; **look at Arabic** |

**Anti-steering:** PR 3 touches **no guard**. The `:96–:109` logic is preserved byte-for-byte; only the
surrounding markup is tokenised. **Android stays silent.**

---

## 11. FINAL RECOMMENDATION — PR 3 scope and boundaries

> **Restyle `CaptureSheet` in place onto the #98 vocabulary. Do NOT extract a shell — not shared, not
> even a local `<BottomSheet>` — because CaptureSheet is a THIRD panel geometry (pure bottom-sheet), not
> a second instance of DeleteAccountModal's; the shell has no same-geometry second consumer across files
> yet, and the back-dismiss trap (UploadModal has none) needs PR 4 in hand to design safely. This
> overrides PR-2 §4.3, with the geometry evidence in §3. Migrate the primary CTAs `bg-blue-600` →
> `bg-accent text-white` (4.69:1, the only WCAG-safe solid fill; the danger trap cannot fire here because
> CaptureSheet has no danger surface). Adopt `bg-overlay` and note the deliberate `/70→/60` scrim
> convergence. Adopt `z-modal` (its level, already named — zero paint change). Add `dir="auto"` to the
> one Class-B truncation at `:225` — it is the file's ONLY RTL hazard; everything else is already
> direction-safe, so assert the ABSENCE of physical props, do not require the logical idiom. Leave the
> dead `isMultiDoc` branch (`:94`/`:96`) and the whole anti-steering guard (`:96–:109`) byte-for-byte —
> the cleanup is a separate later commit. Defer `formatFileMeta` to PR 4, where both call sites collapse
> at once.**

### LANDS in PR 3

1. **Tests first / alongside:** add `captureSheet` to `d8bModalRestyle.test.tsx` `FILES` (inherits the
   strict palette, legacy, emoji, font-black, type-scale, and `PHYSICAL_DIRECTION` blocks); a DOM-level
   Arabic assertion that `:225` carries `dir="auto"`; the four "locked while uploading" paths (§8).
2. **The restyle:** ~50 literals across ~19 lines → tokens · `font-black` ×7 → `font-semibold` +
   type-scale · drop `uppercase tracking-wider` · `rounded-t-3xl`/`rounded-2xl`/`rounded-xl` →
   `rounded-t-card`/`rounded-btn`/`rounded-card`/`rounded-pill` · `bg-blue-600 text-white` →
   `bg-accent text-white` · `text-blue-500` icon tints → `text-accent` · scrim → `bg-overlay` · `z-[10000]`
   → `z-modal` · panel → `bg-surface-raised border-line`.
3. **The one RTL fix:** `dir="auto"` on `:225`. (No physical-property fix needed — there are none.)

### DEFERS (explicitly)

- **The shared shell / `SheetShell` / `ModalShell`** → **PR 4 or a dedicated shell PR**, once all four
  geometries and the UploadModal back-dismiss decision are in view (§3). Overrides PR-2 §4.3.
- **The dead `isMultiDoc` branch** → its own cleanup commit, *after* this restyle (§5). Deleting
  `uploadGating.test.tsx:116–125` belongs with it, not here.
- **`formatFileMeta`** → PR 4, both call sites at once (§9).
- **UploadModal's missing `useBackDismiss`** → PR 4, deliberately, with a test — never as a shell side
  effect (§3.3).
- **The scrim blur `sm` vs `md`** → a one-time call in this PR; I recommend keeping `sm` for the sheet.
  Note it; don't agonise.

### The counter-argument, and why I reject it

*"PR-2 already decided the shell lands in PR 3 — just do it."* PR-2 decided that **before** measuring
CaptureSheet's geometry, on the assumption it would be a second instance to generalise from. It is not —
it is a third, distinct geometry (§3.1), and the only place its duplication is total is *within its own
two portals*, which argues for a local helper at most. Extracting a shared shell from the least
representative pair, while it also carries the compliance-sensitive anti-steering guard and the
back-dismiss trap, is exactly the "invent the abstraction inside the risky surface" mistake PR-2's own
ordering exists to avoid. The vocabulary's durable half (scrim token, z-scale) already shipped in #98
and CaptureSheet consumes it this PR — so nothing compounding is lost by waiting. **Same principle, new
evidence, one PR later.**

---

**Explored from `main` @ `a0e7a09db01e613cc684135f2177b51a7517c22f`.** No code, DB, or migration touched.
Every `file:line` re-derived from current source; contrast computed, not estimated; Arabic hazards
identified by class/structure (the one truncation) — and the Arabic pixels must still be checked in a
real browser, because jsdom has no layout engine and green CI proves nothing about RTL.
