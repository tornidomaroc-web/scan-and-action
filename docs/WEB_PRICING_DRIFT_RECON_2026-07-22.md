# Web pricing drift — recon for production-readiness audit item #4

**Date:** 2026-07-22 · **Base:** `main` @ `00bc06c` · **Mode:** read-only recon. No code, config, DB or prod contact.
**Scope:** audit item #4 (`docs/PRODUCTION_READINESS_AUDIT_2026-07-18.md:40-47, 257-258`) — "displayed web price is hardcoded in JSX, decoupled from the Paddle price actually charged, untested, unlocalised."

**Verdict up front:** the audit's core claim is **correct**, and I found direct historical evidence of the drift mechanism in git. But the audit **overstates the severity** of the drift (a user cannot be silently charged a different amount — Paddle's own overlay shows the real total before payment), **understates the localisation defect** (the entire web paywall is unlocalised English, not just the price), and **misses two sharper problems next door** (no server-side price-ID allowlist; landing advertises $9/mo while the paywall pre-selects $59/yr).

---

## 1. The displayed price — **five** hardcoded literals across two files, not one

| # | Location | Literal | Surface |
|---|---|---|---|
| 1 | `apps/frontend/src/screens/LandingScreen.tsx:183` | `$9` + `/mo` | Marketing landing, "Pro" pricing card |
| 2 | `apps/frontend/src/components/PaywallModal.tsx:194` | `$9` + `/mo` | Paywall, Monthly plan tile |
| 3 | `apps/frontend/src/components/PaywallModal.tsx:211` | `$59` + `/yr` | Paywall, Yearly plan tile |
| 4 | `apps/frontend/src/components/PaywallModal.tsx:248` | `'$9/mo'` / `'$59/yr'` | Paywall, CTA button label — a **second copy** of both numbers |
| 5 | `apps/frontend/src/components/PaywallModal.tsx:206` | `Save 45%` | Paywall, yearly badge — a **derived claim** stored as a literal |

Also `LandingScreen.tsx:169` renders `$0` for the Free tier (not a charged price; harmless).

**Currency:** USD in every case, expressed as a bare `$` glyph. No currency code, no `Intl.NumberFormat`, no locale awareness anywhere.

**Is `$9/mo` the same value the Android recon referenced?** Yes — identical. `LandingScreen.tsx:183` and `PaywallModal.tsx:194` are both `$9/mo`. There is no second monthly price anywhere in the repo.

**Consistency check on `Save 45%`:** $9 × 12 = $108; $59 is 45.4% off. The badge is currently *accurate* — but only by hand. It is a fourth number that must be re-derived by a human every time either price moves.

**Asymmetry worth noting:** the landing page advertises **only** the monthly `$9/mo` tier. It never mentions the yearly plan. The paywall does — and defaults to it (see §6c).

---

## 2. The charged price — defined entirely outside this repo

The flow, byte-verified:

- `PaywallModal.tsx:20-23` — `PADDLE_PRICE_IDS` reads `import.meta.env.VITE_PADDLE_PRICE_ID_MONTHLY` / `_YEARLY`. Module-eval time, no fallback (deliberate; comment at `:17-19`).
- `PaywallModal.tsx:110-115` — fail-closed: unset price ID ⇒ refuse to open checkout, surface an error. Correct.
- `PaywallModal.tsx:120-126` — `paddle.Checkout.open({ items: [{ priceId, quantity: 1 }], … })`. **The only thing we send is the price ID.** No amount, no currency, no expected-total assertion.
- `apps/frontend/src/lib/paddle.ts:22-46` — SDK init from `VITE_PADDLE_CLIENT_TOKEN`; environment derived from the token prefix (`test_` ⇒ sandbox). Clean.

**Where the amount actually lives:** the Paddle dashboard, behind the price ID. Nowhere in this codebase.

**Where the price IDs live:** not in git either. `.env.example:46-47` holds `pri_xxxxxxxxxxxx` placeholders only, and `apps/frontend/.env.production` (the *committed*, intentionally-tracked env file) explicitly carries only `VITE_API_URL` and states that Paddle credentials come from the build environment. So the real IDs are Vercel dashboard values.

**Therefore there are three independent control planes:**

