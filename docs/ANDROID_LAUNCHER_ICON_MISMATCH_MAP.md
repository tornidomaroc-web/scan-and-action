# Android launcher icon mismatch — exploration map & fix plan

**Explored from:** `ff7a7b5611b25155c6974469bdb03c4b27845ede` (branch `feat/d8b-pr2-delete-account-restyle`)
**Not** `a88d9030` (main) as the brief stated — see "Corrections" below. The delta is irrelevant to this defect: no commit between `a88d903` and `ff7a7b5` touches `android/`.
**Date:** 2026-07-17
**Status:** read-only mapping pass. Nothing written, built, or deployed. DB untouched.
**Rejection:** Google Play, production release, 2026-07-17 — Misleading Claims / store-listing mismatch.

---

## Corrections to the brief

Three assumptions in the brief are wrong. All three change the work.

### 1. The path is not `android/`

There is no `android/` at the repo root. The Capacitor project lives at
**`apps/frontend/android/`** — this is a monorepo (`apps/frontend`, `apps/backend`).
Every path below is real and verified.

### 2. "Almost certainly a leftover default (Capacitor/Ionic starter)" — confirmed, and specifically Capacitor

The mark is the **Capacitor logo** — two light-blue crossing bars forming an X. It is the
stock icon shipped by `@capacitor/android`'s `cap add android` template. This is confirmed
by eye on the decoded pixels, not inferred from filename.

Minor detail: it is **not** "on black". The live adaptive-icon background is **`#FFFFFF` white**
(`values/ic_launcher_background.xml:3`). The black you see is your launcher's own backdrop
showing through, or the round icon's white disc against a dark wallpaper. This matters only
because it tells us the white is a *declared resource we control*, not an artifact of the PNG.

### 3. "This is an assets-only defect" — true, but the blocking problem is not the assets

**The correct artwork does not exist in this repository.** Not in any form — no PNG, no SVG,
no vector drawable, no source file. See §3. The fix is therefore *not* a swap of bytes we
already have; it is blocked on artwork that currently lives only in the Play Console listing.
That is the single most important finding here and it changes the shape of the work.

### Bonus finding, outside the brief's scope

**The splash screen is also the Capacitor logo** (§8). The brief scoped this to the launcher
icon. If you fix only the launcher, you ship a build that shows the correct icon and then
immediately renders the Capacitor X full-screen on every cold start. Reviewers see the splash.
This must be in the same fix.

---

## 1. Every launcher asset present, and what it actually depicts

All under `apps/frontend/android/app/src/main/res/`.

### Live raster assets — 15 PNGs, all the Capacitor logo

Verified by decoding each PNG and viewing it, plus IHDR dimension reads and md5.
All 15 hashes are distinct (no accidental copy-paste); all 15 depict the same mark.

| File | Bytes | Pixels | md5 (first 8) | **What it actually depicts** |
|---|---|---|---|---|
| `mipmap-mdpi/ic_launcher.png` | 1869 | 48×48 | `7ed1b373` | Capacitor X, squircle, white bg |
| `mipmap-hdpi/ic_launcher.png` | 2786 | 72×72 | `19569413` | Capacitor X, squircle, white bg |
| `mipmap-xhdpi/ic_launcher.png` | 3981 | 96×96 | `5689511e` | Capacitor X, squircle, white bg |
| `mipmap-xxhdpi/ic_launcher.png` | 6644 | 144×144 | `a3285eea` | Capacitor X, squircle, white bg |
| `mipmap-xxxhdpi/ic_launcher.png` | 9441 | 192×192 | `9e029293` | Capacitor X, squircle, white bg |
| `mipmap-mdpi/ic_launcher_round.png` | 2725 | 48×48 | `a49547a3` | Capacitor X, **white circle** |
| `mipmap-hdpi/ic_launcher_round.png` | 4341 | 72×72 | `f43e5674` | Capacitor X, white circle |
| `mipmap-xhdpi/ic_launcher_round.png` | 6593 | 96×96 | `c890fa4a` | Capacitor X, white circle |
| `mipmap-xxhdpi/ic_launcher_round.png` | 10455 | 144×144 | `14cde878` | Capacitor X, white circle |
| `mipmap-xxxhdpi/ic_launcher_round.png` | 15916 | 192×192 | `85addb41` | Capacitor X, white circle |
| `mipmap-mdpi/ic_launcher_foreground.png` | 2110 | 108×108 | `5b77e8ae` | Capacitor X, transparent, faint grid |
| `mipmap-hdpi/ic_launcher_foreground.png` | 3450 | 162×162 | `73b1e06d` | Capacitor X, transparent, faint grid |
| `mipmap-xhdpi/ic_launcher_foreground.png` | 5036 | 216×216 | `15cdded2` | Capacitor X, transparent, faint grid |
| `mipmap-xxhdpi/ic_launcher_foreground.png` | 9793 | 324×324 | `4e9584ec` | Capacitor X, transparent, faint grid |
| `mipmap-xxxhdpi/ic_launcher_foreground.png` | 15529 | 432×432 | `ed3696b7` | Capacitor X, transparent, faint grid |

