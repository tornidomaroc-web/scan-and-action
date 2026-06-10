import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../prismaClient';

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

      console.log(`[Webhook] Received ${eventName} (${eventId || 'no-id'}) for ${email}`);

      if (eventName === 'transaction.completed' || eventName === 'subscription.created') {
        if (email) {
          const user = await prisma.user.findUnique({
            where: { email },
            include: { memberships: true },
          });

          if (user && user.memberships.length > 0) {
            const orgId = user.memberships[0].organizationId;

            await prisma.organization.update({
              where: { id: orgId },
              data: { plan: 'PRO' },
            });

            console.log(`[Webhook] Successfully upgraded Org ${orgId} to PRO for user ${email}`);
          } else {
            // Loud and grep-able: a paid checkout that did not result in an
            // upgrade is a support incident, not a debug detail.
            console.warn(`[Webhook][ALERT] PRO upgrade NOT applied — no user/org matches checkout email "${email}" (event ${eventId || 'no-id'}). Customer paid but is still on FREE.`);
          }
        } else {
          console.warn(`[Webhook][ALERT] ${eventName} carried no customer email (event ${eventId || 'no-id'}) — upgrade cannot be applied.`);
        }
      }

      // -----------------------------------------------------------------------
      // Paddle Downgrade Logic: subscription.expired or transaction.refunded
      // -----------------------------------------------------------------------
      const isExplicitExpired = eventName === 'subscription.expired' || eventName === 'transaction.refunded';
      const isStatusExpiredUpdate = eventName === 'subscription.updated' && event.data?.status === 'expired';

      if (isExplicitExpired || isStatusExpiredUpdate) {
        if (email) {
          const user = await prisma.user.findUnique({
            where: { email },
            include: { memberships: true },
          });

          if (user && user.memberships.length > 0) {
            const orgId = user.memberships[0].organizationId;

            await prisma.organization.update({
              where: { id: orgId },
              data: { plan: 'FREE' },
            });

            console.log(`[Webhook] DOWNGRADE: Org ${orgId} reverted to FREE (ref: ${email}, event: ${eventName})`);
          } else {
            console.warn(`[Webhook][ALERT] Downgrade NOT applied — no user/org matches email "${email}" (event ${eventId || 'no-id'}, ${eventName}).`);
          }
        }
      }

      return res.status(200).send('OK');
    } catch (error: any) {
      console.error('[Webhook] Error processing Paddle event:', error.message || error);
      return res.status(500).send('Internal Server Error');
    }
  }
}