| Plane | Controls | Changed by | In git? |
|---|---|---|---|
| JSX literals | what the user **reads** | a code PR | ✅ yes |
| Vercel env var | which Paddle price is **used** | Vercel dashboard | ❌ no |
| Paddle price object | what the user is **charged** | Paddle dashboard | ❌ no |

**Nothing keeps them in sync.** No runtime read of Paddle's price, no build-time check, no test, no lint, no documented runbook step. Two of the three planes are invisible to code review entirely.

---

## 3. The real gap — audit is right on the mechanism, wrong on the severity

### The drift is real, and it has already happened once in the shape the audit describes

`git log -S'$59' -- PaywallModal.tsx` surfaces commit **`0560655` "chore: update paywall pricing display"** (2026-04-01):

```
apps/frontend/src/components/PaywallModal.tsx | 8 ++++----   ← ONE file, FOUR lines
-  $5/mo   → +  $9/mo
-  Save 35% → +  Save 45%
-  $39/yr  → +  $59/yr
```

A price change that touched **only JSX** — no env file, no config, no test, no doc. Whether the Paddle dashboard was updated in the same breath is unverifiable from this repo. That is precisely the failure shape the audit warns about, committed as a "chore".

(For completeness: `LandingScreen.tsx` did not exist yet at `0560655` — it was created the next day in `c40c226` already carrying `$9`. So the two surfaces have never been *observed* out of sync with each other. They are still two independent literals that can diverge on the next edit.)

### But the risk is narrower than "shown one price, charged another"

**Correction to the audit's framing.** Paddle's overlay checkout renders its own line item, currency and total — computed from the Paddle price object — *before* the user enters payment details. So the concrete failure mode is:

> Our page says **$9**. The Paddle overlay opens and says **$12**. The user sees the mismatch at the moment of payment.

That is a **trust, conversion and advertising-accuracy** failure. It is **not** a silent overcharge: the buyer has a clear opportunity to see the real number and abandon. The audit's phrasing ("shown one price and charged another", "silent") implies a hidden mis-charge that the architecture does not actually permit.

**Precise risk statement:** today, if the Paddle dashboard matches $9/$59, the exposure is **latent, not live** — this is a *missing-guardrail* defect, not an active mispricing. Its severity is that any future price change is a two-place edit with no mechanism forcing the second place, and the second place is invisible to CI and code review. I'd call this **MEDIUM**, not blocking-on-its-own — with the caveat below.

**Unverified (requires the Paddle dashboard, out of scope for read-only recon):** the actual live amounts behind `VITE_PADDLE_PRICE_ID_MONTHLY` / `_YEARLY`, whether they are $9/$59 or still $5/$39, whether the catalog contains stale price objects, and whether multi-currency/geo-pricing is enabled. **Check this before the fix PR** — if the live prices are $5/$39, this stops being latent and becomes a live mismatch shipping today.

---

## 4. Localisation — the audit understates this significantly

The audit says the price is "not localised … every locale sees raw USD." True, but far too narrow.

**The entire web paywall is unlocalised English.** `PaywallModal.tsx` imports `useStrings` (`:5`) and calls it (`:32`) — but uses `s.*` at exactly **three** sites, all inside the **native** "coming soon" branch: `:65`, `:79`, `:85`. Every string on the **web** checkout path is a hardcoded English literal:

- `:159` "Upgrade to PRO" · `:173-175` body copy · `:181` "Choose your plan"
- `:193` "Monthly" · `:209` "Yearly" · `:206` "Save 45%" · `:212` "Best Value"
- `:220-223` all four feature bullets
- `:248` "Opening checkout…" / "Upgrade Now - $9/mo"  · `:254` "Maybe later"
- `:106`, `:113`, `:130-132` all three user-facing error messages

`LandingScreen.tsx` is worse: it does not import `useStrings` at all (`:1-2`). The whole marketing page — hero, benefits, pricing block, CTAs, footer — is English-only.

`strings.ts` carries full EN/FR/AR sets (1000 lines; `proComingSoon*` at `:159-161`, `:496-498`, `:826+`) — so the i18n machinery exists and is used elsewhere. The web sell surface simply never adopted it.

**Consequence:** an Arabic or French user on the web sees a fully English paywall, LTR, with a `$` price. Not just an unlocalised number — an unlocalised *page*, on the highest-stakes screen in the product.

