# Android API 36 — device checklist

**Written 2026-09-03, BEFORE any check was run**, against `cc97e49`. Written first
deliberately: a question authored after its answer is not a check, it is a
description.

**Artifact under test:** debug APK from `:app:assembleDebug` at `cc97e49`
(`minSdk 24`, `targetSdk 36`, Capacitor 8.5.1, AGP 8.13.0, Gradle 8.14.3,
`enableOnBackInvokedCallback="false"`).

## The three rules this file runs by

1. **Every check names its PASS shape and its FAIL shape before it is run.** No
   "have a look". Where a shape is a string, the literal is written out.
2. **UNANSWERABLE IS NOT A PASS.** A check that could not be reached is recorded
   as `U` with the reason and what would close it. `U` never becomes `PASS`
   because nothing bad was seen — nothing was seen at all.
3. **The instrument is named per check.** `EMU` = answerable on the API 36
   emulator. `HW` = needs real hardware and cannot be inferred from the x86 run.
   `STATIC` = needs no device.

---

## A — Anti-steering. The store-removal gate.

The same JS bundle ships to Vercel and into the APK (`webDir: 'dist'`, no
`server.url`), so `$9/mo` is legitimately present in the artifact. Only runtime
behaviour separates correct from catastrophic. `App.tsx:37` is the gate.

### A1. `/` while logged OUT — EMU
**Question:** what does the app show on launch, at `/`?
- **PASS:** the login screen. Literal: `Welcome back` / `Log in to manage your intelligence`.
- **FAIL:** the marketing landing. Literal: any of `$9/mo`, a pricing card, an upgrade CTA.
- **U:** the app does not start, or shows a network/error screen before routing.

### A2. `/` while logged IN — EMU (needs a session)
**Question:** where does `/` land for an authenticated user?
- **PASS:** the dashboard.
- **FAIL:** the marketing landing, or any pricing surface.
- **U:** no session available.

### A3. PaywallModal native branch — EMU (needs a session)
**Question:** on hitting an upload/capture limit, what does the modal show?
- **PASS:** a neutral message; **no price, no CTA**, and `getPaddle()` is never reached.
- **FAIL:** any price string, any "Upgrade"/"Subscribe" button, any checkout redirect.
- **U:** limit not reachable without a session.

### A4. Settings billing card — EMU (needs a session)
**Question:** what does the billing area of Settings render?
- **PASS:** entitlement-only view (plan name/status), no purchase path.
- **FAIL:** a price, a plan picker, a manage-subscription link to a payment page.
- **U:** no session.

---

## B — Back chain under predictive back. The highest behavioural risk.

At `targetSdk 36`, `onBackPressed()` is not called and `KEYCODE_BACK` is not
dispatched. `NativeBackButton.tsx:29` runs a four-level precedence chain and every
modal depends on it. Capacitor's docs are silent on predictive back, so this is
measured, not assumed.

### B1. 3-button nav, no overlay open — EMU
**Question:** after one BACK press on a root screen, is the app still foreground?
- **PASS:** `topResumedActivity=…com.scanaction.app/.MainActivity` still reported.
- **FAIL:** the activity is gone / launcher is foreground — the app exited.
- **U:** the press could not be delivered.

### B2. Gesture nav, no overlay open — EMU
Same question, with `navbar.gestural` enabled and a left-edge swipe.
- **PASS / FAIL / U:** as B1.

### B3. Back closes a modal rather than the app — EMU (needs a session)
**Question:** with an overlay open, does BACK close the overlay and leave the app up?
- **PASS:** overlay gone, app still foreground.
- **FAIL:** app exits with the overlay open, or the overlay stays and nothing happens.
- **U:** no modal reachable without a session.

### B4. **Without** the opt-out — EMU. *This is the measurement.*
Rebuild with `android:enableOnBackInvokedCallback="false"` removed, reinstall,
repeat B1 and B2.
- **PASS:** identical results to B1/B2 → the opt-out is unnecessary and should be removed.
- **FAIL:** app exits where it previously did not → the opt-out is load-bearing and stays, with a measured reason.
- **U:** rebuild or install failed.

*Item 4 is not complete without B4. A B1/B2 pass with the opt-out shipped passes
for a reason we chose, not a reason we learned.*

