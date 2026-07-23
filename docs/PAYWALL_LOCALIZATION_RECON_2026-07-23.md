# Paywall / landing localization gap — recon

**Date:** 2026-07-23 · **Base:** `main` @ `23d11b9` · **Mode:** read-only recon. No code, config, DB, or prod contact.
**Scope:** the web paywall (`PaywallModal.tsx`) and marketing/pricing landing (`LandingScreen.tsx`) are English-only for an AR/FR Maghreb audience.

## Verdict up front — three corrections to the framing

1. **The count is right for the paywall, ~3× too low for "paywall + landing."** The paywall is **~20 strings**, matching the estimate. But `LandingScreen` is a whole marketing page — **~50 more**. Full paywall+landing is **~65–70 keys × 3 locales**, not ~20. These are two very different-sized jobs and should not be one PR.

2. **The paywall is the real gap; the landing page barely reaches anyone in AR/FR today.** The language switcher lives *inside* the authenticated app (`LanguageSwitcher.tsx`, used only on logged-in screens). `LandingScreen` has no switcher and no `useStrings`. A first-time anonymous visitor is therefore **always** served English on the landing page regardless of any translation, because nothing lets them pick a locale before login. The paywall, by contrast, is reachable *only* when authenticated — every paywall viewer has already had the switcher and may be in AR/FR right now. **Localizing the landing page without also adding a switcher to it is near-zero-reach work.** That inverts the intuition that the landing page (bigger, more visible) is the priority.

3. **RTL is the hard part, not the translation.** The strings are mechanical. The paywall modal is riddled with *physical*-direction Tailwind classes (`text-left`, `left-0`, `right-2`) that do **not** flip under `dir=rtl`, plus the AR digit/percent-sign conventions this codebase has already committed to. This is the part that only a live iPhone can sign off.

---

## 1. The i18n system — how localization works today

- **Catalog:** `apps/frontend/src/i18n/strings.ts` — one object `{ en: {...}, fr: {...}, ar: {...} }`. EN `:2-339`, FR `:340-669`, AR `:670-999`. 1000 lines, flat key→string per locale. `{n}`-style placeholders are interpolated by callers (e.g. `processingChip: '{n} processing…'`).
- **Consumption:** `useStrings()` (`i18n/useStrings.ts`) returns `strings[language]`; a component reads `const s = useStrings()` then `s.someKey`.
- **Locale selection:** `LanguageContext.tsx` — `language` state seeded from `localStorage.getItem('lang')`, default `'en'`. `setLanguage` persists it.
- **RTL/dir wiring — already correct at the root:** `LanguageContext.tsx:19-22` sets `document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'` and `document.documentElement.lang`. Because the paywall portals into `document.body` (a descendant of `<html>`), it inherits `dir=rtl` automatically — **no per-component `dir` needed**. Confirmed: neither `PaywallModal` nor `ProWelcome` sets `dir` itself, and that's fine.
- **Number/locale helpers already exist:** `lib/formatNumber.ts` — `formatCount(value, language)` and `formatPercent(ratio, language, opts)`. Both follow a documented convention: **the bare `'ar'` subtag makes Intl emit LATIN digits** (matching how currency already renders), localizing only the group/decimal separator and the percent-sign spacing (fr: `"45 %"` with a narrow no-break space). This is a deliberate house rule — AR uses Latin digits, not Eastern Arabic numerals.

**Reference pattern to copy:** `components/ProWelcome.tsx` — same structure as the paywall (portal overlay, Crown icon, gradient header), fully localized: imports `useStrings` (`:4`), reads `s.proWelcomeTitle` / `s.proWelcomeBody` / `s.proWelcomeCta` (`:38` and below). It is the paywall's own sibling done right. The paywall's **native branch** (`PaywallModal.tsx:136,150,156`) is also already correct — `s.proComingSoonTitle/Body/Dismiss`. So the fix is "make the web branch look like the native branch," and the keys pattern already exists.

---

## 2. The unlocalized surface — enumerated

### Web paywall (`PaywallModal.tsx`) — 18 strings + 2 in pricing.ts

Only the **web** render path; the native branch (`:136,150,156`) is already localized.

