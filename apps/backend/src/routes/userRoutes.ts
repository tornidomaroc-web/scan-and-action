import { Router } from 'express';
import { prisma } from '../prismaClient';

const router = Router();

/**
 * GET /api/user/me
 * Returns the current authenticated user's profile and organization context.
 * Used by frontend AuthContext to sync plan status.
 */
router.get('/me', async (req, res, next) => {
  try {
    const { id, email, organizationId } = req.user;

    // Fetch the organization to get the current plan (PRO/FREE)
    const org = await prisma.organization.findUnique({
      where: { id: organizationId as string },
      select: { plan: true }
    });

    return res.json({
      id,
      email,
      organizationId,
      plan: org?.plan || 'FREE'
    });
  } catch (error) {
    console.error('[UserRoutes] Failed to fetch profile:', error);
    next(error);
  }
});

export default router;
