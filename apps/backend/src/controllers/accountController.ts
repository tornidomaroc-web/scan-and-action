import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prismaClient';
import { deleteAuthUser, deleteStorageObjects, hasAppleIdentity } from '../services/accountDeletionService';
import { invalidateUser } from '../middleware/authContextCache';
import { revokeAppleAuthorization, appleRevocationConfigured } from '../services/appleRevocationService';

/**
 * What happened to the user's Sign in with Apple authorization, reported in the
 * response so the app can tell the person when Apple still lists us.
 *
 *   revoked         the fresh code was exchanged and the tokens revoked
 *   failed          Apple refused or was unreachable; the account is deleted anyway
 *   skipped         the user has an Apple identity and the client sent no code
 *                   (a surface with no Apple sheet: web, Android)
 *   not_applicable  the user never signed in with Apple
 *   not_configured  a code arrived and the four APPLE_* variables are absent
 */
export type AppleRevocationStatus = 'revoked' | 'failed' | 'skipped' | 'not_applicable' | 'not_configured';

/**
 * Sign in with Apple revocation at deletion. Apple's "Offering account deletion
 * in your app" page: an app that offers Sign in with Apple "should use the Sign
 * in with Apple REST API to revoke user tokens". The app never kept a token, so
 * the iOS client asks for one more Apple sheet and sends the code here; the
 * service exchanges it and revokes. The code is single-use and lives five
 * minutes, so this runs once every refusal (confirmation, shared workspace,
 * identity conflict) is behind us and before anything is destroyed.
 *
 * RULING (2026-09-30): a failed or skipped revocation never blocks the
 * deletion. The person's right to delete (Apple 5.1.1(v), Play's data-deletion
 * policy) outranks the tidiness of Apple's own list, which the person can
 * clean in Settings > Apple Account > Sign in with Apple. A surface with no
 * Apple sheet (web, Android) sends no code and is recorded as skipped: Apple
 * sign-in exists on iOS only here, by the board's decision, so no code can
 * exist there, and refusing would deny deletion to a person without their
 * iPhone. Every outcome but not_applicable (no Apple identity, nothing to
 * say) is one log line with a reason word and a status, never the code or a
 * token.
 */
async function settleAppleRevocation(userId: string, body: unknown): Promise<AppleRevocationStatus> {
  const raw = (body as { appleAuthorizationCode?: unknown } | undefined)?.appleAuthorizationCode;
  const code = typeof raw === 'string' ? raw.trim() : '';
  let linked: boolean;
  try {
    linked = await hasAppleIdentity(userId);
  } catch (err) {
    // An unknown is logged as its own thing, never folded into "no Apple".
    console.error(`[AccountController] apple_revocation identity_lookup_failed user=${userId}: ${err instanceof Error ? err.message : err}`);
    linked = code !== '';
  }
  if (!code) {
    if (!linked) return 'not_applicable';
    console.error(`[AccountController] apple_revocation skipped user=${userId}: Apple identity present, no code from the client`);
    return 'skipped';
  }
  if (!appleRevocationConfigured()) {
    console.error(`[AccountController] apple_revocation not_configured user=${userId}: a code arrived and APPLE_* is not set`);
    return 'not_configured';
  }
  const outcome = await revokeAppleAuthorization(code);
  if (outcome.ok) {
    // Success is logged too: before this line a revoked outcome left nothing,
    // so the log could only show it by the absence of a failure (2026-09-30,
    // the first real revocation). console.log, since nothing went wrong.
    console.log(`[AccountController] apple_revocation revoked user=${userId}`);
    return 'revoked';
  }
  const status = 'status' in outcome ? ` status=${outcome.status}` : '';
  const word = 'error' in outcome && outcome.error ? ` error=${outcome.error}` : '';
  console.error(`[AccountController] apple_revocation failed user=${userId} reason=${outcome.reason}${status}${word}`);
  return 'failed';
}

/**
 * DELETE /api/account
 *
 * Permanently deletes the authenticated user's account and associated data.
 * Required by both Google Play and Apple for apps with accounts.
 *
 * Safety properties:
 *  - The target is taken ONLY from req.user (the validated bearer token) — never
 *    from the body/params — so a request can only ever delete its own account.
 *  - Auth is bearer-token, not cookie-based, so CSRF is not a practical vector;
 *    we additionally require an explicit confirmation (the caller must echo their
 *    own email) to guard against accidental/double-tap deletion.
 *  - Idempotent: re-running after a partial or complete deletion converges to the
 *    same end state (deleteMany is a no-op on missing rows; auth/storage deletes
 *    ignore "already gone").
 *
 * Deletion rule (agreed): the current product only ever creates solo orgs (one
 * OWNER, no invite flow). So:
 *  - Solo org  -> delete the org and ALL its data (documents, storage files,
 *    entities, reports — via DB cascade + explicit storage cleanup), the user's
 *    personal query logs, the User row, and the Supabase auth identity.
 *  - Multi-member org -> FAIL SAFE with 409. We never delete data that belongs to
 *    other members, and never leave an org without an owner. Real ownership
 *    transfer is deferred until team features actually exist.
 */