Density coverage and dimensions are all **correct** (mdpi→xxxhdpi; foreground at the required
108dp-square safe-zone ratio). The scaffolding is right. Only the artwork is wrong.

### Adaptive icon XML — `mipmap-anydpi-v26/`

`mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` are **byte-identical in content**:

```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
```

So on API 26+ (which is every device that matters) the launcher composites:
**`@color/ic_launcher_background` (flat white) + `@mipmap/ic_launcher_foreground` (Capacitor X PNG)**.

### `values/ic_launcher_background.xml` — the colour

```xml
<color name="ic_launcher_background">#FFFFFF</color>
```

Flat white. This is the live background. It is **not** teal.

### Two stock Android Studio defaults that are present but **DEAD**

This is a trap worth naming explicitly, because it would mislead anyone grepping for "teal":

- **`drawable/ic_launcher_background.xml`** (170 lines) — a vector drawable: flat
  **`#26A69A` teal** (`:8`) overlaid with a `#33FFFFFF` grid of lines. This is the stock
  Android Studio teal-grid background.
- **`drawable-v24/ic_launcher_foreground.xml`** — a vector drawable of the stock
  **green Android robot (bugdroid)** head: white `#FFFFFF` body path with antennae and two eye
  dots, plus a `#44000000`→`#00000000` linear-gradient shadow wedge.

**Neither is referenced by anything.** The adaptive icon points at `@color/ic_launcher_background`
(the `values/` white), not `@drawable/ic_launcher_background`; and at `@mipmap/ic_launcher_foreground`
(the PNG), not `@drawable/ic_launcher_foreground`. Android resolves `@mipmap/` to the mipmap
folders, so the `drawable-v24` vector never wins.

They are compiled into the AAB as dead weight (confirmed — see §9) but they do not render.
**The `#26A69A` in `drawable/ic_launcher_background.xml` is a coincidence, not the brand teal.**
Do not mistake it for the correct artwork.

---

## 2. What AndroidManifest.xml declares

`apps/frontend/android/app/src/main/AndroidManifest.xml:6,9`

```xml
<application
    android:allowBackup="true"
    android:icon="@mipmap/ic_launcher"          <!-- :6 -->
    android:label="@string/app_name"
    android:roundIcon="@mipmap/ic_launcher_round"   <!-- :9 -->
    android:supportsRtl="true"
    android:theme="@style/AppTheme">
```

Both declarations are **correct and idiomatic**. There is no `<activity>`-level `android:icon`
override (`:13-21`), so the application-level icon governs the launcher entry. Nothing needs to
change in the manifest — it is pointing at exactly the right resource names. The resources
those names resolve to are what's wrong.

---

## 3. Does the correct source artwork exist in-repo? **No.**

**Plainly: the teal document + checkmark mark does not exist anywhere in this repository.**

Exhaustive sweep — every image on disk, tracked *and* untracked, excluding `node_modules/`
and `.git/`, across `.png .svg .jpg .jpeg .webp .ico .ai .pdf .psd .xcf`. The complete set of
non-build, non-duplicate source images is:

