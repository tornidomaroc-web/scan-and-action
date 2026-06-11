import { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../prismaClient';

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
      if (eventId) {
        try {
          await prisma.webhookEvent.create({
            data: { id: eventId, eventType: eventName || 'unknown' }
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
          await prisma.webhookEvent.delete({ where: { id: eventId } }).catch(() => {});
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

  // Primary match: custom_data.userId → User.id. Fallback: customer email
  // (absent from Paddle Billing payloads, but may serve manual or imported
  // events). Returns the matched user plus a human-readable ref for logs.
  private static async findUserForEvent(event: any, eventId: string | undefined, email: string | undefined) {
    const userId = WebhookController.extractUserId(event, eventId);
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { memberships: true },
      });
      if (user) return { user, ref: `userId ${userId}` };
      console.warn(`[Webhook] custom_data.userId ${userId} matches no user (event ${eventId || 'no-id'}) — trying email fallback.`);
    }

    if (email) {
      const user = await prisma.user.findUnique({
        where: { email },
        include: { memberships: true },
      });
      if (user) return { user, ref: `email ${email}` };
    }

    return { user: null, ref: `userId ${userId || 'none'}, email ${email || 'none'}` };
  }

  private static async processEvent(event: any, eventName: string, eventId: string | undefined, email: string | undefined) {
      const isUpgrade = eventName === 'transaction.completed' || eventName === 'subscription.created';
      const isDowngrade =
        eventName === 'subscription.expired' ||
        eventName === 'transaction.refunded' ||
        (eventName === 'subscription.updated' && event.data?.status === 'expired');

      if (!isUpgrade && !isDowngrade) return;

      const { user, ref } = await WebhookController.findUserForEvent(event, eventId, email);

      if (isUpgrade) {
        if (user && user.memberships.length > 0) {
          const orgId = user.memberships[0].organizationId;

          await prisma.organization.update({
            where: { id: orgId },
            data: { plan: 'PRO' },
          });

          console.log(`[Webhook] Successfully upgraded Org ${orgId} to PRO (${ref})`);
        } else {
          // Loud and grep-able: a paid checkout that did not result in an
          // upgrade is a support incident, not a debug detail.
          console.warn(`[Webhook][ALERT] PRO upgrade NOT applied — no user/org matches ${ref} (event ${eventId || 'no-id'}, ${eventName}). Customer paid but is still on FREE.`);
        }
      }

      if (isDowngrade) {
        if (user && user.memberships.length > 0) {
          const orgId = user.memberships[0].organizationId;

          await prisma.organization.update({
            where: { id: orgId },
            data: { plan: 'FREE' },
          });

          console.log(`[Webhook] DOWNGRADE: Org ${orgId} reverted to FREE (${ref}, event: ${eventName})`);
        } else {
          console.warn(`[Webhook][ALERT] Downgrade NOT applied — no user/org matches ${ref} (event ${eventId || 'no-id'}, ${eventName}).`);
        }
      }
  }
}
