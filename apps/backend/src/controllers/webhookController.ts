import { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { SubscriptionStatus } from '@prisma/client';
import { prisma } from '../prismaClient';
import { resolveBillingOrg } from '../services/entitlement/resolveBillingOrg';
import { resolveBillingOrgByExternalId } from '../services/entitlement/resolveBillingOrgByExternalId';
import { applyEntitlementChange } from '../services/entitlement/applyEntitlementChange';
import { sendDiscordAlert } from '../services/discordAlert';
import { unknownPriceIds } from '../config/paddlePrices';

// Fire a best-effort Discord alert WITHOUT awaiting and without any chance of
// throwing into the payment path. sendDiscordAlert already never rejects; the
// detached .catch is belt-and-suspenders so even a future regression there can
// never surface as an unhandled rejection or delay the Paddle response. The
// existing console.* line remains the durable record — this is the push on top.
function fireDiscordAlert(message: string, context?: Record<string, string | number | undefined | null>): void {
  void sendDiscordAlert(message, context).catch(() => {});
}

// Checkout.open sends customData {userId} — the Supabase UUID, which is also
// User.id. Paddle copies checkout custom_data to the subscription and on to
// every future transaction, so it is present on upgrade, renewal, refund, and
// expiry events alike. Paddle Billing payloads carry no email, so this is the
// primary match; email remains a fallback for manual/imported events.
const customDataSchema = z.object({ userId: z.string().uuid() });

// Reject events whose signature timestamp is older than this (replay window).
// Paddle retries failed deliveries within minutes; 5 minutes is generous for
// legitimate retries while keeping captured payloads unusable.
const MAX_EVENT_AGE_SECONDS = 5 * 60;
// Tolerate small clock skew between Paddle and us for "future" timestamps.
const MAX_CLOCK_SKEW_SECONDS = 60;

export class WebhookController {
  public static async handlePaddle(req: Request, res: Response) {
    try {
      const secret = process.env.PADDLE_WEBHOOK_SECRET || '';

      const rawBody = req.body as Buffer;
      const signatureHeader = req.get('paddle-signature') || '';

      const tsPart = signatureHeader.split(';').find(p => p.startsWith('ts='));
      const h1Part = signatureHeader.split(';').find(p => p.startsWith('h1='));

      const timestamp = tsPart?.split('=')[1];
      const signature = h1Part?.split('=')[1];

      if (!secret) {
        console.warn('[Webhook] Missing PADDLE_WEBHOOK_SECRET');
        return res.status(500).send('Webhook secret not configured');
      }

      if (!Buffer.isBuffer(rawBody)) {
        console.warn('[Webhook] Raw body is not a Buffer');
        return res.status(400).send('Invalid body');
      }

      if (!timestamp || !signature) {
        console.warn('[Webhook] Missing ts/h1 in paddle-signature header');
        return res.status(401).send('Invalid signature header');
      }

      // Freshness: reject replayed events outside the allowed window.
      const eventAgeSeconds = Math.floor(Date.now() / 1000) - Number(timestamp);
      if (
        !Number.isFinite(eventAgeSeconds) ||
        eventAgeSeconds > MAX_EVENT_AGE_SECONDS ||
        eventAgeSeconds < -MAX_CLOCK_SKEW_SECONDS
      ) {
        console.warn(`[Webhook] Stale or invalid timestamp (age: ${eventAgeSeconds}s)`);
        return res.status(401).send('Stale webhook event');
      }

      // Constant-time signature comparison.
      const digest = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}:${rawBody}`)
        .digest();
      let signatureBuffer: Buffer;
      try {
        signatureBuffer = Buffer.from(signature, 'hex');
      } catch {
        return res.status(401).send('Invalid signature');
      }
      if (signatureBuffer.length !== digest.length || !crypto.timingSafeEqual(digest, signatureBuffer)) {
        console.warn('[Webhook] Invalid signature received');
        return res.status(401).send('Invalid signature');
      }

      const event = JSON.parse(rawBody.toString('utf8'));
      const eventName = event.event_type;
      const eventId = event.event_id;
      const email = event.data?.customer?.email || event.data?.email;

      // Idempotency: record the event ID before processing; the primary key
      // makes duplicate deliveries (Paddle retries) no-ops. Duplicates get a
      // 200 so Paddle stops retrying.
      // The stored key is source-namespaced ("paddle:<event_id>") so a future
      // RevenueCat event id cannot collide with a Paddle one on this shared PK
      // and get silently dropped as a duplicate. Paddle behaviour is otherwise
      // unchanged — same idempotency, same release-claim-on-error below.
      const webhookEventKey = eventId ? `paddle:${eventId}` : undefined;
      if (eventId) {
        try {
          await prisma.webhookEvent.create({
            data: { id: webhookEventKey!, eventType: eventName || 'unknown' }
          });
        } catch (err: any) {
          if (err.code === 'P2002') {
            console.log(`[Webhook] Duplicate delivery skipped: ${eventId} (${eventName})`);
            return res.status(200).send('OK (duplicate)');
          }
          throw err;
        }
      } else {
        console.warn(`[Webhook] Event without event_id (${eventName}) — processing without idempotency guard`);
      }

      // Identify the payer by Paddle ids, never by email.
      //
      // Note this could NOT simply become `userId`: the email was the FALLBACK
      // identity here, present precisely when custom_data.userId is absent, so
      // substituting the UUID would print 'none' in exactly the cases the log
      // exists for. Paddle's customer_id does not have that hole — it is on the
      // event whether or not our checkout metadata survived — and it resolves to
      // the full customer inside Paddle, our system of record for billing.
      // Both ids are logged so either route to the customer works. Same
      // substitution B1 made for the billing alerts.
      console.log(
        `[Webhook] Received ${eventName} (${eventId || 'no-id'}) for customer ` +
          `${event.data?.customer_id || 'none'} (userId ${event.data?.custom_data?.userId || 'none'})`
      );

      // From here on, a thrown error must release the idempotency claim:
      // otherwise a transient failure marks the event "processed" and
      // Paddle's retry gets skipped — losing a paid upgrade.
      try {
        await WebhookController.processEvent(event, eventName, eventId, email);
      } catch (processingError) {
        if (eventId) {
          // Releasing the claim is the ONLY thing that lets Paddle's retry work,
          // so a failed release cannot be swallowed.
          //
          // If this delete fails the claim STAYS, and the consequences are silent
          // and terminal: we return 500, Paddle retries, the retry hits P2002 on
          // the create above and is answered 200 "OK (duplicate)", Paddle marks
          // the notification delivered and stops. Nothing was ever written. The
          // same P2002 also defeats Paddle's replay-a-notification, so the manual
          // recovery path dies with the automatic one.
          //
          // This is not a hypothetical pairing: the delete is most likely to fail
          // exactly when the database is the thing that is broken — which is the
          // most likely reason processEvent threw in the first place. The recovery
          // mechanism is correlated with the fault it exists to recover from.
          //
          // We cannot fix the stuck claim from here (the DB is what just failed),
          // so the goal is that it can never be SILENT: name the row so a human
          // can delete it and replay the notification.
          //
          // Deliberately NOT rethrown, and deliberately caught separately: this
          // must not replace `processingError`, which carries the real diagnosis
          // and is what the outer handler logs and alerts on.
          try {
            await prisma.webhookEvent.delete({ where: { id: webhookEventKey! } });
          } catch (releaseError: any) {
            console.error(
              `[Webhook][ALERT] Idempotency claim STUCK — could not release ${webhookEventKey} ` +
                `(${eventName || 'unknown'}) after a processing failure. Paddle's retry AND its replay ` +
                `will both be answered "duplicate" and write NOTHING. If this event granted access, the ` +
                `customer paid and is still on FREE. FIX: delete the WebhookEvent row with this id, then ` +
                `replay the notification from Paddle. release_error=${releaseError?.message || String(releaseError)}`
            );
            fireDiscordAlert(
              'Idempotency claim STUCK — a webhook failed AND its claim could not be released. ' +
                'Paddle retries/replays will be rejected as duplicates and write nothing. ' +
                'FIX: delete the WebhookEvent row with this id, then replay the notification.',
              {
                webhook_event_key: webhookEventKey,
                event: eventName || 'unknown',
                event_id: eventId,
                release_error: releaseError?.message || String(releaseError),
              }
            );
          }
        }
        throw processingError;
      }

      return res.status(200).send('OK');
    } catch (error: any) {
      console.error('[Webhook] Error processing Paddle event:', error.message || error);
      // Push alert: a 500 means Paddle will retry, but a persistent failure can
      // silently strand a paid customer. error.message only (already logged
      // above) — no payload, no secret.
      fireDiscordAlert('Webhook processing FAILED (HTTP 500) — Paddle will retry; investigate if it persists.', {
        error: error?.message || String(error),
      });
      return res.status(500).send('Internal Server Error');
    }
  }

  // Pulls a valid userId out of custom_data, or null. Malformed values are
  // logged and discarded rather than thrown: a non-UUID string would make the
  // Prisma UUID-column lookup throw, 500 the webhook, and trigger pointless
  // Paddle retries — fail safe to the email fallback instead.
  private static extractUserId(event: any, eventId: string | undefined): string | null {
    const customData = event.data?.custom_data;
    const parsed = customDataSchema.safeParse(customData);
    if (parsed.success) return parsed.data.userId;
    if (customData?.userId !== undefined) {
      console.warn(`[Webhook] custom_data.userId is malformed (${JSON.stringify(customData.userId)}) on event ${eventId || 'no-id'} — ignoring it.`);
    }
    return null;
  }

  // Maps a Paddle BILLING event to the source-agnostic entitlement status the
  // shared service understands, or null to ignore the event.
  //
  // This is the real Paddle Billing contract. The previous mapping waited on
  // 'subscription.expired', 'transaction.refunded', and a subscription status of
  // 'expired' — NONE of which Paddle Billing ever emits (cancellation fires
  // 'subscription.canceled'; refunds arrive as 'adjustment.created'; the status
  // enum is active/trialing/past_due/paused/canceled, never 'expired'). That made
  // the entire downgrade path dead. Corrected mapping:
  //
  // ACTIVE  : transaction.completed, subscription.created, and subscription.updated
  //           whose status is active / trialing / past_due. past_due deliberately
  //           stays ACTIVE so access is NOT yanked mid-dunning — if dunning
  //           ultimately fails Paddle cancels the sub, which downgrades via
  //           subscription.canceled below. trialing is ACTIVE so a future trial
  //           grants access even though no trial is configured today.
  // INACTIVE: subscription.canceled (the authoritative terminal downgrade — fires
  //           at period end for cancel-at-period-end, or immediately for an
  //           immediate cancel), and subscription.updated whose status is
  //           paused / canceled.
  // null    : everything else (ignored). adjustment.created / adjustment.updated
  //           (refunds, chargebacks) are handled separately in processEvent —
  //           see processAdjustment / classifyAdjustment.
  private static classifyPaddleStatus(eventName: string, data: any): SubscriptionStatus | null {
    if (eventName === 'transaction.completed' || eventName === 'subscription.created') {
      return 'ACTIVE';
    }
    if (eventName === 'subscription.canceled') {
      return 'INACTIVE';
    }
    if (eventName === 'subscription.updated') {
      return WebhookController.classifySubscriptionStatus(data?.status);
    }
    return null;
  }

  // Maps a Paddle Billing subscription status to entitlement. Statuses:
  // active, trialing, past_due (all keep access), paused, canceled (revoke).
  private static classifySubscriptionStatus(status: unknown): SubscriptionStatus {
    if (status === 'paused' || status === 'canceled') {
      return 'INACTIVE';
    }
    if (status === 'active' || status === 'trialing' || status === 'past_due') {
      return 'ACTIVE';
    }
    // Unknown/absent status: keep access (fail safe — 'subscription.canceled' is
    // the authoritative terminal downgrade, so a stray update can never strand a
    // paying customer on FREE). Log so an unexpected status is noticed.
    console.warn(`[Webhook] Unrecognized subscription.updated status '${status}' — defaulting to ACTIVE`);
    return 'ACTIVE';
  }

  // Paddle stamps every event with a top-level occurred_at. Used by the service's
  // out-of-order guard. Best-effort: undefined if absent/unparseable.
  private static extractOccurredAt(event: any): Date | undefined {
    const raw = event?.occurred_at;
    if (!raw) return undefined;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  // Adjustment visibility for manual review (no entitlement change on this path).
  // Logs ONLY non-secret business identifiers (ids, action, status) so the order
  // can be found in the Paddle dashboard — never any token or secret.
  private static logAdjustmentForReview(
    event: any,
    eventId: string | undefined,
    reason: string
  ): void {
    const d = event?.data || {};
    console.warn(
      `[Webhook][ALERT] Adjustment received — manual review required, NO entitlement change applied (${reason}). ` +
        `adjustment_id=${d.id || 'unknown'} action=${d.action || 'unknown'} status=${d.status || 'unknown'} ` +
        `type=${d.type || 'unspecified'} ` +
        `subscription_id=${d.subscription_id || 'none'} transaction_id=${d.transaction_id || 'none'} ` +
        `customer_id=${d.customer_id || 'none'} event_id=${eventId || 'no-id'}`
    );
    fireDiscordAlert('Adjustment received — manual review required (no entitlement change applied).', {
      adjustment_id: d.id || 'unknown',
      action: d.action || 'unknown',
      status: d.status || 'unknown',
      type: d.type || 'unspecified',
      reason,
      subscription_id: d.subscription_id || 'none',
      transaction_id: d.transaction_id || 'none',
      customer_id: d.customer_id || 'none',
      event_id: eventId || 'no-id',
    });
  }

  // Decides what an adjustment does to entitlement. Pure — no I/O, no DB — so the
  // policy is readable in one place and testable on its own.
  //
  // Paddle documents SEVEN adjustment actions. Mapping, and why:
  //
  //   chargeback ................. REVOKE. The bank has already pulled the money
  //       back and Paddle charges us a fee on top. It is the strongest adversarial
  //       signal a processor emits, and unlike a refund there is no approval step
  //       worth waiting for — the loss is already realised. Deliberately NOT gated
  //       on `type`: a chargeback means the customer went to their bank instead of
  //       to us, and that is true whether they disputed part of the charge or all
  //       of it. (Banks dispute the full charge in practice anyway.)
  //
  //   refund ..................... REVOKE only when status === 'approved' AND
  //       type === 'full'. Refunds on live accounts are created 'pending_approval'
  //       and Paddle may REJECT them; acting early would strip a customer who is
  //       still paying, and no event would ever restore them. The approval arrives
  //       on adjustment.updated. A PARTIAL refund must not strip full PRO — the
  //       customer still paid for most of the period.
  //
  //   credit ..................... log only. A credit reduces what is owed on a
  //       manually-collected transaction; it is not money returned and not a
  //       signal that the relationship ended.
  //
  //   chargeback_warning ......... log only. This is a NOTICE that a dispute may be
  //       coming — the money has not moved. Many warnings never become chargebacks.
  //       Revoking here would punish customers for their bank's early-warning feed.
  //       If it does become a chargeback, the real `chargeback` event revokes then.
  //
  //   chargeback_reverse ......... log only + alert. See the note below: this one
  //   chargeback_warning_reverse . log only. Reverses a warning we never acted on,
  //       so there is nothing to undo.
  //   credit_reverse ............. log only. Reverses a credit we never acted on.
  //
  //   anything else / absent ..... log only. Unknown vocabulary must never move
  //       entitlement in either direction.
  //
  // ON chargeback_reverse (Paddle wins the dispute back for us) — I considered
  // auto-RESTORING PRO here and chose not to, deliberately:
  //   (a) restoring is a GRANT, and every other grant in this system is being moved
  //       toward validation, not away from it. An adjustment event is a poor
  //       authority for handing out entitlement.
  //   (b) `planOverride` already restores access in one field and survives every
  //       billing event (derivePlan), so a human has a clean, instant remedy.
  //   (c) it is rare, and rare + automatic + granting is how silent bugs live for
  //       months.
  // KNOWN COST, accepted: a customer whose chargeback we successfully contest stays
  // on FREE until someone acts on the alert or their next renewal fires
  // transaction.completed. The alert is what makes that a minute, not a month.
  private static classifyAdjustment(data: any): { revoke: boolean; reason: string } {
    const action = data?.action;
    const status = data?.status;
    // Paddle defaults `type` to 'partial' when omitted, so mirror that default
    // rather than inventing our own — an absent type must never read as 'full'
    // and trigger a revoke.
    const type = data?.type ?? 'partial';

    if (action === 'chargeback') {
      return { revoke: true, reason: 'chargeback — funds already reversed by the bank' };
    }

    if (action === 'refund') {
      if (status !== 'approved') {
        return { revoke: false, reason: `refund not approved yet (status=${status ?? 'unknown'})` };
      }
      if (type !== 'full') {
        return { revoke: false, reason: `partial refund (type=${type}) does not revoke full entitlement` };
      }
      return { revoke: true, reason: 'approved full refund' };
    }

    return { revoke: false, reason: `action '${action ?? 'unknown'}' does not affect entitlement` };
  }

  // Handles adjustment.created and adjustment.updated: refunds, chargebacks and
  // their reversals.
  //
  // IDENTITY IS THE WHOLE TRAP HERE. Paddle's adjustment entity carries NO
  // custom_data, so `custom_data.userId` — the identifier every other branch in
  // this controller resolves on — is simply absent. Resolution goes
  // subscription_id -> Subscription.externalId via resolveBillingOrgByExternalId.
  // Never reach for extractUserId on this path: it would return null in production
  // on every single refund.
  private static async processAdjustment(event: any, eventId: string | undefined): Promise<void> {
    const decision = WebhookController.classifyAdjustment(event?.data);

    if (!decision.revoke) {
      WebhookController.logAdjustmentForReview(event, eventId, decision.reason);
      return;
    }

    // `subscription_id` is nullable: a refund against a one-off, non-subscription
    // transaction has none, and we have nothing to map it to. Fail SAFE — alert a
    // human rather than guess at an org and revoke the wrong customer.
    const subscriptionId = event?.data?.subscription_id || null;
    if (!subscriptionId) {
      WebhookController.logAdjustmentForReview(
        event,
        eventId,
        `${decision.reason}, but subscription_id is absent — cannot identify the org, NOT revoking`
      );
      return;
    }

    const resolved = await resolveBillingOrgByExternalId('PADDLE', subscriptionId);
    if (!resolved) {
      WebhookController.logAdjustmentForReview(
        event,
        eventId,
        `${decision.reason}, but subscription ${subscriptionId} matches no stored subscription — NOT revoking`
      );
      return;
    }

    // Reuses the SAME entitlement mechanism as subscription.canceled. In
    // particular planOverride is never touched by the service, so a manually
    // granted PRO/ENTERPRISE floor survives this revoke — that is the sanctioned
    // "refunded but keep access" escape hatch. To keep a refunded customer on PRO,
    // set Organization.planOverride = PRO; no billing event can lower it.
    const result = await applyEntitlementChange({
      organizationId: resolved.organizationId,
      source: 'PADDLE',
      status: 'INACTIVE',
      externalId: subscriptionId,
      eventOccurredAt: WebhookController.extractOccurredAt(event),
    });

    console.warn(
      `[Webhook][ALERT] PRO REVOKED by adjustment (${decision.reason}) — ` +
        `org ${resolved.organizationId} plan ${result.previousPlan} -> ${result.newPlan} ` +
        `(${result.applied ? 'applied' : 'stale event, plan reconciled only'}) ` +
        `adjustment_id=${event?.data?.id || 'unknown'} subscription_id=${subscriptionId} ` +
        `event_id=${eventId || 'no-id'}`
    );
    fireDiscordAlert('PRO REVOKED — refund/chargeback processed.', {
      reason: decision.reason,
      organization_id: resolved.organizationId,
      previous_plan: result.previousPlan,
      new_plan: result.newPlan,
      adjustment_id: event?.data?.id || 'unknown',
      subscription_id: subscriptionId,
      event_id: eventId || 'no-id',
    });
  }

  // Every Paddle price id named by a granting event.
  //
  // Verified against Paddle's official webhook docs: transaction.completed,
  // subscription.created and subscription.updated all carry data.items[].price.id
  // (on subscription.* the items array is documented REQUIRED), and
  // transaction.completed additionally carries data.details.line_items[].price_id.
  // Both paths are read, deduped, so a shape change on one does not blind us.
  private static extractPriceIds(data: any): string[] {
    const fromItems: string[] = Array.isArray(data?.items)
      ? data.items.map((i: any) => i?.price?.id).filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const fromLineItems: string[] = Array.isArray(data?.details?.line_items)
      ? data.details.line_items
          .map((li: any) => li?.price_id)
          .filter((id: unknown): id is string => typeof id === 'string')
      : [];
    return [...new Set([...fromItems, ...fromLineItems])];
  }

  /**
   * Decides whether an ACTIVE (upgrade) event is allowed to grant PRO.
   * NEVER consulted for a downgrade — see the call site.
   *
   * PART 1 — price allowlist: ALERT-ONLY, still grants.
   *
   *   A grant on a price we do not sell is worth knowing about instantly, but it
   *   is NOT worth denying a payer over. The false positive here is not an
   *   attacker — it is US: the moment someone adds a promo, lifetime or regional
   *   price in the Paddle dashboard and forgets this file, hard enforcement would
   *   reject a genuine customer who has already been charged, producing exactly
   *   the "customer paid but is still on FREE" incident the code elsewhere
   *   shouts about. That false positive fires precisely in the scenario this
   *   hardening exists for (a new price appearing), which makes enforcement
   *   self-defeating.
   *
   *   The upside of enforcing is also small today: with a clean catalog (two
   *   active recurring prices, no one-off, no legacy), substituting a price id
   *   client-side gets an attacker nothing they cannot already get by clicking
   *   the other button in the paywall.
   *
   *   So: name the unknown price loudly and let the customer in. To flip this to
   *   enforcement later, two things must be true — the alert has been quiet
   *   across real traffic (proving the extraction works on live payloads), and
   *   adding a price to Paddle is a checklisted change that includes this file.
   *
   * PART 2 — one-off transactions: ENFORCED.
   *
   *   transaction.completed granted ACTIVE unconditionally. But Subscription is
   *   one row per (org, source) and every downgrade path fires only on
   *   subscription.* events, so a transaction with NO subscription behind it sets
   *   PADDLE=ACTIVE with no lifecycle that can ever clear it. That is not "cheap
   *   PRO", it is PERMANENT, unrevokable PRO.
   *
   *   Enforced rather than alert-only because the asymmetry runs the other way:
   *     * A wrong DENIAL is loud, immediate and repairable in one field
   *       (Organization.planOverride, which derivePlan treats as a floor).
   *     * A wrong permanent GRANT is silent forever and has no remedy at all —
   *       no Paddle event we handle can undo it.
   *     * It cannot strand a subscription customer, because a real subscription
   *       purchase ALSO fires subscription.created, which grants independently of
   *       this gate. The redundancy makes enforcement safe here in a way it is
   *       not for Part 1.
   *
   *   The flow this WOULD block is a deliberate one-time sale (lifetime deal,
   *   credit pack) — which does not exist today and, when it does, needs a
   *   lifecycle design anyway, since nothing could ever revoke it. Blocking with
   *   a loud alert forces that conversation instead of silently creating an
   *   unrevokable entitlement. A manually-invoiced ENTERPRISE deal is likewise
   *   expected to go through planOverride, not through this path.
   */
  private static checkGrantEligibility(
    event: any,
    eventName: string,
    eventId: string | undefined
  ): { grant: boolean } {
    const data = event?.data;

    // ── PART 2 (enforced) ────────────────────────────────────────────────────
    if (eventName === 'transaction.completed' && !data?.subscription_id) {
      console.warn(
        `[Webhook][ALERT] Grant REFUSED — transaction.completed with no subscription_id ` +
          `(transaction ${data?.id || 'unknown'}, customer ${data?.customer_id || 'none'}, ` +
          `event ${eventId || 'no-id'}). A one-off transaction would set PRO with no ` +
          `subscription lifecycle to ever clear it — permanent, unrevokable access. ` +
          `If this was an intentional one-time sale, grant it deliberately via ` +
          `Organization.planOverride and design its expiry.`
      );
      fireDiscordAlert(
        'Grant REFUSED — one-off transaction.completed with no subscription. Granting would ' +
          'create PERMANENT unrevokable PRO. If intentional, use Organization.planOverride.',
        {
          event: eventName,
          transaction_id: data?.id || 'unknown',
          customer_id: data?.customer_id || 'none',
          event_id: eventId || 'no-id',
        }
      );
      return { grant: false };
    }

    // ── PART 1 (alert only — still grants) ───────────────────────────────────
    const priceIds = WebhookController.extractPriceIds(data);
    if (priceIds.length === 0) {
      // Not treated as an offence: an event family we do not yet know the shape
      // of must not silently change behaviour. Recorded so a real gap is visible.
      console.warn(
        `[Webhook] No price id found on granting ${eventName} (event ${eventId || 'no-id'}) — ` +
          `price allowlist not applied.`
      );
      return { grant: true };
    }

    const unknown = unknownPriceIds(priceIds);
    if (unknown.length > 0) {
      console.warn(
        `[Webhook][ALERT] Grant on an UNRECOGNISED price — access GRANTED, review required. ` +
          `unknown_price_ids=${unknown.join(',')} all_price_ids=${priceIds.join(',')} ` +
          `event=${eventName} customer=${data?.customer_id || 'none'} event_id=${eventId || 'no-id'}. ` +
          `If this price is legitimate, add it to src/config/paddlePrices.ts (and keep it in step ` +
          `with apps/frontend/src/lib/pricing.ts). If it is not, this is a checkout tampered with ` +
          `client-side and the subscription should be cancelled in Paddle.`
      );
      fireDiscordAlert(
        'Grant on an UNRECOGNISED Paddle price — access was GRANTED, review required. ' +
          'Add it to the catalog if legitimate; cancel the subscription in Paddle if not.',
        {
          event: eventName,
          unknown_price_ids: unknown.join(','),
          customer_id: data?.customer_id || 'none',
          subscription_id: data?.subscription_id || 'none',
          event_id: eventId || 'no-id',
        }
      );
    }

    return { grant: true };
  }

  // Thin mapper: classify -> resolve org -> apply via the shared service. All the
  // billing logic (per-source state, derivation, plan write) lives in the service;
  // all the event-shape/identity parsing lives here.
  private static async processEvent(event: any, eventName: string, eventId: string | undefined, email: string | undefined) {
      // Refunds and chargebacks arrive as adjustment.created; the approval decision
      // for a refund arrives later as adjustment.updated. Both are routed to the
      // adjustment policy, which decides revoke-vs-log per action/status/type.
      // A pending refund is still log-only (Paddle may reject it); an approved full
      // refund and any chargeback now revoke. See classifyAdjustment.
      if (eventName === 'adjustment.created' || eventName === 'adjustment.updated') {
        await WebhookController.processAdjustment(event, eventId);
        return;
      }

      const status = WebhookController.classifyPaddleStatus(eventName, event.data);
      if (!status) return;

      // GRANT-SIDE HARDENING. Deliberately gated on status === 'ACTIVE' so it can
      // only ever affect an UPGRADE.
      //
      // A downgrade must apply UNCONDITIONALLY — an unrecognised price, an absent
      // items array, a null subscription_id must NEVER stop entitlement being
      // removed. Getting this backwards would mean a cancelled subscription keeps
      // PRO forever, which is the failure PR A (#114) exists to prevent. This
      // early branch is the whole of the coupling: nothing below it changes, and
      // INACTIVE events never enter it.
      if (status === 'ACTIVE') {
        const gate = WebhookController.checkGrantEligibility(event, eventName, eventId);
        if (!gate.grant) return;
      }

      const userId = WebhookController.extractUserId(event, eventId);

      // Identity handle for the alert/log trail below.
      //
      // This string used to be `userId <uuid>, email <address>`, and it is
      // interpolated into the two Discord alerts below — so a paying customer's
      // email address left our boundary and landed in a third-party chat channel
      // with no retention control and no way to age out. Removed here (item #3
      // Half B, PR B1).
      //
      // Paddle's customer id is the replacement, and it is a STRICTLY BETTER
      // support handle than the email was: it resolves inside Paddle (our system
      // of record for billing) to the full customer — email, transactions,
      // subscriptions — while being an opaque vendor identifier on its own.
      const paddleCustomerId = event.data?.customer_id || 'none';
      const ref = `userId ${userId || 'none'}, paddleCustomer ${paddleCustomerId}`;

      const resolved = await resolveBillingOrg(userId, email);

      if (!resolved) {
        // Loud and grep-able: a paid checkout / billing change that did not map to
        // an org is a support incident, not a debug detail.
        //
        // The Discord context carries DISCRETE identifier fields (mirroring
        // logRefundForReview above) rather than the free-text `ref` blob: every
        // value is a bare id, which makes it obvious at a glance that no personal
        // data is in the payload, and keeps the alert greppable in Discord.
        //
        // The Paddle object this event is about. `subscription_id || id` is the
        // same expression `externalId` uses below, so the alert names exactly the
        // object the entitlement write would have targeted: a transaction id
        // (txn_…) for transaction.completed, a subscription id (sub_…) for
        // subscription.*. Paddle ids are type-prefixed, so one field is
        // unambiguous — and unlike `transaction_id`, it is never empty on the
        // event families that reach this branch.
        const paddleObjectId = event.data?.subscription_id || event.data?.id || 'none';

        if (status === 'ACTIVE') {
          console.warn(`[Webhook][ALERT] PRO upgrade NOT applied — no user/org matches ${ref} (event ${eventId || 'no-id'}, ${eventName}). Customer paid but is still on FREE.`);
          fireDiscordAlert('PRO upgrade NOT applied — customer paid but is still on FREE (no user/org match).', {
            event: eventName,
            user_id: userId || 'none',
            customer_id: paddleCustomerId,
            paddle_id: paddleObjectId,
            event_id: eventId || 'no-id',
          });
        } else {
          console.warn(`[Webhook][ALERT] Downgrade NOT applied — no user/org matches ${ref} (event ${eventId || 'no-id'}, ${eventName}).`);
          fireDiscordAlert('Downgrade NOT applied — no user/org match for a billing change.', {
            event: eventName,
            user_id: userId || 'none',
            customer_id: paddleCustomerId,
            paddle_id: paddleObjectId,
            event_id: eventId || 'no-id',
          });
        }
        return;
      }

      const externalId = event.data?.subscription_id || event.data?.id || undefined;
      const eventOccurredAt = WebhookController.extractOccurredAt(event);

      const result = await applyEntitlementChange({
        organizationId: resolved.organizationId,
        source: 'PADDLE',
        status,
        externalId,
        eventOccurredAt,
      });

      console.log(
        `[Webhook] ${eventName} -> Org ${resolved.organizationId} [PADDLE ${status}]: ` +
          `plan ${result.previousPlan} -> ${result.newPlan} ` +
          `(${result.applied ? 'applied' : 'stale event, plan reconciled only'}) (${ref})`
      );
  }
}