| Location | Depicts |
|---|---|
| `apps/frontend/android/app/src/main/res/mipmap-*/ic_launcher*.png` (15) | Capacitor X |
| `apps/frontend/android/app/src/main/res/drawable*/splash.png` (11 files, 10 unique) | Capacitor X |
| `apps/frontend/public/icons/icon-192.png` | **Blue/white arrow on dark navy** |
| `apps/frontend/public/icons/icon-512.png` | Blue/white arrow on dark navy |
| `apps/frontend/public/icons/icon-maskable-512.png` | Blue/white arrow on dark navy |
| `apps/frontend/public/icons/apple-touch-icon.png` | Blue/white arrow on dark navy |

Everything else found was under `android/app/build/` (gitignored build intermediates —
confirmed via `git check-ignore`: `apps/frontend/android/.gitignore:24: build/`) or
`apps/frontend/dist/` and `android/app/src/main/assets/public/` (both copies of `public/`).

### There are THREE different marks in play, not two

This is the finding that reframes the whole task:

1. **Play Store hi-res listing icon** — teal/blue gradient document + checkmark. *Exists only in
   the Play Console.* Not in the repo, not in git history, not in any branch.
2. **Android launcher + splash** — Capacitor logo X. Wrong, and the cause of the rejection.
3. **Web / PWA** — a blue-and-white arrow on `#0f172a` dark navy. Verified in
   `apps/frontend/public/icons/*` and in the inline favicon data-URI at
   `apps/frontend/index.html:5` (`rect fill='%230f172a'` + `#2563eb` arrow paths). Also
   referenced by `apps/frontend/public/manifest.webmanifest` (`"name": "Scan & Action"`,
   `background_color`/`theme_color` `#0f172a`).

So the store icon and the web app icon **already disagree with each other**, independently of
the Capacitor bug. Fixing the launcher to match the store would make the launcher disagree
with the PWA. Fixing it to match the PWA would leave the store rejection unresolved.

**This is a decision you have to make, and I can't make it for you.** See §11 Step 0.

---

## 4. The generation pipeline: **there is none**

Checked exhaustively:

- **`apps/frontend/package.json`** — no `@capacitor/assets`, no `cordova-res`, no
  `capacitor-assets`, no icon/asset tooling in `dependencies` or `devDependencies`. The
  Capacitor-family deps are only: `@capacitor/app`, `@capacitor/camera`, `@capacitor/core`,
  `@capacitor/splash-screen`, `@capacitor/status-bar`, `@capacitor/android`, `@capacitor/cli`.
- **Scripts** are: `dev`, `build`, `lint`, `preview`, `test`, `cap:sync` (`cap sync android`),
  `build:android` (`npm run build && cap sync android`). **No asset-generation step.**
- **`apps/frontend/capacitor.config.ts`** — no `assets` / `resources` key. Only `appId`,
  `appName`, `webDir: 'dist'`, `android.appendUserAgent`, and a `SplashScreen` plugin block.
- **No `assets/` or `resources/` directory exists** anywhere in the repo.
- Root `package.json` — nothing icon-related.

**The icons were scaffolded once by `cap add android` and hand-carried ever since.**
Critically: **`cap sync` does not touch `res/mipmap-*` or `res/drawable*`.** It copies the web
build into `app/src/main/assets/public/` and reconciles plugins — it does not regenerate native
icon resources. So no build step rewrites these files.

---

## 5. Git history on the mipmap directories

```
$ git log --oneline --all -- 'apps/frontend/android/app/src/main/res/mipmap-*'
1b328ee feat(android): wrap web app in Capacitor Android shell (Phase A)
```

**One commit. Ever.**

- **Introducing commit:** `1b328ee064671c460a542cede2aeb4008c7cbf35`
- **Date:** 2026-06-14 22:27:06 +0100
- **Author:** tornidomaroc-web
- **Subject:** `feat(android): wrap web app in Capacitor Android shell (Phase A)`

