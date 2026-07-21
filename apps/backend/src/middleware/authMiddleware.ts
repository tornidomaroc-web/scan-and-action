import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../prismaClient';
import { sendWelcomeEmailOnce } from '../services/email/welcomeEmail';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Bounded retries for the just-in-time provisioning paths below. Each retry
// only happens after a unique-constraint (P2002) loss, i.e. another concurrent
// request from the SAME user already created the contended row — so a couple of
// attempts is always enough in practice; the cap exists purely to guarantee we
// can never spin forever.
const MAX_PROVISION_ATTEMPTS = 3;

// True for a Prisma unique-constraint violation. We key off `.code` (rather than
// `instanceof PrismaClientKnownRequestError`) so the check holds across Prisma
// internals and is trivially testable.
const isUniqueConstraintError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

// Ensure the User row exists, returning it with memberships loaded.
//
// `prisma.user.upsert` is find-then-write and not atomic under concurrency: two
// near-simultaneous first-time requests from the same user can both miss the row
// and both attempt the INSERT, so the loser throws P2002 on User.id / User.email.
// On that loss the row now exists, so simply retrying the upsert takes the UPDATE
// path and succeeds. Non-P2002 errors propagate untouched.
async function ensureUser(userId: string, email: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_PROVISION_ATTEMPTS; attempt++) {
    try {
      return await prisma.user.upsert({
        where: { id: userId },
        update: { email },
        create: {
          id: userId,
          email,
          preferredLanguage: 'en',
        },
        include: { memberships: { include: { organization: true } } },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      lastError = error;
      // Lost the insert race; loop and retry — the row exists now.
    }
  }
  throw lastError;
}

// Ensure the user has a default Organization (+ OWNER membership), returning the
// organizationId and whether WE created it.
//
// The org + its OWNER membership are created together in a single transaction so
// they are atomic (never an org without its owner). The slug is deterministic
// (`workspace-<uuid8>`), so two concurrent first-time requests generate the SAME
// slug: the first commits, the loser hits P2002 on Organization.slug. On that
// loss the winner has already created the org + membership, so we re-fetch and
// continue with the winner's org (`created: false`). If the winner's transaction
// isn't visible yet (rare), we retry a bounded number of times, then fail with a
// real error rather than a misleading 401.
async function ensureOrganization(
  userId: string
): Promise<{ organizationId: string; created: boolean }> {
  for (let attempt = 0; attempt < MAX_PROVISION_ATTEMPTS; attempt++) {
    try {
      const newOrg = await prisma.$transaction((tx) =>
        tx.organization.create({
          data: {
            name: 'My Workspace',
            slug: `workspace-${userId.slice(0, 8)}`,
            members: {
              create: {
                userId,
                role: 'OWNER',
              },
            },
          },
        })
      );
      return { organizationId: newOrg.id, created: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      // Lost the provisioning race: the winner already created the org + OWNER
      // membership for this user. Re-fetch and continue with the winner's org.
      const memberships = await prisma.membership.findMany({
        where: { userId },
        orderBy: { joinedAt: 'asc' },
        take: 1,
      });
      if (memberships.length > 0) {
        return { organizationId: memberships[0].organizationId, created: false };
      }
      // Winner's transaction not yet visible — loop and retry.
    }
  }
  throw new Error(
    `Failed to provision an organization for user ${userId} after ${MAX_PROVISION_ATTEMPTS} attempts`
  );
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed access token' });
  }

  const token = authHeader.split(' ')[1];

  // Genuine authentication failures (invalid/expired token) are handled inline
  // with an explicit 401 below. Everything inside this try that THROWS is an
  // unexpected/transient fault (DB blip, Prisma timeout, an unrecovered P2002,
  // etc.) — those are forwarded to the global errorHandler via next(error) so
  // they surface honestly (e.g. P2002 → 409, otherwise → 500), instead of
  // masquerading as "Invalid or expired token".
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[AuthMiddleware] Supabase Auth Error:', authError?.message || 'User not found');
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }

    const userId = user.id;
    const email = user.email || '';

    // SaaS Flow: Ensure the user exists and has at least one Organization.
    const dbUser = await ensureUser(userId, email);

    let organizationId: string;

    if (dbUser.memberships.length === 0) {
      // userId, not email. This line means "a first-time user is being
      // provisioned"; the Supabase UUID identifies them for every downstream
      // lookup and is already the key ensureUser/ensureOrganization work from.
      // The email added nothing the UUID does not, and it put an address in
      // stdout on every genuine first login.
      console.log(`[AuthMiddleware] Provisioning default organization for user: ${userId}`);
      const { organizationId: orgId, created } = await ensureOrganization(userId);
      organizationId = orgId;

      // Best-effort, one-time welcome email. Reached ONLY when WE actually
      // created the org on genuine first-time provisioning — never on the race
      // recovery path (created === false), where the winner provisions and is
      // the one that sends. Pre-existing users always have a membership and
      // never enter this branch, so they are never emailed. The helper awaits
      // only its atomic claim (a fast UPDATE) and fires the actual send
      // detached; it never throws, so the auth response below is unaffected by
      // any email outcome (sent/skipped/failed).
      if (created) {
        await sendWelcomeEmailOnce(userId, email);
      }
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
    console.error('[AuthMiddleware] Unexpected error during authentication/provisioning:', error?.message || error);
    return next(error);
  }
};
