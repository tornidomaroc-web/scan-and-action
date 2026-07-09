-- Item B (Phase 1): additive human-readable display name on Entity.
--
-- SAFETY: this is a single additive, metadata-only statement on PostgreSQL 11+:
--   * ALTER TABLE ... ADD COLUMN (nullable, NO default) -> metadata-only; it does
--     NOT rewrite existing rows and takes only a brief catalog lock. Every
--     existing row reads as NULL with no table scan.
-- No NOT NULL constraint, no default, no backfill, no data migration, no index,
-- no change to any existing column. `canonicalName` (the matching/dedup key) and
-- `aliases` are untouched. Nothing reads or writes displayName yet — a later
-- phase populates it (backfill from aliases[0]) and switches the display layer
-- to prefer it. Rolling back is a plain DROP COLUMN (see the down note below).

-- AlterTable
ALTER TABLE "Entity" ADD COLUMN     "displayName" TEXT;

-- Down (manual, if ever reverted):
--   ALTER TABLE "Entity" DROP COLUMN "displayName";
