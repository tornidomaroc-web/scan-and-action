# Paid user loses access on webhook failure — recon for audit item #5

**Date:** 2026-07-22 · **Base:** `main` @ `6c762d5` · **Mode:** read-only recon. No code, config, DB, or prod contact.
**Scope:** the mirror of PR A (#114). PR A stopped a refunded customer *keeping* PRO; #5 is a paying customer *not getting* it.

## Verdict up front — #5 is smaller than the audit frames it, and the real problem is a different one

The audit treats #5 as a blocking defect in our webhook handling. Having traced it end to end, I disagree on three counts:

1. **The claim-release design is already correct**, and deliberately so. The dangerous ordering the audit implies (mark processed, then write) is **not** what the code does.
2. **Paddle retries 60 times over 3 days**, and we grant on **three redundant event types**. For a customer to be stranded by a transient fault, all of that has to fail together.
3. **A missed *renewal* webhook is harmless to the customer** — they stay PRO. Only a failed *first* payment is customer-facing, which narrows the blast radius sharply.

But the trace surfaced four things that are real, and one of them is arguably the actual item #5:

- **A correlated failure in the recovery mechanism itself** (§2, Hole 1) — the claim-release swallows its own errors, and fails precisely in the scenario it exists for. This is the one concrete bug worth fixing.
- **Total blindness to the most likely failure**: if Paddle exhausts its retries, our code never runs, so there is **no log, no alert, no signal of any kind**. The only record lives in a Paddle dashboard nobody checks. Silent by construction.
- **The script named `verifyEntitlement` cannot detect this class of bug at all** — it verifies the wrong axis (§3).
- **Every "we alert loudly" claim in this path is conditional on an env var that isn't in `.env.example`** (§5c).

---

## 1. Failure modes, traced

### (a) Webhook never arrives — **LOW risk, well covered**

Paddle's documented retry policy (live accounts): **up to 60 attempts over 3 days**, 20 in the first hour, 47 in the first day; exponential backoff. Anything other than HTTP 200, or no response within **5 seconds**, counts as failed and retries.
*Source: https://developer.paddle.com/webhooks/respond-to-webhooks*

Three days comfortably exceeds any plausible deploy window or outage. **Does a retry get wrongly dropped as a duplicate?** No — provided the claim was released. `webhookEvent.create` (`webhookController.ts:104-107`) only leaves a row behind if processing succeeded or if the release failed (Holes 1-3 below). A retry of a genuinely-unprocessed event finds no row and processes normally.

**Redundancy makes this much safer than it looks.** `classifyPaddleStatus:196-207` maps **three** independent event types to ACTIVE:
- `transaction.completed`
- `subscription.created`
- `subscription.updated` with status `active`/`trialing`/`past_due` (`:209-221`)

All three fire around a new purchase, each carries a **distinct `event_id`**, so each gets its **own claim and its own 60-retry schedule**. The entitlement write is an upsert to ACTIVE, so processing two or three of them is idempotent. A customer is only stranded if *every* grant event fails — which transient faults will not do, though a correlated fault (endpoint down, bad `custom_data`) will.

### (b) Handler throws before the entitlement write — **the design is right; three holes in it**

Confirmed ordering, and it is the safe one:

| Step | Line | What happens |
|---|---|---|
| 1 | `:104-107` | `webhookEvent.create` — **claim recorded first** |
| 2 | `:139` | `await processEvent(...)` |
| 3 | `:140-142` | on throw: `webhookEvent.delete(...)` — **claim released** |
| 4 | `:143` | rethrow → outer catch `:147-155` → Discord alert → **HTTP 500** |

So a transient failure returns 500, Paddle retries, the retry finds no claim, and it processes. **The audit's feared "marked processed while nothing was written" is not the normal path.** The comment at `:135-137` shows this was a deliberate design decision, not an accident.

The holes:

**HOLE 1 — the claim-release swallows its own failure. This is the one I would fix.**
```
await prisma.webhookEvent.delete({ where: { id: webhookEventKey! } }).catch(() => {});   // :141
```
If the delete fails, the claim **persists**, and we still return 500. Paddle retries → `webhookEvent.create` hits P2002 → `:110` returns **200 "OK (duplicate)"** → Paddle stops. Nothing was ever written. Customer paid, is on FREE, permanently.

What makes this more than theoretical: **the delete fails precisely when the database is the thing that is broken** — which is the most likely reason `processEvent` threw in the first place. The recovery mechanism is correlated with the fault it exists to recover from. A DB blip that would otherwise be fully absorbed by Paddle's retries becomes a permanent, near-silent loss.

**HOLE 2 — process death between claim and write. Structural.**
OOM, container restart, a Railway redeploy landing mid-request: the `catch` never runs, the claim persists, the retry is rejected as a duplicate. No code inside this `try` can guard it — it is inherent to claiming *before* processing. Fixing it means claiming *after* success, or giving the claim a status so an incomplete one can be retried.

**HOLE 3 — the 5-second deadline can race the retry. Real but uncommon.**
Our handler performs at least three DB round-trips: `webhookEvent.create`, `resolveBillingOrg` (`:441`), and `applyEntitlementChange` — the last an **interactive transaction opening with `SELECT … FOR UPDATE`**. On a cold start (Prisma connect + Supabase pooler) this can plausibly exceed 5 s. Then:

1. Delivery #1 exceeds 5 s → Paddle marks it failed, schedules a retry.
2. Retry arrives → P2002 → **200 "duplicate"** → Paddle marks the notification **delivered and stops retrying**.
3. Delivery #1 finally throws → deletes the claim → 500.
4. Net: no entitlement, no claim, **no further retries**.

Needs slow-*then*-fail, so it is not routine — but the 5 s budget against an interactive locking transaction is tighter than it looks, and nothing measures it.

### (c) Identity resolution fails — **by design, and well guarded in practice**

`processEvent:442-481`: when `resolveBillingOrg` returns null, we log `[Webhook][ALERT] PRO upgrade NOT applied … Customer paid but is still on FREE` (`:471`), fire a Discord alert (`:472-478`), and **`return` normally** (`:481`).

Returning normally means the **claim persists** and Paddle gets 200 and never retries. That is the correct call — retrying cannot invent a mapping that does not exist — but it does mean recovery is 100 % manual.

**How likely is it?** Much less than the audit implies:
- The paywall is auth-gated and **fail-closed on `user.id`** (frontend `PaywallModal`), so `custom_data.userId` is always populated when we open checkout.
- Every authenticated user is auto-provisioned an Organization **and an OWNER Membership** on first authenticated request (`authMiddleware.ts:66-95`, `ensureOrganization`). So `user.memberships.length === 0` — the other null path in `resolveBillingOrg:79-81` — should be unreachable for anyone who can reach checkout.
- `extractUserId:163-171` fails *safe*: a malformed UUID is logged and discarded rather than thrown, falling back to email rather than 500-ing.

Realistically this needs the user to be deleted between checkout and webhook. **Low.**

### (d) Race / ordering — **guarded**

`applyEntitlementChange` locks the org row (`SELECT … FOR UPDATE`) so concurrent deliveries for one org serialize; the out-of-order guard compares `eventOccurredAt` against `lastEventAt` and, when stale, leaves the source row alone **but still recomputes the plan** — idempotent, and it heals a plan write an earlier crash skipped.

Could a stale event block a grant? Only where the newer event genuinely is a downgrade, which is correct behaviour. Two grant events with near-identical timestamps both map to ACTIVE, so ordering between them is irrelevant. **No realistic #5 exposure here.**

---

## 2. The idempotency mechanism, precisely

| Scenario | Claim row | HTTP | Paddle behaviour | Customer outcome |
|---|---|---|---|---|
| **Success** | persists | 200 | done | correct |
| **Thrown error** (delete succeeds) | released | 500 | retries, up to 60× / 3 days | **recovers** |
| **Thrown error** (delete fails — Hole 1) | **persists** | 500 | retries → P2002 → 200 duplicate → stops | **permanent loss** |
| **Process death** (Hole 2) | **persists** | none | retries → P2002 → 200 duplicate → stops | **permanent loss** |
| **Genuine duplicate** | persists | 200 `OK (duplicate)` (`:110`) | stops | correct |
| **Identity unresolved** | persists | 200 | stops | **paid, on FREE** — alerted, manual fix |
| **No `event_id`** (`:116-118`) | none written | 200/500 | normal | processed with **no** idempotency guard |

**Direct answer to the critical question:** processing throwing after the claim but before the entitlement write does **not** normally leave the event marked processed — the claim is explicitly released at `:141`. The exposure is narrower and sharper than the audit suggests: it exists only when the *release itself* fails (Hole 1) or never runs (Hole 2).

---

## 3. Recovery today

**No automated reconciliation exists**, and the thing that sounds like it isn't.

- **`scripts/verifyEntitlement.ts` verifies the wrong axis.** It asserts `derivePlan(planOverride, subscriptions) === Organization.plan` — **our database against itself**. A customer who paid at Paddle but has no `Subscription` row is perfectly "consistent": no subs → derives FREE → stored FREE → ✅ 0 mismatches. **It cannot detect item #5 at all.** Given the name, this is worth stating plainly before anyone leans on it.
- **No Paddle API access on the backend.** No `@paddle/*` dependency, no `PADDLE_API_KEY`, no call to `api.paddle.com` anywhere in `apps/backend/src`. The only Paddle secret is `PADDLE_WEBHOOK_SECRET`. So the server *cannot* re-query Paddle to reconcile, even if we wanted to.
- **`planOverride` is a usable manual fix — the best one available.** `derivePlan:38-44` treats it as a floor that no billing event can lower, and `applyEntitlementChange` deliberately never writes it. Setting `planOverride = PRO` restores the customer in one field. **Caveat:** it is a *floor*, so if the subscription later genuinely cancels, the override keeps them PRO indefinitely until someone clears it. It is a fix that creates a cleanup obligation.
- **Paddle's replay-a-notification is a real recovery path** — failed or delivered notifications can be replayed for up to 90 days. **But it is defeated by exactly the holes that need it:** if the claim persisted (Holes 1-3), a replay hits P2002 and returns 200 "duplicate" without writing anything. The primary recovery mechanism is broken by the same defect that causes the problem.

**Otherwise the failure is invisible until the customer complains** — and see §5c on why even the alerts may not be reaching anyone.

---

## 4. Real vs theoretical — honest severity

**#5 as the audit frames it is not a blocker.** Ranked by actual likelihood × impact:

| Risk | Real? | Severity |
|---|---|---|
| **No signal at all when Paddle exhausts retries** | **Yes — certain, by construction** | **Highest.** Our code never runs, so nothing logs. Only Paddle's dashboard knows. |
| Hole 1 — claim-release swallows its own failure | Yes; correlated with DB faults | **Medium-high.** Cheap to fix. |
| Hole 2 — process death between claim and write | Yes; needs a restart mid-request | Medium |
| Hole 3 — 5 s deadline racing the retry | Yes; needs slow-then-fail | Low-medium |
| Identity resolution failure | Guarded by fail-closed checkout + auto-provisioned org | Low |
| Webhook simply never arrives | Paddle: 60 retries / 3 days | Low |
| Race / ordering | `FOR UPDATE` + out-of-order guard | Low |

**Paddle's retry machinery does cover most of what the audit worries about.** What it cannot cover is the case where *we* answer 200 having written nothing — which is precisely Holes 1-3 — and the case where retries are exhausted, which we never learn about.

**So the honest restatement of item #5 is not "a paying customer can lose access."** It is: **"if a paying customer loses access, we will not find out."** The mechanism is decently defended; the *detection* is absent.

---

## 5. Adjacent findings — flagged, not fixed

**a. First payment vs renewal differ fundamentally, and only one is customer-facing.**
A missed **renewal** `transaction.completed` is *harmless to the customer*: the Subscription row is already ACTIVE, nothing sets it INACTIVE, so they keep PRO. Only the **first** payment can strand someone. This narrows item #5's real blast radius to new customers only — a useful scoping the audit does not make.

**b. The mirror leak has no detection either.** A missed `subscription.canceled` leaves a non-paying customer on PRO indefinitely, with no retry exhaustion signal and nothing to reconcile against. Same blind spot, opposite direction, pure revenue leak. Any reconciliation built for #5 should cover both directions — it is the same query.

**c. Every "we alert loudly" claim on this path is conditional on an undocumented env var.**
`discordAlert.ts:77-83` reads `DISCORD_ALERT_WEBHOOK_URL` at call time; if unset it logs `[DiscordAlert] … not set — skipping alert (fail-safe)` and returns. **That variable does not appear in `.env.example`.** If it is not set in Railway, every alert in this recon — including "Customer paid but is still on FREE" — degrades to a console line in logs the module's own header says "nobody is watching". **Whether it is set in production is unverified and should be checked before relying on any manual-recovery story.** This single unknown determines whether §3's recovery path exists at all.

**d. `subscription.activated` is not handled — and that is fine.** `classifyPaddleStatus:196-207` does not mention it. Not a gap: `subscription.created` grants unconditionally regardless of status (including `trialing`), and `subscription.updated`→`active` grants too. Noted so nobody "fixes" a non-problem.

**e. Events without `event_id` bypass idempotency entirely** (`:116-118`), processing with only a warning. Paddle Billing always sends one, so this is a defensive branch — but it is also the one path where a duplicate delivery would double-process. Harmless today (writes are idempotent upserts); worth remembering if a non-idempotent action is ever added.

**f. Dunning is handled correctly.** `past_due` → ACTIVE (`:213-214`) so access is not yanked mid-dunning; terminal failure arrives as `subscription.canceled`. Deliberate and documented. No action.

---

## 6. Recommendation

**#5 is not a blocker, and I would not treat it as one.** The grant path is better defended than the audit assumes: correct claim-release ordering, three redundant grant events, 60 Paddle retries over 3 days, fail-closed identity, and `FOR UPDATE` serialization. What is missing is not resilience — it is **detection**.

**Smallest fix that closes the real risk — one PR, two small parts:**

**Part 1 — make the claim-release honest (closes Hole 1, ~5 lines).**
Stop swallowing the delete failure at `:141`. If the release fails, we must not let Paddle's retry be silently rejected later: log and alert at `[ALERT]` severity naming the event id, so the stuck claim is visible and can be cleared by hand (which makes Paddle's replay work again). This is the highest value-per-line change available here.

