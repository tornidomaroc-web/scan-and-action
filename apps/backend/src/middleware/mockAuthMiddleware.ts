import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prismaClient';


// In-memory cache to skip DB hits on subsequent requests in the same dev session
const verifiedUsers = new Set<string>();

export const mockAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Extract user from header (simulating auth token resolution)
    const headerVal = req.headers['x-user-id'];
    const userId = (Array.isArray(headerVal) ? headerVal[0] : headerVal) || 'sys-demo-user';

    // 2. Guarantee user exists in the database before persistence operations
    if (!verifiedUsers.has(userId)) {
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          email: `${userId}@mock.local`,
          preferredLanguage: 'en'
        }
      });
      verifiedUsers.add(userId);
    }

    // 3. Mount structured user identity onto the request object
    (req as any).user = { id: userId };
    
    next();
  } catch (error) {
    console.error('[AuthMiddleware] Identity verification failed:', error);
    res.status(500).json({ error: 'Internal Server Error during Identity Verification' });
  }
};
