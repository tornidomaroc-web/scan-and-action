-- PR4b: one-time welcome-email guard on User.
--
-- SAFETY: this is a single additive, metadata-only statement on PostgreSQL 11+:
--   * ALTER TABLE ... ADD COLUMN (nullable, NO default) -> metadata-only; it does
--     NOT rewrite existing rows and takes only a brief catalog lock. Every
--     existing row reads as NULL with no table scan.
-- No NOT NULL constraint, no default, no backfill, no data migration, no index.
-- Existing users keep welcomeEmailSentAt = NULL and are intentionally never sent
-- a retroactive welcome (the send path is gated on first-time provisioning).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "welcomeEmailSentAt" TIMESTAMP(3);