---

## C — Edge-to-edge and safe area

Enforced since `targetSdk 35`; Android 16 removes the opt-out flag, which this app
never used. The app pads with CSS `env(safe-area-inset-*)`.

### C1. Top inset — EMU
**Question:** is app content legible under the status bar?
- **PASS:** status bar icons legible; app header content below them, not overlapped.
- **FAIL:** header text or controls sitting *under* the status-bar icons.
- **U:** no header rendered on the screen reached.

### C2. Bottom inset — EMU
**Question:** is the bottom-most interactive element clear of the nav bar?
- **PASS:** clear gap; nothing occluded by the nav bar or gesture pill.
- **FAIL:** a button or field overlapped by the nav bar.
- **U:** no bottom-anchored element on the screen reached.

---

## D — Splash

### D1. Splash → first frame — EMU
**Question:** what is on screen between launch and the first React frame?
- **PASS:** the branded splash, then the app. No white flash held.
- **FAIL:** a sustained white/black screen, a stretched or mis-scaled splash, or a crash.
- **U:** transition too fast to sample.

---

## E — Arabic / RTL

### E1. Login screen in Arabic — EMU
Device locale set to `ar`.
- **PASS:** Arabic copy, right-aligned, mirrored layout.
- **FAIL:** English copy, or LTR layout with Arabic text.
- **U:** app does not follow device locale and offers no in-app switch pre-login.

### E2. Search table, six Arabic headers — EMU (needs a session + data)
The PR3 surface: `الاسم · المورّد · المبلغ · الحالة · التاريخ · الثقة`.
- **PASS:** six Arabic headers, table mirrored, no raw enum.
- **FAIL:** any English header, any raw `COMPLETED`, unmirrored table.
- **U:** no session/data.

---

## F — Currency, the F2 regression surface

### F1. Four shapes — EMU (needs a session + data)
- **PASS:** `98.21 US$`, `54.50 CHF`, `90.50 €`, `128.23 د.م.` — digits then symbol.
- **FAIL:** `$US 98.21` — sign left of the letters. This is F2 returning.
- **U:** no rows with amounts.

---

## G — Camera

### G1. Permission DENY path — EMU (needs a session)
Revoke `android.permission.CAMERA`, then attempt capture.
- **PASS:** graceful fallback; file/gallery/PDF picking still works; no dead end, no crash.
- **FAIL:** crash, hang, or a dead-ended capture UI.
- **U:** capture UI not reachable.

### G2. Real capture on real hardware — **HW ONLY**
A real sensor and a real OEM camera app handling `ACTION_IMAGE_CAPTURE` from the
WebView file chooser. **The emulator's synthetic camera cannot answer this.**
- **PASS:** capture returns an image and the upload pipeline accepts it.
- **FAIL:** the intent is not handled, returns nothing, or the pipeline rejects it.

### G3. arm64 CameraX runtime — **HW ONLY**
The AVD is `x86_64`; the arm64 CameraX `.so` files are never loaded there.
- **PASS:** the camera path runs on an arm64 device without a native crash.
- **FAIL:** `UnsatisfiedLinkError` or a native crash in the camera path.

---

## H — Release artifact

### H1. 16 KB alignment of the signed AAB — STATIC
Parse ELF program headers of every 64-bit `.so`.
- **PASS:** every `PT_LOAD` reports `p_align >= 16384`.
- **FAIL:** any 64-bit `PT_LOAD` below 16384.

---

## Result table

Filled in only after each check is run. `U` is not a pass.