Confirmed with `--diff-filter=A` (added) and `--follow` (survives renames) — no rename, no
later modification, on any branch (`--all`).

**Answering the question directly: they were never anything other than the default.** These
files were born as the Capacitor scaffold on 2026-06-14 and have not been touched in the 33 days
since. There is no "good icon" in history to revert to. `git log` on the splash PNGs returns
the identical single commit.

---

## 6. versionCode and versionName

**File: `apps/frontend/android/app/build.gradle`**

```gradle
:23        versionCode 2
:24        versionName "1.0"
```

Also at `:17 namespace "com.scanaction.app"` and `:20 applicationId "com.scanaction.app"`.

History (`git log -L 23,24:...`):
- `1b328ee` — born `versionCode 1` / `versionName "1.0"`
- `d39f2d2` — `build(android): bump versionCode to 2 and wire release signing from key.properties`
  → `versionCode 2`. **This confirms the brief's "PR #82 set versionCode 2."**

`versionName` has never changed from `"1.0"`.

**versionCode 2 is burnt.** It was uploaded to the production track and rejected. Play retires a
versionCode on upload, not on approval — a rejected release still consumes it. The next
submission **must be `versionCode 3`**.

---

## 7. Any icon asset that IS a blue X — the source of the wrong mark

Yes, and it is unambiguous. **The Capacitor framework's own logo.**

The blue X is the stock icon set from the `@capacitor/android` scaffold template, written by
`cap add android` in `1b328ee` and never replaced. Its fingerprints:

- The exact Capacitor brand mark: two crossing bars, gradient from `#5AC8FA`-ish light blue to
  `#4A9EFF`-ish mid blue, on white with a faint diagonal grid watermark.
- It appears in **26 files** — all 15 mipmap launcher PNGs *and* all 11 splash PNGs — which is
  precisely the set `cap add android` scaffolds.
- It sits alongside the *other* untouched Android Studio defaults (the `#26A69A` teal-grid
  `drawable/ic_launcher_background.xml` and the bugdroid `drawable-v24/ic_launcher_foreground.xml`),
  which is the signature of a scaffold nobody ever went back to.

There is no other blue X anywhere. Nothing in `public/icons/` or `dist/` contributes to it.
**The wrong mark has exactly one source: the un-replaced Capacitor scaffold.**

---

## 8. Out-of-scope finding: the splash screen is ALSO the Capacitor logo

The brief scoped this to the launcher. It should not be.

`apps/frontend/android/app/src/main/res/drawable*/splash.png` — **11 files, 10 unique images**
(`drawable/splash.png` is byte-identical to `drawable-port-mdpi/splash.png`, md5 `acc976d4` —
that's the scaffold's normal default-plus-port-mdpi duplication, not a bug).

Verified by decoding `drawable-port-xxxhdpi/splash.png` (1280×1920): **a small Capacitor X
centred on a white field.** Same single commit `1b328ee`.

This is live and it will be seen. `apps/frontend/capacitor.config.ts` wires it up:

```ts
plugins: {
  SplashScreen: {
    launchShowDuration: 1500,
    launchAutoHide: true,
    backgroundColor: '#0f172a',
    androidSplashResourceName: 'splash',   // <-- resolves to the Capacitor-X PNGs
    showSpinner: false,
  },
},
```

Two problems:

1. **Every cold start shows the Capacitor logo for up to 1500ms.** A reviewer who installs the
   build sees the Capacitor mark before they see anything of yours. If you fix only the
   launcher icon, you will very plausibly get rejected a second time for the same reason —
   and a second Misleading Claims strike on the same listing is materially worse than the first.
2. **`backgroundColor: '#0f172a'` (dark navy) contradicts the white splash PNG.** The configured
   navy matches the PWA brand; the PNG is white. Whatever artwork lands, these must agree.

**Recommendation: fix the splash in the same PR.** The marginal cost is one more export from
the same source artwork. The cost of not doing it is a second rejection.

---

## 9. Verdict: wrong bytes, or a regenerating pipeline?

**Purely wrong bytes in `mipmap-*` (and `drawable*/splash.png`). There is no pipeline.
Nothing regenerates the icon on any build.**