*Considered and rejected as the primary fix:* re-ordering to claim-after-success. It would close Holes 1 **and** 2 properly, but it trades a rare permanent-loss for a routine double-processing window on concurrent retries. That is only safe because our writes are idempotent upserts today — a fragile property to depend on. A `status` column on `WebhookEvent` (`claimed` → `processed`, retry anything left `claimed` past a threshold) is the correct end state, but it needs a **migration**, and migrations lag prod here. **Not in this PR.**

**Part 2 — the actual item #5: a reconciliation signal.**
The real defect is that we cannot tell whether this has ever happened. The cheapest honest version is **not** code: **check the Paddle dashboard for notifications in `failed` status** (they persist 90 days) and confirm `DISCORD_ALERT_WEBHOOK_URL` is actually set in Railway. That is minutes of work and it either finds real stranded customers or retires the whole concern with evidence. **Do this first — it may reprice everything above.**

The code version — a periodic job that lists Paddle subscriptions and compares against our `Subscription` rows, alerting on both directions (§5b) — requires a `PADDLE_API_KEY` the backend does not have and a new outbound dependency. That is a **separate, larger PR**, and it should not be started until the dashboard check shows the problem is real.

**Explicitly NOT recommended:** rewriting the idempotency model, adding a retry queue, or building reconciliation before measuring. Paddle already retries 60 times over 3 days; duplicating that machinery would add risk, not remove it.

**How to test Part 1 without prod:** `webhookController.test.ts` already mocks `prisma`, both entitlement services, and the Discord sink. Make `webhookEvent.delete` reject, assert the `[ALERT]` fires naming the event id and the response is still 500. Add a companion test that the normal path still deletes the claim and rethrows. No DB required.

**Sequencing:** dashboard check (minutes, no PR) → Part 1 (small PR) → decide on reconciliation with evidence in hand.
