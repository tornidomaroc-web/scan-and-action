# App Store screenshots, version 1.0

The iPhone set for the App Store product page, English (U.S.), the listing's
only localization. Approved by the owner on 2026-10-15 (direction C, "Teal
field") after he rejected the plain, uncaptioned set that preceded it. What
App Store Connect holds is read there, in Media Manager; this file does not
track it. As of 2026-10-15 the replacement in both Dynamic Island slots was
still to be done, after the PR carrying these files merges.

| Folder | Size (portrait) | App Store Connect slot |
|---|---|---|
| `iphone-dynamic-island-medium-1206x2622/` | 1206 x 2622 | iPhone with Dynamic Island (medium display), the required one |
| `iphone-dynamic-island-large-1320x2868/` | 1320 x 2868 | iPhone with Dynamic Island (large display), optional |

What applies, read on 2026-10-15:

- Apple's screenshot specifications
  (https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
  list "iPhone: At least one screenshot for iPhone with Dynamic Island (medium
  display)" under "Required device sizes", and App Store Connect's version 1.0
  page shows exactly that slot. PNG or JPEG, no alpha, 1 to 10 per size.
- App Review Guideline 2.3.3, read the same day: "Screenshots should show the
  app in use, and not merely the title art, login page, or splash screen. They
  may also include text and image overlays". Every frame is a working screen;
  the caption is the overlay. 2.3.7: no price or plan appears anywhere.
- No iPad set: the app builds for iPhone only (`TARGETED_DEVICE_FAMILY = 1` in
  `apps/frontend/ios/App/App.xcodeproj/project.pbxproj`).
- iPhone Duo screenshots become required from April 2027 for apps built with
  the iOS 27.1 SDK or later. Build 34 was built with Xcode 26.6, so not now.

## The frames, in order

Each frame is one real simulator capture of the app, complete (the whole
screen down to the tab bar), inside a generic phone body drawn in CSS, on the
brand teal, under a caption. The captions, approved by the owner as written:

| # | File | Eyebrow | Title | Line under it |
|---|---|---|---|---|
| 1 | `01-home` | Home | See what this month cost, in each currency | Each currency is totalled on its own, never converted. |
| 2 | `02-capture` | Scan | Scan a receipt, or add a photo or PDF | Reading runs while you keep using the app. |
| 3 | `03-detail` | Receipt | Merchant, total and date, read for you | The receipt photo stays one tap away. |
| 4 | `04-queue` | Review | Approve or reject what needs a second look | Receipts that need a person wait in one place. |
| 5 | `05-search` | Search | Find any receipt by merchant, category or month | Totals for what you found, one per currency. |

Each caption claims only what its screen shows: Home's own note reads "Each
currency is totalled on its own. Nothing is converted or added together";
frame 2 is the Add a document sheet (Scan document, Choose file) and Detail's
reading note says the Queue shows the result; Detail shows the three read
values and "Open original source"; the Queue cards carry Approve and Reject;
Search has its field, category chips, month and per-currency totals. No
caption contains a dash. The queue card shows no review reason (the card
renders the status only, `ReviewQueueScreen.tsx`); the reason shows on the
receipt's Detail.

Home and Search run on under the tab bar and Search's category chips scroll
sideways: that is the app's own screen edge inside a complete screen, not a
crop of the frame (the owner accepted it, 2026-10-15).

## How they were made

Two steps, both free and both reproducible.

**1. The captures.** From the app on the iOS 26.5 simulator, iPhone 17 Pro
(1206 x 2622) and iPhone 17 Pro Max (1320 x 2868), light, English, default
text size, the status bar at 9:41 with a full battery. The network is replaced
by fixtures (`source/sa-proof.js`): every merchant, amount, date and file name
is invented, no real user's data and no review account's data, and no real
brand name (App Store Review Guideline 5.2). The receipt photo is drawn by
`source/receipt.mjs` and its lines add up to the total Detail shows. The
workflow is `source/store-shots.yml`; `source/screens.mjs` lists the screens.
Every capture passed the in-page layout audit (no text cut, nothing
overlapping, no sideways scroll) and the contrast audit (no text pair under
4.5:1).

- Frames 1, 2, 4 and 5: run 38803643978 on the throwaway branch
  `proof/store-shots-c`, app code at `main` `1449e6f8`.
- Frame 3: run 38763571358 on `proof/store-shots-2`, app code at `main`
  `4dd2bdcd`. Run 38803643978 shot Detail before the receipt photo had loaded,
  in both sizes (a grey box where the photo goes), as run 38784782735 had the
  day before, even with a 9 s wait; run 38763571358 has the photo. The app
  code under `apps/` and the fixtures (`sa-proof.js`, `sa-receipt.jpg`, the
  audit scripts) are byte-identical between the two runs, so the screen is
  the same; only the photo's load time differs.

**2. The composition.** `source/render-c.sh <captures> <out>` renders
`source/frame-c.html` with headless Chrome at device scale factor 3: the
caption at the top, the phone below it, the capture filling the phone's
screen. One composition in units of the canvas width, so both sizes and all
five frames share the same scale (the screen at 0.744 of the canvas width),
the same caption position and the same margins. The page measures itself and
writes a `.check.json` beside each PNG: the caption text as rendered, the
title on two lines and the line under it on one, the phone inside the canvas,
the whole screen inside the phone. For this set every check passed on all ten
files, each file is exactly 1206 x 2622 or 1320 x 2868, RGB with no alpha, and
the ten files are byte-identical (sha256) to the ones the owner reviewed.

To reshoot after a UI change: put `source/` back at `.github/dt-proof/` and
`source/store-shots.yml` at `.github/workflows/` on a throwaway branch from
main, push, take the captures from the run's artifact, then run
`source/render-c.sh` on them and look at every frame before replacing these.
