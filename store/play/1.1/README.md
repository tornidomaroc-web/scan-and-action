# Google Play store assets, version 1.1

The phone screenshots and the feature graphic for the Play listing of
`com.scanaction.app`, English. They replace the stale listing: the old icon,
the old feature graphic with a device, and the pre-restyle screenshots (the
owner's reading, 2026-10-18). What Play holds is read in Play Console › Store
presence › Main store listing; this file does not track it.
Nothing in this repository uploads them.

**Why they live here and not under `apps/frontend/`:** `ios-testflight.yml`
runs on every push to `main` under `apps/frontend/**`. A file here merges
with no TestFlight run, as `store/app-store/1.0/` did. On a push to `main`
only `ci.yml` and `password-policy-drift.yml` run, and neither builds or
uploads anything.

| Folder | Pixels | Play slot |
|---|---|---|
| `phone-1080x1920/` | 1080 x 1920, RGB, no alpha | Phone screenshots |
| `feature-graphic-1024x500/` | 1024 x 500, RGB, no alpha | Feature graphic |

The listing icon is `apps/frontend/assets/store/play-store-icon-512.png`,
generated with the launcher icons, uploaded in the same release that first
ships them (WORK-QUEUE, "The icon and the splash").

## The frames, in order

Direction C as approved for the App Store on 2026-10-15
(`store/app-store/1.0/`): the brand teal, the white two-line caption under an
eyebrow, a complete generic phone drawn in CSS, one real capture. Same order,
same captions.

| # | File | Eyebrow | Title | Line under it |
|---|---|---|---|---|
| 1 | `01-home` | Home | See what this month cost, in each currency | Each currency is totalled on its own, never converted. |
| 2 | `02-capture` | Scan | Scan a receipt, or add a photo or PDF | Reading runs while you keep using the app. |
| 2a | `02-capture-alt` | Add | Photograph a receipt, or add a photo or PDF | Reading runs while you keep using the app. |
| 3 | `03-detail` | Receipt | Merchant, total and date, read for you | The receipt photo stays one tap away. |
| 4 | `04-queue` | Review | Approve or reject what needs a second look | Receipts that need a person wait in one place. |
| 5 | `05-search` | Search | Find any receipt by merchant, category or month | Totals for what you found, one per currency. |

**Frame 2 needs a choice: upload `02-capture` or `02-capture-alt`, not both.**
On Android the Add a document sheet reads "Take photo" and "Choose file". The
document scanner is iOS only (`SCANNER_PLATFORMS = ['ios']` in
`apps/frontend/src/native/documentScanner.ts`), so "Scan a receipt"
describes a control this screen does not show. `02-capture-alt` says only
what the Android screen shows. The recommendation is `02-capture-alt`.

The feature graphic shows no device: the concept A icon, rendered from the
master `apps/frontend/assets/scan-action-mark.svg`, on the same teal, the name,
and frame 3's approved line, which is true on Android. Everything sits inside
the central 924 x 400 (`feature-graphic.check.json`, `insideSafe`).

## How they were made

1. **Captures.** The Android emulator `sa_api36` (API 36, 1080 x 2400,
   420 dpi), light theme, English, font scale 1.0. The app is a debug build
   whose web bundle was built with the network at `.invalid` hosts, with the
   App Store set's fixtures injected (`store/app-store/1.0/source/sa-proof.js`
   and `sa-receipt.jpg`). Every merchant, amount, date and file name is
   invented. No backend, no account. `source/shoot-android.sh` takes one
   frame: the whole device screen with `adb exec-out screencap`, then the
   layout audit and the contrast audit (`store/app-store/1.0/source/audit.js`,
   `contrast.js`) in the WebView over CDP (`source/cdp.mjs`). On all five:
   no text cut, nothing overlapping, no sideways scroll, no text pair under
   its floor (4.5:1, 3:1 for large text).
2. **Status bar.** Real, not drawn. System UI demo mode sets 9:41, full Wi-Fi
   with no "no internet" mark, a full battery, no notification icons (the
   commands are in `source/shoot-android.sh`). In light theme the bar is
   `#FAFAFA` and its darkest glyph `#646464`, 5.7:1 on every capture. The
   light bar with faint white icons appears in dark theme only; this set is
   light.
3. **Composition.** `source/render-play.sh <captures> <mark svg> <out>`
   renders `source/frame-play.html` (from `store/app-store/1.0/source/frame-c.html`,
   recomposed for 9:16) at device scale factor 3, and `source/feature.html` at
   1. Each page measures itself and writes a `.check.json` beside the PNG:
   caption text as rendered, no dash, title on two lines and the line under it
   on one, the phone inside the canvas, the whole screen inside the phone, the
   Inter face loaded. Every check passed on all seven files.