**Currency vs. what Paddle charges:** we pass no locale and no currency hint to `Checkout.open` (`:125` sets only `successUrl`). Paddle applies its own currency localisation based on buyer geo and seller configuration. So a Moroccan buyer plausibly sees `$9` on our page and a MAD or EUR total in the overlay. Whether that happens depends on Paddle dashboard multi-currency settings — **unverified**. Note this cuts both ways: it is a second, independent display/charge mismatch vector *that a code-only fix cannot close*.

---

## 5. Test coverage — none, in the positive direction

Confirmed by reading both relevant test files, not by grep alone:

- **`apps/frontend/tests/paywallCheckoutGuard.test.tsx`** — asserts the fail-closed `user.id` guard (`:79-91`) and that `Checkout.open` receives `customData.userId` (`:93-104`). It stubs the price IDs (`:35-36`) but **never asserts which `priceId` was passed**, and never asserts any displayed amount.
- **`apps/frontend/tests/nativeAntiSteering.test.tsx`** — asserts the **absence** of price copy: `PRICE_REGEX` (`:86-87`) applied at `:135`, `:199`, `:270`, `:303`, and per-locale at `:546`.

So the price is guarded in **exactly one direction**: it must never appear on native. There is **no test that a price appears correctly on web**, no test tying displayed to charged, and no test on `Save 45%`. The audit's claim here is accurate as written.

One useful consequence: `nativeAntiSteering`'s `PRICE_REGEX` is behavioural, not a snapshot — it will keep working if the render path changes, but **it must be re-pointed at any new price-rendering code path** so the native no-price guarantee doesn't silently go vacuous.

---

## 6. Adjacent findings — flagged, not fixed

**(a) The backend never checks what was paid. Arguably worse than item #4.**
`derivePlan.ts:38-44` grants PRO on **any** ACTIVE subscription. `webhookController.ts` reads event type, ids and `custom_data.userId` — grepping `price|amount|total|product` across `webhookController.ts` and the entitlement services returns only comment hits. The price ID is chosen **client-side** from a public bundle variable, so a user who edits the bundle or opens the console can call `Checkout.open` with any price ID in the seller's Paddle catalog — a legacy `$5`/`$39` price, a sandbox price, a promotional `$0` price — and the backend grants PRO identically. **There is no server-side allowlist of accepted price IDs.** Blast radius is bounded by what actually exists in the catalog (unverified), but this is a *live* revenue-integrity hole requiring no configuration drift at all, and I do not see it anywhere in the audit. I'd rank it above item #4 as written.

**(b) Item #5 (paid-user loss on webhook failure) barely overlaps this code.**
The client half is `handleUpgrade` (`PaywallModal.tsx:94-137`) — `customData.userId` at `:124` is the sole attribution channel and the fail-closed guard at `:104-108` is already correct and tested. #5 actually lives on the webhook side: idempotency key (`webhookController.ts:105`), ACTIVE/INACTIVE mapping (`:195-219`), `subscription.updated` status defaulting to ACTIVE on unknown status (`:216-219`). **#4 and #5 can ship as independent PRs**; expect at most a few lines of contact in `PaywallModal.tsx`.

**(c) A live expectation mismatch, today, with no drift required.**
The landing page advertises **only** `$9/mo` (`LandingScreen.tsx:183`) with an "Upgrade Now" CTA (`:190`). The paywall initialises `selectedPlan` to **`'yearly'`** (`PaywallModal.tsx:34`) and presents $59/yr as "Best Value". A user who clicks the $9/mo card and then clicks the paywall's primary button is one inattentive click from a $59 charge. This needs no config drift and is shipping right now. In my judgement it is the most concrete consumer-protection issue in item #4's neighbourhood, and the audit does not mention it. It is also a one-line fix.

**(d) `Save 45%` (`:206`) is a derived claim frozen as a literal** — it becomes a false advertising claim the moment either number moves. It belongs in whatever single-source-of-truth lands.

**(e) `CHECKOUT_SUCCESS_URL` (`:29`) is hardcoded to `https://www.scan-action.com/dashboard?checkout=success`** — any preview/staging deploy sends buyers to production after payment. Out of scope for #4; noting it.

---

## 7. Recommendation — how to fix item #4

### The single change that actually removes the drift

**Render the price from Paddle, not from JSX.** Paddle.js exposes `paddle.PricePreview({ items: [{ priceId, quantity: 1 }] })`, which returns the localised, geo-correct, tax-aware **formatted total for the exact price ID we are about to open checkout with**. If the paywall displays that string, displayed-price **is** charged-price by construction — not by convention, not by a runbook, not by a test that can rot. It also resolves the currency question in §4 for free: a Moroccan buyer sees the same currency on our page as in the overlay.