| # | Instrument | Answer |
|---|---|---|
| A1 | EMU | **PASS** — `Welcome back` / `Log in to manage your intelligence`. No `$9/mo`, no pricing card, no CTA. |
| A2 | EMU | **U** — no authenticated session available. |
| A3 | EMU | **U** — limit not reachable without a session. |
| A4 | EMU | **U** — Settings not reachable without a session. |
| B1 | EMU | **PASS** — 3 BACK presses, `topResumedActivity` unchanged. App never exited. |
| B2 | EMU | **PASS** — gesture nav exclusive, 3 left-edge swipes, app never exited. |
| B3 | EMU | **U** — no modal reachable without a session. Chain levels 1 and 3 untested. |
| B4 | EMU | **PASS (partial)** — without the opt-out: 3 swipes + 4 BACK presses, identical to B1/B2, no crash. Root screen only; levels 1 and 3 still untested. |
| C1 | EMU | **PASS** — status bar legible, app content below it, not overlapped. |
| C2 | EMU | **U** — the login screen has no bottom-anchored element; `BottomTabBar` is authenticated-only. |
| D1 | EMU | **PASS** — branded splash renders centred and correctly scaled, then the app. No held white flash. |
| E1 | EMU | **U** — the app never reads the device locale. `LanguageContext.tsx:14` is `localStorage.getItem('lang') || 'en'`, and the switch is post-login. English on a fresh install is BY DESIGN, so this is not a FAIL. Unrelated to targetSdk 36. |
| E2 | EMU | **U** — no session or data. |
| F1 | EMU | **U** — no rows with amounts without a session. |
| G1 | EMU | **U** — capture UI not reachable without a session. |
| G2 | HW | **PENDING — HW.** Emulator camera is synthetic; cannot answer. |
| G3 | HW | **PENDING — HW.** AVD is x86_64; arm64 CameraX `.so` never loaded. |
| H1 | STATIC | **PASS** — signed AAB, every 64-bit `PT_LOAD` `p_align 16384` (32-bit ABIs also 16384). |


---

## Tally — run 2026-09-03 on the API 36 emulator (x86_64, Pixel 7 profile)

**7 PASS · 0 FAIL · 9 UNANSWERABLE · 2 pending hardware.**

No check failed. Nine could not be reached, and per rule 2 not one of them is a pass.
**Seven of the nine (A2, A3, A4, B3, E2, F1, G1) are blocked by the single missing
input: an authenticated session.** One credential converts seven unanswered checks
into answers and makes the opt-out ruling decidable.


---

## Session attempt — 2026-09-03. BLOCKED on email confirmation.

Registration of a throwaway account was authorised to close the nine `U`s. It is
blocked, and the block is the one that was named in advance as a stop condition.

**Email confirmation is REQUIRED and cannot be completed from here.** Measured
against the same public endpoint the app calls:

```
POST /auth/v1/signup            -> 200, user created, confirmation_sent_at set,
                                   email_verified: false, NO session returned
POST /auth/v1/token?grant_type=password
                                -> 400 {"error_code":"email_not_confirmed",
                                        "msg":"Email not confirmed"}
```

Completing it would mean opening a confirmation link from a public disposable
inbox for a production account. That is a workaround, not a measurement, and it
was explicitly ruled out.

### Account created — CLEANUP ITEM, not to be removed now

| Field | Value |
|---|---|
| Email | `zz-test-api36-20260903@mailinator.com` |
| User id | `0e13183d-1694-4cc3-acae-90a9a9161ee3` |
| State | unconfirmed, no session, zero documents |

A second address, `zz-test-api36-20260903@example.com`, was attempted first and
returned `500 unexpected_failure / "Error sending confirmation email"` twice.
Whether it left a user row behind is **not determined** — the 500 is returned
before any signal that would distinguish it. Check for it during cleanup.

**Neither touches `fettah.tornido123`, identity `c521aa92`, or the orphan row
`1e1c8482`.**

### Why the first UI attempt failed, since the app cannot tell you

The in-app signup showed "Something went wrong. Please try again." — the generic
catch-all from `lib/serverErrors.ts`, which deliberately collapses
`signup_disabled`, `email_provider_disabled` and a rejected address into one
message so the form cannot become an enumeration oracle. That anti-enumeration
design is correct and worked as intended; it also means the client cannot
diagnose its own failure. The cause was the reserved domain `example.com`, which
the confirmation mailer cannot deliver to — established by running the same call
against two domains and getting `200` for one and `500` for the other.

### What this does NOT change

`B4` remains **PASS (partial)** and the opt-out recommendation remains **KEEP**.
`B3` is still `U`, so the levels that carry the risk — overlay close, which
`PaywallModal` depends on through `useBackDismiss` — are still untested. Nothing
in this attempt reached them.


---

# THE RESIDUAL — read this before concluding anything is unfinished

Recorded 2026-09-03, after the session attempt was abandoned. **Written for
whoever opens this file in November and finds checks marked `U`.**

