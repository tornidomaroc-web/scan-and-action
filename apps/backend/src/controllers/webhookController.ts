import { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { SubscriptionStatus } from '@prisma/client';
import { prisma } from '../prismaClient';
import { resolveBillingOrg } from '../services/entitlement/resolveBillingOrg';
import { applyEntitlementChange } from '../services/entitlement/applyEntitlementChange';

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

      console.log(`[Webhook] Received ${eventName} (${eventId || 'no-id'}) for ${email || event.data?.custom_data?.userId || 'unidentified user'}`);

      // From here on, a thrown error must release the idempotency claim:
      // otherwise a transient failure marks the event "processed" and
      // Paddle's retry gets skipped — losing a paid upgrade.
      try {
        await WebhookController.processEvent(event, eventName, eventId, email);
      } catch (processingError) {
        if (eventId) {
          await prisma.webhookEvent.delete({ where: { id: webhookEventKey! } }).catch(() => {});
        }
        throw processingError;
      }

      return res.status(200).send('OK');
    } catch (error: any) {
      console.error('[Webhook] Error processing Paddle event:', error.message || error);
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
  // null    : everything else (ignored). adjustment.created (refunds) is handled
  //           separately in processEvent as log-only — see logRefundForReview.
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

  // Refund visibility for manual review (v1 policy: log-only, no entitlement
  // change). Logs ONLY non-secret business identifiers (ids, action, status) so
  // the order can be found in the Paddle dashboard — never any token or secret.
  //
  // TODO(refund-auto-revoke): a future follow-up MAY auto-revoke on refund, but
  // only when strictly gated on action === 'refund' AND status === 'approved' AND
  // a full-amount refund — never on 'pending_approval' and never a partial refund.
  private static logRefundForReview(event: any, eventId: string | undefined): void {
    const d = event?.data || {};
    console.warn(
      `[Webhook][ALERT] Refund adjustment received — manual review required, NO entitlement change applied. ` +
        `adjustment_id=${d.id || 'unknown'} action=${d.action || 'unknown'} status=${d.status || 'unknown'} ` +
        `subscription_id=${d.subscription_id || 'none'} transaction_id=${d.transaction_id || 'none'} ` +
        `customer_id=${d.customer_id || 'none'} event_id=${eventId || 'no-id'}`
    );
  }

  // Thin mapper: classify -> resolve org -> apply via the shared service. All the
  // billing logic (per-source state, derivation, plan write) lives in the service;
  // all the event-shape/identity parsing lives here.
  private static async processEvent(event: any, eventName: string, eventId: string | undefined, email: string | undefined) {
      // Refunds arrive as adjustment.created (action 'refund'), often as status
      // 'pending_approval' until Paddle reviews. v1 deliberately does NOT
      // auto-downgrade on a refund: a pending refund may be rejected, and a
      // partial/goodwill refund must not revoke an otherwise-active subscription.
      // subscription.canceled remains the authoritative entitlement downgrade.
      // We surface refunds loudly for manual review instead.
      if (eventName === 'adjustment.created') {
        WebhookController.logRefundForReview(event, eventId);
        return;
      }

      const status = WebhookController.classifyPaddleStatus(eventName, event.data);
      if (!status) return;

      const userId = WebhookController.extractUserId(event, eventId);
      const ref = `userId ${userId || 'none'}, email ${email || 'none'}`;

      const resolved = await resolveBillingOrg(userId, email);

      if (!resolved) {
        // Loud and grep-able: a paid checkout / billing change that did not map to
        // an org is a support incident, not a debug detail.
        if (status === 'ACTIVE') {
          console.warn(`[Webhook][ALERT] PRO upgrade NOT applied — no user/org matches ${ref} (event ${eventId || 'no-id'}, ${eventName}). Customer paid but is still on FREE.`);
        } else {
          console.warn(`[Webhook][ALERT] Downgrade NOT applied — no user/org matches ${ref} (event ${eventId || 'no-id'}, ${eventName}).`);
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