Concretely, one PR:

1. **`apps/frontend/src/lib/pricing.ts`** (new) — the one place a price exists in code: `{ monthly: { priceId: env, fallbackAmount: 9, currency: 'USD' }, yearly: { … 59 } }`, plus `yearlySavingsPct` **computed**, never typed. This kills the five duplicated literals and makes `Save 45%` self-consistent.
2. **`PaywallModal.tsx`** — fetch `PricePreview` on open; render the returned formatted totals at `:194`, `:211`, `:248`; render the computed savings at `:206`. On preview failure, fall back to the declared amounts from (1) so the paywall never renders blank or blocks a sale.
3. **`LandingScreen.tsx:183`** — read the monthly amount from (1). (The landing page is pre-auth and shouldn't pay for a Paddle round-trip; the declared amount is acceptable there *provided* it is the same export the paywall falls back to.)

That is the smallest change that genuinely removes the drift risk. A "declare the price in one module and remember to update Paddle too" fix does **not** remove it — it only reduces five literals to one, leaving the code↔Paddle gap fully open.

### Localisation: **separate PR, not bundled**

The `PricePreview` change already fixes the *price string's* currency and formatting. Full paywall + landing i18n is a different job — roughly 20 new keys × 3 locales, plus RTL layout on a modal and on the marketing page, with a real visual-regression surface. Bundling it would turn a tight, testable revenue fix into a large diff where the important assertion gets lost in review. **Do it as PR 2.**

### How to test it

1. **Unit** — `pricing.ts` is the only source; the savings percentage is derived, not hardcoded (assert it changes when the amounts change).
2. **Component (the load-bearing one)** — mock `PricePreview` to return a known formatted total; assert the DOM shows **exactly** that string, **and** that the `priceId` passed to `Checkout.open` is the **same one** the preview was taken for. This is the assertion that pins displayed == charged; nothing else in the suite does.
3. **Fallback** — `PricePreview` rejects ⇒ the declared amount renders and checkout still opens (a Paddle outage must not kill the sale).
4. **Regression** — landing and paywall monthly price resolve to the same export.
5. **Native guarantee** — re-point `nativeAntiSteering`'s `PRICE_REGEX` assertions at the new render path, and confirm `PricePreview` is never called inside the native shell (it would load the Paddle SDK on a Play build — an anti-steering breach in itself).

### PR count

- **PR 1** — single source of truth + `PricePreview` + tests 1-5. **Closes item #4.**
- **PR 2** — paywall + landing i18n (EN/FR/AR + RTL). Independent.
- **PR 3 (recommend prioritising over PR 2)** — server-side allowlist of accepted Paddle price IDs in the webhook path, per finding (a). Small diff, closes a live hole that item #4 does not.
- **One-liner, fold into PR 1** — finding (c): either default `selectedPlan` to `'monthly'`, or make the landing CTA carry the plan it advertised.

---

## Appendix — evidence index

| Claim | Evidence |
|---|---|
| 5 hardcoded price literals | `LandingScreen.tsx:183`; `PaywallModal.tsx:194,206,211,248` |
| Price IDs from env, no fallback | `PaywallModal.tsx:20-23`, guard `:110-115` |
| Only the price ID reaches Paddle | `PaywallModal.tsx:120-126` |
| Amount not in repo | `.env.example:46-47`; `apps/frontend/.env.production` (whole file) |
| Display-only price change happened | `git show 0560655` — 1 file, 4 lines, $5→$9 / $39→$59 / 35%→45% |
| Paywall web path unlocalised | `PaywallModal.tsx` uses `s.*` only at `:65,79,85` (native branch) |
| Landing unlocalised | `LandingScreen.tsx:1-2` — no `useStrings` import |
| No positive price test | `paywallCheckoutGuard.test.tsx` (full read); `nativeAntiSteering.test.tsx:86-87,135,199,270,303,546` |
| Backend ignores amount | `derivePlan.ts:38-44`; no `price`/`amount`/`product` reads in `webhookController.ts` |
| Landing $9/mo vs paywall default yearly | `LandingScreen.tsx:183,190` vs `PaywallModal.tsx:34,211` |
