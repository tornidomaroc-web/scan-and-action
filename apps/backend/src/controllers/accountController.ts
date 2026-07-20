import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prismaClient';
import { deleteAuthUser, deleteStorageObjects } from '../services/accountDeletionService';

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
      if (!dbUser) {
        await deleteAuthUser(userId);
        return res.status(200).json({ ok: true, alreadyDeleted: true });
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

      return res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
}