| # | line | English |
|---|---|---|
| 1 | 177 | `Please sign in again to upgrade.` (error) |
| 2 | 187 | `Checkout is not available right now. Please contact support.` (error) |
| 3 | 205 | `Checkout is not available in this environment.` (error) |
| 4 | 206 | `Could not open checkout. Please check your connection and try again.` (error) |
| 5 | 242 | `Upgrade to PRO` (header) |
| 6 | 257 | `Unlock the full power of Scan & Action. PRO gives you the ultimate productivity workflow.` (body — contains an inline `<span>PRO</span>`, so it needs a placeholder split, not a raw string) |
| 7 | 264 | `Choose your plan` |
| 8 | 276 | `Monthly` |
| 9 | 293 | `Save {n}%` (badge — the *word* "Save" + the `%`; the number is ours, see §4) |
| 10 | 296 | `Yearly` |
| 11 | 303 | `Best Value` |
| 12 | 311 | `Unlimited Document Scans` (feature bullet) |
| 13 | 312 | `Upload multiple files at once` (feature bullet) |
| 14 | 313 | `Faster processing workflow` (feature bullet) |
| 15 | 314 | `Export your data (CSV)` (feature bullet) |
| 16 | 340 | `Opening checkout…` (loading state) |
| 17 | 341 | `Upgrade Now - ` (CTA prefix; the price after it is Paddle-formatted — §4) |
| 18 | 347 | `Maybe later` |
| 19 | pricing.ts | `periodSuffix: '/mo'` (rendered at `:279`, `:341`) |
| 20 | pricing.ts | `periodSuffix: '/yr'` (rendered at `:301`, `:341`) |

**= 20 keys.** The estimate is exactly right for the paywall.

### Landing (`LandingScreen.tsx`) — ~50 strings, zero i18n

The file imports no `useStrings` (`:1-3`). Every visible string is a literal. Grouped:

- **Hero** (`:13,16,20,22`): headline (2 spans), subtitle, `Start Free with 10 Scans Included`, `No credit card. Takes 30 seconds.`
- **Mock receipt preview** (`:32,33,36,43,52,53,58,59,62,63,66,68`): `Starbucks Receipt`, `AI Extraction`, `Needs Review`, `Missing total amount detected`, `Label`, `Value`, `Merchant`, `Starbucks Coffee`, `Date`, `Oct 24, 2023`, `Amount`, `Fix required` — **decorative demo data; see note below**
- **Problem** (`:97,101,105,109`): heading + 3 bullets
- **How it works** (`:119,120,126,130,134`): heading, subtitle, 3 steps
- **Value** (`:144-153`): 3 headings + 3 paragraphs
- **Pricing** (`:162,163,169,173,174,175,177,181,183,199,200,201,203`): section heading, subtitle, `Free`, `10 Scans Included`, `All core features`, `Free forever`, `Start Free`, `MOST POPULAR`, `Pro`, 3 Pro bullets, `Upgrade Now` (`$0` and the Pro price are numeric/catalog)
- **Final CTA** (`:212,215,217`): heading, CTA (dup of hero CTA — dedupe key), subtitle (dup)
- **Footer** (`:223,225,227`): `Terms of Service`, `Privacy Policy`, `Refund Policy`

