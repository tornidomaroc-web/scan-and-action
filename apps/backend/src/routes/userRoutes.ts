import { Router } from 'express';
import { prisma } from '../prismaClient';
import { effectivePlan } from '../services/entitlement/clientPlatform';

const router = Router();

/**
 * GET /api/user/me
 * Returns the current authenticated user's profile and organization context.
 *
 * `plan` is the plan this request is served under: the iOS app reads FREE
 * whatever is stored (services/entitlement/clientPlatform.ts).
 *
 * `hasActiveBilling` says whether the workspace has a billing source that is
 * ACTIVE. The delete-account sheet reads it to decide whether to warn that
 * deleting the account does not cancel that billing. It is a statement about
 * billing, not an entitlement, so it is the same on every platform.
 */
router.get('/me', async (req, res, next) => {
  try {
    const { id, email, organizationId } = req.user;

    const org = await prisma.organization.findUnique({
      where: { id: organizationId as string },
      select: { plan: true, subscriptions: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 } }
    });

    return res.json({
      id,
      email,
      organizationId,
      plan: effectivePlan(org?.plan, req),
      hasActiveBilling: (org?.subscriptions?.length ?? 0) > 0
    });
  } catch (error) {
    console.error('[UserRoutes] Failed to fetch profile:', error);
    next(error);
  }
});

export default router;