The evidence is convergent and I'm confident in it:

1. **No generator is installed or configured** (§4). No `@capacitor/assets`, no `cordova-res`,
   no `assets/`, no `resources/`, no `capacitor.config.ts` assets key, no npm script.
2. **`cap sync` provably does not write `res/mipmap-*`.** It syncs `assets/public/` and plugins.
   The two `build:android` / `cap:sync` scripts are the only Capacitor invocations in the repo.
3. **The files have exactly one commit in 33 days** (§5). A regenerating pipeline would produce
   churn — recurring diffs on every `cap sync`. There is none. They are inert, hand-carried files.
4. **The build output is a byte-faithful copy of the source tree.**
   `md5(build/intermediates/packaged_res/release/.../mipmap-xxxhdpi-v4/ic_launcher.png)`
   `== md5(src/main/res/mipmap-xxxhdpi/ic_launcher.png) == 9e029293ab1ae8e3a6a7b7d0b7177e46`.
   Gradle copied; it did not synthesise.

**Confirmation from the actual rejected artifact.** `app/build/outputs/bundle/release/app-release.aab`
(5,494,632 bytes, mtime 2026-07-10 20:34 — consistent with the rejected submission) is still on
disk. Its contents:

```
base/res/mipmap-mdpi-v4/ic_launcher.png      1869   <- identical size to source
base/res/mipmap-hdpi-v4/ic_launcher.png      2786   <- identical
base/res/mipmap-xhdpi-v4/ic_launcher.png     3981   <- identical
base/res/mipmap-xxhdpi-v4/ic_launcher.png    6644   <- identical
base/res/mipmap-xxxhdpi-v4/ic_launcher.png   9441   <- identical
base/res/mipmap-anydpi-v26/ic_launcher.xml    413
base/res/drawable/ic_launcher_background.xml       <- dead teal-grid vector, shipped as dead weight
base/res/drawable-anydpi-v24/ic_launcher_foreground.xml  <- dead bugdroid vector, ditto
```

Every `ic_launcher.png` in the shipped AAB is byte-size-identical to the Capacitor X in the
source tree. **The rejected bundle demonstrably carried the Capacitor logo.** (The
`ic_launcher_foreground.png` sizes differ slightly — 3064 vs 3450 at hdpi — because aapt2
re-encodes PNGs at package time. Same image, different compression. Not a discrepancy.)

**Consequence for the fix:** this is genuinely good news. Replace the bytes and the problem is
gone permanently — no build step will overwrite your work. **But** the fix is *not* a swap of
bytes we already have, because the correct artwork isn't in the repo (§3). The bottleneck is
artwork acquisition, not engineering.

---

## 10. Risks I want to flag before you act

1. **The three-way brand split (§3) is the real decision.** Store = teal doc+check, PWA = navy
   arrow, launcher = Capacitor X. You cannot satisfy all three. Decide the canonical mark first
   or you will fix this twice.
2. **Splash is a second rejection surface (§8).** Do not ship a launcher-only fix.
3. **versionCode 2 is spent (§6).** Uploading `versionCode 2` again will be rejected by the
   Console at upload time, before review. Must be 3.
4. **No pipeline is also a liability.** After this fix the icons remain hand-placed, so the next
   person can drift them again. Adding `@capacitor/assets` is the durable answer, but it is
   scope creep on a rejection fix — I recommend deferring it to a follow-up (§11 Step 7), not
   blocking the resubmission on it.
5. **You have one upload key and it is not backed up.** `D:\keys\scan-action-upload.jks` existing
   only on your machine is a single point of total failure — losing it means you cannot ship
   updates to `com.scanaction.app` ever again without a Play-support key reset. Orthogonal to
   this bug; flagging because I saw it. Back it up to encrypted offline storage.
6. **Adaptive-icon safe zone.** Android masks the outer ~33% of the 108dp foreground; only the
   centre 72dp is guaranteed visible. A document+check mark exported edge-to-edge will get its
   corners clipped on circular-mask launchers. Export with the safe zone respected.