**Note on the mock preview:** the `Starbucks Receipt` demo table (`:28-86`) is decorative product-shot content. Translating "Starbucks Coffee" / "Oct 24, 2023" is arguably pointless (a receipt image would be in the original merchant's language anyway). This is a judgement call for the landing PR, not the paywall.

---

## 3. RTL specifics — what jsdom cannot verify

`dir=rtl` propagates to the portal for free (§1), so **strings will render RTL**. But layout will **not** mirror, because the components use *physical* Tailwind classes. Every one of these is a live-iPhone check, not a test:

**Paywall (`PaywallModal.tsx`):**
- `text-left` on both plan tiles (`:271`, `:286`) — in AR the plan name/price should be right-aligned. Won't flip.
- `Save {n}%` badge is absolutely positioned `right-2 top-[-10px]` (`:292`) — in RTL it should sit top-**left**. Won't flip; will overlap the wrong corner.
- Close button `right-2` (`:142` native, `:248` web) — should be top-left in RTL.
- CTA renders `Upgrade Now - {price}{suffix}` as one LTR-concatenated string (`:341`) — in RTL the word order and the price/suffix adjacency need review; a hand-concatenated string with a `-` separator is exactly what breaks under bidi.
- Feature rows use `gap-3` flex with a leading icon (`:316`) — flex row order flips under RTL automatically, but the check-circle icon sitting "before" the text needs to visually lead from the right. Live check.
- Decorative blobs `left-0` / `left-[-20px]` / `right-[-20px]` (`:233-235`) — cosmetic, symmetric, low-risk.

**The bidi trap in the price string:** the CTA and the tile prices interleave a Paddle-formatted currency string (which may itself contain LTR digits and a currency symbol) with our AR/FR suffix and label. Mixed LTR-number-in-RTL-line is the classic place Arabic layout goes wrong (symbol lands on the wrong side, `-` separator jumps). **`formatPercent`/currency emit Latin digits by house rule**, so an Arabic line will contain Latin numerals — that is intended here, but how it *flows* next to Arabic words is precisely what a screenshot must confirm.

**Number/percent formatting (testable by codepoint, not by "looks right"):**
- The savings badge `Save {savingsPercent}%` (`:293`) currently concatenates a raw integer and a literal `%`. It should route through `formatPercent(savingsPercent/100, language)` so FR gets `"45 %"` (narrow no-break space) and the `%` placement localizes. **This is unit-testable** by asserting the exact codepoints, per the standing "Arabic by codepoints" rule.

**Standing rule reaffirmed:** RTL layout mirroring and bidi flow → **live iPhone screenshot review**. Arabic string correctness → **codepoint assertions** in tests, never "green test = correct Arabic."

---

## 4. Interaction with #115 — the Paddle-vs-ours boundary (do not double-localize)

#115 made the price *amount* come from Paddle's `PricePreview`, already localized and currency-correct. Precise split:

**Paddle already localizes — DO NOT touch:**
- The **amount + currency**: `preview.formatted[plan]` = `lineItem.formattedTotals.total` (`:89`, rendered `:278,300,341`). Paddle formats this for the buyer's locale/currency (e.g. `MAD 90.00`). Re-formatting it would double-localize and could contradict the charged figure — the exact drift #115 killed.

**Ours to localize — Paddle does NOT touch these:**
- `periodSuffix` `/mo` `/yr` (pricing.ts, §2 #19-20) — **ours**. Paddle gives the amount, we append the period. AR/FR need `/شهر` `/سنة` or equivalent.
- The **savings percentage** (`savingsPercent`, `:220`) — **ours**: computed by `yearlySavingsPercent()` from Paddle's raw totals. The number is ours to format (`formatPercent`) and the word `Save` is ours to translate.
- The **CTA glue** `Upgrade Now - ` (`:341`) — ours. Only the price *inside* it is Paddle's.
- Every label in §2 — ours.

**Fallback path is also ours:** when `PricePreview` fails, `PLAN_CATALOG[plan].fallbackFormatted` (`$9`/`$59`) renders — a hardcoded USD literal (`:216`). In AR/FR the fallback would show `$9` while everything around it is Arabic. Minor (fallback is rare), but it's a spot where "our literal" leaks a currency. Flag, don't fix here.

---

## 5. Scope boundary — where the English-literal pattern bleeds

The pattern is **not** confined to these two files, but it's not pervasive either:

- **`SettingsScreen.tsx` billing card is already localized** — uses `s.proActive`, `s.freeTier` (`:152,166,181`), 29 `s.*` references total. Not a gap. Good.
- **`ProWelcome.tsx` (checkout-success celebration) is already localized** — `s.proWelcome*`. The post-payment screen is done. Good.
- **No checkout-*failure* screen exists** — Paddle's hosted checkout handles decline/cancel; we only handle `?checkout=success` (`Layout.tsx:49`). So there's no failure screen to localize. Good.
- **The paywall's own error toasts** (§2 #1-4) are the one adjacent-to-billing surface still English — and they're *in* the paywall file, so they belong in this PR.
- **Legal pages** (`/terms`, `/privacy`, `/refund`, linked from landing footer) are separate screens, almost certainly English-only, and out of scope for a localization PR (legal copy is a translation/legal-review project of its own).

**Where to draw the line:** the billing/entitlement surface is *already* localized except the paywall itself. So this is genuinely **paywall + landing only**, and the two should split (see recommendation). No worse adjacent surface hiding here — the earlier audit work (Settings, ProWelcome) already covered the logged-in billing UI.

---

## 6. Recommendation

### Two PRs, and do them in reach-order, not size-order

**PR 1 — the paywall (do first; highest reach, ~20 keys).**
The paywall is behind auth, so its viewers can already be in AR/FR — this is the real live defect. ~20 keys × 3 locales. Convert the web branch to `useStrings` exactly as the native branch and `ProWelcome` already do. Route the savings badge through `formatPercent`. Localize `periodSuffix`. Leave Paddle's `formattedTotals` untouched (§4).

**PR 2 — the landing page (defer, or pair with a switcher).**
~50 keys, and — critically — **near-zero reach until a language switcher exists on the landing page itself**, because anonymous first-visits can't select a locale (§1, correction 2). My recommendation: **do not localize the landing page in isolation.** Either (a) defer it until there's a decision to add locale detection / a switcher to the marketing page, or (b) scope PR 2 as "landing switcher + landing strings" together so the translation actually reaches someone. Translating 50 strings that no new visitor will see is motion without movement.

If forced to pick one: **PR 1 only.** It closes the actual "AR/FR user sees English on the highest-stakes screen" defect. PR 2 is cosmetic until the switcher question is answered.

### AR translation approach

- **There is an existing AR catalog to match** — `strings.ts` `:670-999`, ~330 keys already in Modern Standard Arabic (e.g. `proWelcomeBody`, `cameraPermissionDenied`). **Match its tone and register**, don't invent a new voice. It's already MSA, no Darija — consistent with Abo Jad's requirement.
- **Abo Jad writes the final AR strings** (MSA, no Darija) — I should **draft** AR + FR proposals *keyed to the existing catalog's tone* for him to correct, not treat mine as final. The FR block (`:340-669`) is likewise an existing tone reference. Product/marketing copy ("Unlock the full power…", "Best Value") is register-sensitive in a way UI labels aren't, so those specifically want his eye.
- **The two dup CTAs** (hero + final, `:20`/`:215`) and dup subtitles should share one key each — don't create duplicate keys.

### How to test what's testable

- **Codepoint assertions** (not "looks right"): for each new AR key, assert the rendered DOM contains the exact Arabic string — catches missing/placeholder/English-fallback keys. This is the "Arabic by codepoints" rule.
- **`formatPercent` output**: assert FR savings badge renders `"45 %"` with U+202F (narrow no-break space) and `%` placement; assert AR renders Latin digits per the house rule.
- **No-hardcoded-English guard**: a test that mounts the web paywall under `lang='ar'` and asserts none of the 20 known English literals appear — the mirror of `nativeAntiSteering`'s `PRICE_REGEX` approach, and it would *bite* on a missed key.
- **Paddle boundary**: assert `formattedTotals` passes through unchanged (mock returns `MAD 90.00`, assert it renders verbatim in all three locales) — proves we didn't double-localize.

### What needs live iPhone visual review (cannot be automated)

1. **RTL layout mirror** of the whole paywall modal under `lang='ar'`: plan tiles right-aligned, `Save %` badge in the top-**left** corner, close button top-left.
2. **Bidi flow of the price line** — the CTA `Upgrade Now - {MAD 90.00}{/mo}` and the tile prices, where a Latin-digit currency string sits inside an Arabic sentence. This is the single highest-risk visual.
3. **The `-` separator** in the CTA under RTL — likely needs to become a localized template, not a literal dash.
4. **FR narrow-no-break-space** rendering in the badge on a real device (it can collapse or wrap oddly).

Screenshots on a physical iPhone in AR and FR, both plan selections, are the sign-off — green tests are necessary but explicitly not sufficient here.
