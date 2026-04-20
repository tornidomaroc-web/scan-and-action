import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../prismaClient';

export class WebhookController {
  public static async handlePaddle(req: Request, res: Response) {
    console.log('[Webhook HEARTBEAT] Request received at', new Date().toISOString());
    try {
      const secret = process.env.PADDLE_WEBHOOK_SECRET || '';

      const rawBody = req.body as Buffer;
      const signatureHeader = req.get('paddle-signature') || '';
      
      const tsPart = signatureHeader.split(';').find(p => p.startsWith('ts='));
      const h1Part = signatureHeader.split(';').find(p => p.startsWith('h1='));
      
      const timestamp = tsPart?.split('=')[1];
      const signature = h1Part?.split('=')[1];

      console.log('[Webhook DEBUG]', {
        secretLength: secret.length,
        hasSignature: !!signature,
        timestamp
      });

      if (!secret) {
        console.warn('[Webhook] Missing PADDLE_WEBHOOK_SECRET');
        return res.status(500).send('Webhook secret not configured');
      }

      if (!Buffer.isBuffer(rawBody)) {
        console.warn('[Webhook] Raw body is not a Buffer');
        return res.status(400).send('Invalid body');
      }

      const hmac = crypto.createHmac('sha256', secret);
      const digest = hmac.update(`${timestamp}:${rawBody}`).digest('hex');

      if (digest !== signature) {
        console.warn('[Webhook] Invalid signature received');
        return res.status(401).send('Invalid signature');
      }

      const event = JSON.parse(rawBody.toString('utf8'));
      const eventName = event.event_type;
      const email = event.data?.customer?.email || event.data?.email;

      console.log(`[Webhook] Received ${eventName} for ${email}`);

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
            console.warn(`[Webhook] User or organization not found for email: ${email}`);
          }
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
            console.warn(`[Webhook] Downgrade skipped: No organization found for ${email}`);
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