7. **I cannot see the Play Console.** My claim that versionCode 2 was consumed is inferred from
   Play's documented behaviour plus the AAB's mtime, not observed. Verify in the Console.

---

## 11. Recommended fix plan — ONE plan

Constraint honoured throughout: **the signing key lives only at `D:\keys\scan-action-upload.jks`
on your machine, and you build and upload manually.** Nothing below asks CI to sign, asks for
the keystore, or automates the upload. Steps 1–7 are repo changes I can do; Steps 0 and 8–10
are yours alone because they need the artwork, the key, and the Console.

`build.gradle:9` reads `rootProject.file("key.properties")` → `apps/frontend/android/key.properties`
(gitignored), which points `storeFile` at your `.jks`. That mechanism already works and I am not
touching it.

### Step 0 — DECIDE THE CANONICAL MARK *(you, blocking, do this first)*

Nothing else can start until this is settled. Pick one:

- **(a) Teal document + checkmark** (match the store listing). Lowest review risk — the
  listing is what Google compared against and it is what they'll compare against again. But
  it orphans the navy-arrow PWA icons, which then need updating too, or the web and app diverge.
- **(b) Navy arrow** (match the PWA/`manifest.webmanifest`/favicon). Consistent with everything
  already shipping on the web, and `capacitor.config.ts` already specifies `#0f172a`. **But it
  requires changing the Play Store listing icon**, which re-enters review with a *changed
  listing* — slower and riskier right after a Misleading Claims rejection.

**I recommend (a).** Rationale: you are recovering from a rejection and the fastest safe path is
to make the artifact match the listing Google already has, changing as little of the listing as
possible. Treat unifying the PWA icons as a follow-up (Step 7), not a blocker.

Then **produce the source artwork**, which does not exist in-repo:
- Export a **1024×1024 PNG** of the chosen mark, and if at all possible obtain the **vector
  source** (SVG/AI). If the only copy is the Play Console hi-res upload, download it from the
  Console listing (Store presence → Main store listing → App icon) — it is stored at 512×512,
  which is enough for every density here (xxxhdpi foreground needs 432×432) but is *not* enough
  if you ever need a fresh 512 store upload from it. Get the vector if you can.
- Place at **`apps/frontend/assets/icon.png`** (1024×1024, full-bleed) and
  **`apps/frontend/assets/icon-foreground.png`** (1024×1024, mark within the centre ~66% safe zone,
  transparent outside). Establishing `assets/` now is what makes Step 7 trivial later.

### Step 1 — Branch

`fix/android-launcher-icon-mismatch` off `main` (not off the current D8b branch — this must be
able to ship independently of the modal restyle work).

### Step 2 — Replace all 15 launcher PNGs

Regenerate from Step 0's artwork at exactly the existing dimensions, which are already correct:

| Resource | mdpi | hdpi | xhdpi | xxhdpi | xxxhdpi |
|---|---|---|---|---|---|
| `ic_launcher.png` | 48 | 72 | 96 | 144 | 192 |
| `ic_launcher_round.png` | 48 | 72 | 96 | 144 | 192 |
| `ic_launcher_foreground.png` | 108 | 162 | 216 | 324 | 432 |

Respect the adaptive-icon safe zone on the foreground (Risk 6).

### Step 3 — Set the adaptive background colour

`values/ic_launcher_background.xml` — change `#FFFFFF` to the mark's true background
(the teal for (a); `#0f172a` for (b)). Leave the two `mipmap-anydpi-v26/*.xml` **unchanged** —
they are already correct and reference the right resources.

### Step 4 — Delete the two dead scaffold vectors

`drawable/ic_launcher_background.xml` (teal grid) and `drawable-v24/ic_launcher_foreground.xml`
(bugdroid). They render nothing (§1) but ship in the AAB (§9) and are an active trap for the next
reader who greps for `#26A69A` and thinks they found the brand. Removing them is safe precisely
*because* §1 proves nothing references them. Low risk, real clarity gain.

### Step 5 — Replace the splash (§8) — do not skip this

