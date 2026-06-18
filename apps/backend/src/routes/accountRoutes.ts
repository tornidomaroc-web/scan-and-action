import { Router } from 'express';
import { AccountController } from '../controllers/accountController';
import { accountDeletionLimiter } from '../middleware/rateLimits';

const router = Router();

/**
 * DELETE /api/account
 * Deletes the authenticated user's account and data (see AccountController).
 * Mounted under the global authMiddleware, so a valid session is required.
 */
router.delete('/', accountDeletionLimiter, AccountController.deleteAccount);

export default router;
