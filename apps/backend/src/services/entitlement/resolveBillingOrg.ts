import { MemberRole } from '@prisma/client';
import { prisma } from '../../prismaClient';

// Role precedence for the deterministic billing-org pick. Higher wins.
const ROLE_RANK: Record<MemberRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
  VIEWER: 0,
};

export interface ResolvedBillingOrg {
  organizationId: string;
}

interface MembershipLike {
  organizationId: string;
  role: MemberRole;
  joinedAt: Date;
}

/**
 * Deterministic membership selection (replaces the old nondeterministic
 * memberships[0]): highest role (OWNER > ADMIN > MEMBER > VIEWER), tie-break
 * earliest joinedAt, tie-break lowest organizationId. Pure — exported for tests.
 */
export function pickBillingMembership<T extends MembershipLike>(memberships: ReadonlyArray<T>): T {
  return [...memberships].sort((a, b) => {
    const byRole = ROLE_RANK[b.role] - ROLE_RANK[a.role];
    if (byRole !== 0) return byRole;
    const byJoined = a.joinedAt.getTime() - b.joinedAt.getTime();
    if (byJoined !== 0) return byJoined;
    if (a.organizationId < b.organizationId) return -1;
    if (a.organizationId > b.organizationId) return 1;
    return 0;
  })[0];
}

/**
 * Shared, billing-source-agnostic resolution of "which organization does this
 * payer's entitlement belong to?". Used by every billing webhook (Paddle now,
 * RevenueCat later) so resolution is identical across sources.
 *
 * Primary match: userId → User.id (the Supabase UUID that both Paddle
 * custom_data.userId and RevenueCat app_user_id carry). Fallback: email.
 *
 * Returns null when the user or any membership cannot be resolved; the caller
 * owns the "customer paid but is still FREE" alert in that case. Event-shape
 * parsing (custom_data, signatures, etc.) stays in the controllers — this
 * function only takes already-extracted identifiers.
 */
export async function resolveBillingOrg(
  userId: string | null | undefined,
  emailFallback?: string | null
): Promise<ResolvedBillingOrg | null> {
  let user:
    | { id: string; memberships: MembershipLike[] }
    | null = null;

  if (userId) {
    user = await prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: true },
    });
    if (!user) {
      console.warn(
        `[resolveBillingOrg] userId ${userId} matches no user — trying email fallback.`
      );
    }
  }

  if (!user && emailFallback) {
    user = await prisma.user.findUnique({
      where: { email: emailFallback },
      include: { memberships: true },
    });
  }

  if (!user || user.memberships.length === 0) {
    return null;
  }

  const chosen = pickBillingMembership(user.memberships);

  if (user.memberships.length > 1) {
    // Loud and grep-able: a payer with >1 membership is ambiguous. We pick
    // deterministically, but a human should confirm it is the intended org.
    console.warn(
      `[resolveBillingOrg][ALERT] Ambiguous billing org for userId ${user.id}: ` +
        `${user.memberships.length} memberships; picked org ${chosen.organizationId} ` +
        `by (role, joinedAt, organizationId). Verify this is the intended paying org.`
    );
  }

  return { organizationId: chosen.organizationId };
}
