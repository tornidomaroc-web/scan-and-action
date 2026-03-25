import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../prismaClient';

export class WebhookController {
  public static async handleLemonSqueezy(req: Request, res: Response) {
    console.log('[Webhook HEARTBEAT] Request received at', new Date().toISOString());
    try {
      const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || '';

      const rawBody = req.body as Buffer;
      const signature = req.get('X-Signature') || '';

      console.log('[Webhook DEBUG]', {
        secretLength: secret.length,
        signatureLength: signature.length,
        signatureStart: signature.slice(0, 12),
      });

      if (!secret) {
        console.warn('[Webhook] Missing LEMON_SQUEEZY_WEBHOOK_SECRET');
        return res.status(500).send('Webhook secret not configured');
      }

      if (!Buffer.isBuffer(rawBody)) {
        console.warn('[Webhook] Raw body is not a Buffer');
        return res.status(400).send('Invalid body');
      }

      const hmac = crypto.createHmac('sha256', secret);
      const digest = hmac.update(rawBody).digest('hex');

      const expected = Buffer.from(digest, 'hex');
      const received = Buffer.from(signature, 'hex');

      if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
        console.warn('[Webhook] Invalid signature received');
        return res.status(401).send('Invalid signature');
      }

      const event = JSON.parse(rawBody.toString('utf8'));
      const eventName = event.meta?.event_name;
      const email = event.data?.attributes?.user_email;

      console.log(`[Webhook] Received ${eventName} for ${email}`);

      if (eventName === 'order_created' || eventName === 'subscription_created') {
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
            console.warn(`[Webhook] User or organization not found for email: ${email}`);
          }
        }
      }

      return res.status(200).send('OK');
    } catch (error: any) {
      console.error('[Webhook] Error processing Lemon Squeezy event:', error.message || error);
      return res.status(500).send('Internal Server Error');
    }
  }
}