export class AccountController {
  static async deleteAccount(req: Request, res: Response, next: NextFunction) {
    const userId = req.user.id;
    const email = (req.user.email || '').trim().toLowerCase();
    const confirm = (req.body?.confirm ?? '').toString().trim().toLowerCase();

    // Explicit confirmation: the caller must type their own email exactly.
    if (!confirm || confirm !== email) {
      return res.status(400).json({
        error: 'CONFIRMATION_REQUIRED',
        message: 'Type your account email exactly to confirm deletion.',
      });
    }

    try {
      // Load the user with each org's total member count so we can apply the rule.
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          memberships: {
            include: {
              organization: { include: { _count: { select: { members: true } } } },
            },
          },
        },
      });

      // Idempotency: DB user already gone (e.g. retried call). Make sure the auth
      // identity is also gone, then report success.
      //
      // DEFENCE IN DEPTH — `!dbUser` means two different things and they must not
      // be reported identically. "Already deleted" is one. "Your address is held
      // by a row under a DIFFERENT id" is the other, and treating that as success
      // would delete the caller's auth identity, leave the other row and all of
      // its organization, documents and storage objects intact, keep the address
      // locked so the next signup fails the same way — and return `ok: true`.
      //
      // The classifier in authMiddleware normally stops that request before it
      // reaches this controller, so this guard should be unreachable. It is here
      // because "should be unreachable" is exactly the assumption that decays:
      // any future change that makes provisioning recover or adopt would route
      // straight into the branch below and silently report a deletion that did
      // not happen. Case-insensitive because `User.email` is stored as Supabase
      // supplied it, while `email` above is normalised for the confirm compare.
      if (!dbUser) {
        const holder = await prisma.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
          select: { id: true },
        });
        if (holder && holder.id !== userId) {
          console.error(
            `[AccountController] IDENTITY_EMAIL_CONFLICT: caller ${userId} has no User row, ` +
              `but this address is held by ${holder.id}. Refusing rather than reporting a ` +
              `deletion that would not happen.`
          );
          return res.status(409).json({
            error: 'IDENTITY_EMAIL_CONFLICT',
            message:
              'This account cannot be deleted automatically because its data belongs to a different identity. Contact support.',
          });
        }
        // The auth identity may still exist here, and with it Apple's
        // authorization: revoke before it goes, like the main path.
        const appleRevocation = await settleAppleRevocation(userId, req.body);
        await deleteAuthUser(userId);
      // A cached context for this user would outlive the rows for up to a
      // minute; the deletion is the one event that must not wait that long.
      invalidateUser(userId);
        return res.status(200).json({ ok: true, alreadyDeleted: true, appleRevocation });
      }

      // Fail-safe: refuse if the user shares any org with other members.
      const sharedOrg = dbUser.memberships.find(
        (m) => m.organization._count.members > 1
      );
      if (sharedOrg) {
        return res.status(409).json({
          error: 'SHARED_WORKSPACE',
          message:
            'You belong to a workspace with other members. Remove the other members or contact support before deleting your account.',
        });
      }

      // Solo path. These orgs are exclusively this user's, safe to delete whole.
      const orgIds = dbUser.memberships.map((m) => m.organizationId);

      // 0) Apple first: every refusal is behind us, nothing is destroyed yet.
      const appleRevocation = await settleAppleRevocation(userId, req.body);

      // Collect storage paths BEFORE the rows are deleted.
      const docs = orgIds.length
        ? await prisma.document.findMany({
            where: { organizationId: { in: orgIds } },
            select: { fileUrl: true },
          })
        : [];
      const storagePaths = docs.map((d) => d.fileUrl).filter(Boolean);

      // 1) Storage first. If this fails we abort BEFORE touching the DB, so the
      //    account stays intact and the user can retry — nothing is left in a
      //    half-deleted state where files are orphaned but the account is gone.
      if (storagePaths.length) {
        await deleteStorageObjects(storagePaths);
      }

      // 2) DB rows, in one transaction. Deleting the Organization cascades to its
      //    memberships, documents (+facts/+documentEntities), entities, saved and
      //    generated reports. deleteMany keeps every step idempotent.
      //
      //    Two foreign keys are ON DELETE RESTRICT and would block a naive cascade,
      //    so we clear their referrers explicitly first — order-independence must
      //    not rely on undocumented Postgres cascade-trigger ordering:
      //      a) QueryLog.userId -> User is RESTRICT (schema.prisma:195), and
      //         QueryLog has no org link, so delete the user's logs up front.
      //      b) DocumentEntity.entityId -> Entity is RESTRICT (schema.prisma:185).
      //         A single `DELETE FROM Organization` only succeeds if Postgres
      //         happens to fire the Document cascade (which clears DocumentEntity
      //         via documentId) BEFORE the Entity cascade hits that RESTRICT check
      //         — accidental trigger ordering, not a contract. So we delete the
      //         join rows, then the entities, explicitly BEFORE the org, making
      //         the whole sequence provably order-independent.
      await prisma.$transaction(async (tx) => {
        await tx.queryLog.deleteMany({ where: { userId } });
        if (orgIds.length) {
          // Clear the DocumentEntity -> Entity RESTRICT edge before Entity/Org.
          await tx.documentEntity.deleteMany({
            where: { document: { organizationId: { in: orgIds } } },
          });
          await tx.entity.deleteMany({ where: { organizationId: { in: orgIds } } });
          await tx.organization.deleteMany({ where: { id: { in: orgIds } } });
        }
        await tx.user.deleteMany({ where: { id: userId } });
      });

      // 3) Finally remove the Supabase auth identity (idempotent).
      await deleteAuthUser(userId);
      // A cached context for this user would outlive the rows for up to a
      // minute; the deletion is the one event that must not wait that long.
      invalidateUser(userId);

      return res.status(200).json({ ok: true, appleRevocation });
    } catch (err) {
      next(err);
    }
  }
}