## Nine `U`s are a decision, not a backlog

They are not forgotten, not blocked on someone getting round to them, and not
waiting on a fix. **The session that would close seven of them was abandoned
deliberately, and this section is the reasoning, so that a later reader does not
"helpfully" re-open a question that was closed on purpose.**

## Why the session was abandoned

Registration succeeded but returned no session: email confirmation is required
(`400 email_not_confirmed`). Every route to a session was weighed and each was
refused for a stated reason:

| Route | Refused because |
|---|---|
| Confirm via the public disposable inbox | A workaround, not a measurement |
| "Send password recovery" | Also requires opening that inbox — same wall |
| Supabase dashboard "confirm user" | No such control exists in this console version |
| SQL editor on `auth.users` | GoTrue owns that table; `confirmed_at` is generated in some versions. **Not certain it works, so not attempted** |
| Service-role admin API | Would work, and is the right route *if this is ever needed* — see below |
| **Turn off email confirmation temporarily** | **Refused. See below — this is the important one** |

**Turning confirmation off was refused because of the forgetting, not the
window.** Left off, "an account exists for address X" stops meaning "someone
controls X", which is the assumption password recovery rests on. And **nothing in
this repository watches that setting.** `password-policy-drift.yml` monitors the
password minimum and nothing else about auth config; the setting is live config,
so no commit would record it either. A toggle left off produces no error, no
failing test and no red badge — the exact silent-failure shape this repo's
doctrine exists to name, applied to a security setting rather than a check.
Spending that on a decision being deferred conservatively is a bad trade.

## Why abandoning it was safe: the composition argument

The anti-steering suite is the product of two independent factors:

- **(a) does the gate return true on the real artifact?** This was the untested
  half — every test mocks `isNativePlatform()`. **A1 answered it**, on the real
  APK, on Android 16, under Capacitor 8.
- **(b) given the gate, do the branches behave?** ~20 assertions across
  `PaywallModal`, `SettingsScreen`, `LandingRoute`, `UploadModal` ×2,
  `CaptureSheet`, `DeleteAccountModal` ×7. Green, and thorough.

A2, A3 and A4 are all **(b)-given-(a)**, calling the *same* pure delegation with
no caching and no async. Running them on a device re-tests the well-covered half
on a worse instrument. And **A1 is the strongest place (a) could have been
tested**: it fires at mount during the `/` redirect — the earliest gate
evaluation in the app's lifetime, and so the one most exposed to a
bridge-initialisation race, which is the failure a Capacitor major would
plausibly introduce.

## The residual, stated as a risk and not as a reassurance

**`PaywallModal`'s price-free render on a device is covered by an ARGUMENT, not
an OBSERVATION.** The composition above is sound, but it is reasoning. It was
never watched happening on a screen. **If the composition assumption is wrong,
the failure mode is Play store removal.** That trade was taken knowingly on
2026-09-03 and is recorded here so it is findable rather than inferred.

## The opt-out ruling is a STANDING DEFERRAL

`android:enableOnBackInvokedCallback="false"` ships. **This is not an open loose
end and not an oversight.**

- **What it means:** the back chain behaves at `targetSdk 36` exactly as it did
  at 35 — the behaviour that has been shipping and working. Keeping it is the
  conservative branch and costs nothing measurable (B1/B2 and B4 are
  indistinguishable). It buys back only predictive-back animations.
- **What would settle it:** **B3 and a real B4** — the back chain exercised with
  an overlay actually open, `PaywallModal` specifically, since it is the one
  whose failure costs money. B4 as run reached only the chain's last level; the
  levels that carry the risk (overlay close via `useBackDismiss`, and
  tab→dashboard) were never touched.
- **If it is ever to be REMOVED**, a session becomes necessary, and the right
  route is then the **service-role admin API** — `PUT /auth/v1/admin/users/{id}`
  with `{"email_confirm": true}` — because it needs no inbox and changes no
  production setting. Not the confirmation toggle.

**Do not read a `PASS` on B4 as licence to delete the attribute.** It passed on
the root screen only.

## Queued, not pending

The test account below is a **cleanup item on the queue alongside the orphan-row
cleanup**, needing the console's Danger zone → Delete user. It is not urgent and
it is not forgotten.