Regenerate all 11 `drawable*/splash.png` from the same artwork, on `#0f172a` to match the
`backgroundColor` already in `capacitor.config.ts`, keeping each file's existing dimensions.
Skipping this is the most likely cause of a second rejection.

### Step 6 — Bump versionCode to 3

`apps/frontend/android/app/build.gradle:23` → `versionCode 3`. Leave `versionName "1.0"` (`:24`)
alone — this is a rejected-build resubmission, not a user-facing release; nothing shipped as 1.0
so the name is still unclaimed. **versionCode 3 is mandatory** (§6, Risk 3).

### Step 7 — Follow-up PR, NOT this one: install a real pipeline

Add `@capacitor/assets` as a devDependency, an `assets/` source dir (already created in Step 0),
and a `cap:assets` script. This prevents recurrence permanently. **Deliberately deferred** —
adding a code generator to the PR that unblocks a rejected release means a generator bug can
cost you another review cycle. Ship the fix first, harden second.

### Step 8 — VERIFY BEFORE YOU BUILD ANYTHING SIGNED *(you)*

Do all of this **before** touching the keystore:

1. **Look at every changed PNG.** Open all 15 launcher files and all 11 splash files. Do not
   trust the exporter and do not trust filenames — that assumption is exactly what produced
   this bug.
2. `git status` — confirm 26 PNGs modified, 2 XML deleted, 2 XML modified. Nothing else.
3. `cd apps/frontend && npm run build:android`, then confirm `cap sync` did **not** revert your
   mipmaps (it won't — §4 — but verify the claim rather than trusting me).
4. **Install a debug build on a real device.** `./gradlew installDebug` — no keystore needed,
   which is the point of doing it at this step. Confirm on-device: (a) the launcher icon in the
   app drawer, (b) the icon under a **circular** mask (long-press → check the round variant),
   (c) the **cold-start splash** — force-stop the app first, then relaunch.
5. **Compare the on-device icon side-by-side with the Play Console listing icon.** This is the
   exact comparison the reviewer performs. If they don't visually match, stop.

### Step 9 — Build and upload signed *(you, manual, only after Step 8 fully passes)*

1. Confirm `apps/frontend/android/key.properties` exists and its `storeFile` resolves to
   `D:\keys\scan-action-upload.jks`. (In `.properties`, escape backslashes — `D:\\keys\\...` —
   or use forward slashes.)
2. `cd apps/frontend/android && ./gradlew clean bundleRelease`. **`clean` is not optional here** —
   stale `build/intermediates/packaged_res/` still holds the Capacitor X (§9) and you do not want
   to find out the hard way whether Gradle's up-to-date checks caught your PNG swap.
3. **Verify the AAB before upload — this is the last gate:**
   ```
   unzip -l app/build/outputs/bundle/release/app-release.aab | grep ic_launcher
   ```
   Sizes must differ from the §9 table (1869/2786/3981/6644/9441). If any still match, you have
   shipped the Capacitor X again — stop.
   Better: extract and *look* at `base/res/mipmap-xxxhdpi-v4/ic_launcher.png`.
4. Upload to a **closed/internal testing track first**, not straight to production. Install from
   the Play-delivered build and re-check the icon. This costs an hour and protects against a
   second Misleading Claims strike.
5. Promote to production only after the track build looks right on a real device.

### Step 10 — Resubmit

In the Play Console rejection appeal / release notes, state plainly that the launcher icon was
an un-replaced framework default from the Capacitor scaffold and now matches the store listing.
Reviewers respond well to a specific, non-evasive cause.

---

## Open questions for you

1. **Which mark is canonical?** (Step 0.) I recommend the teal document+check to match the
   listing, but this is a brand call and it's yours.
2. **Does vector source for the teal mark exist anywhere off-repo?** Figma, Canva, a designer's
   files, your local disk? If yes, that is strictly better than re-deriving from the Console's
   512×512 raster.
3. **Was the closed-testing 14-day clock affected by this rejection?** Per prior context that
   clock was in progress with production gated on time. Worth confirming in the Console whether
   the rejection reset or paused it — that changes your timeline, not your fix.
