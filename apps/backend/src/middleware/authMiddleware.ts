import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../prismaClient';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  // Development Bypass for internal automated testing
  if (authHeader === 'Bearer test-token' || req.headers['x-bypass-auth'] === 'test-secret-123') {
     const testUserId = '769f583b-3197-4560-84a1-0675713437e2';
     const dbUser = await prisma.user.upsert({
       where: { id: testUserId },
       update: {},
       create: { id: testUserId, email: 'sys-demo-user@mock.local', preferredLanguage: 'en' },
       include: { memberships: true }
     });

     let organizationId: string;
     if (dbUser.memberships.length === 0) {
        const newOrg = await prisma.organization.create({
          data: {
            name: 'Demo Workspace',
            slug: `demo-${testUserId.slice(0, 8)}`,
            members: { create: { userId: testUserId, role: 'OWNER' } }
          }
        });
        organizationId = newOrg.id;
     } else {
        organizationId = dbUser.memberships[0].organizationId;
     }

     req.user = { id: testUserId, email: 'sys-demo-user@mock.local', organizationId };
     return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed access token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('[AuthMiddleware] Supabase Auth Error:', authError?.message || 'User not found');
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }

    const userId = user.id;
    const email = user.email || '';

    // SaaS Flow: Ensure the user exists and has at least one Organization.
    const dbUser = await prisma.user.upsert({
      where: { id: userId },
      update: { email },
      create: { 
        id: userId, 
        email,
        preferredLanguage: 'en',
      },
      include: { memberships: { include: { organization: true } } }
    });

    let organizationId: string;

    if (dbUser.memberships.length === 0) {
      console.log(`[AuthMiddleware] Provisioning default organization for user: ${email}`);
      const newOrg = await prisma.organization.create({
        data: {
          name: 'My Workspace',
          slug: `workspace-${userId.slice(0, 8)}`,
          members: {
            create: {
              userId: userId,
              role: 'OWNER'
            }
          }
        }
      });
      organizationId = newOrg.id;
    } else {
      // For MVP, just use the first organization found.
      organizationId = dbUser.memberships[0].organizationId;
    }

    req.user = {
      id: userId,
      email,
      organizationId
    };

    next();
  } catch (error: any) {
    console.error('[AuthMiddleware] Unexpected auth error:', error.message || error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};