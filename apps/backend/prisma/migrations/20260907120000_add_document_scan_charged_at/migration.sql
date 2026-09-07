-- One-time scan-charge marker on Document.
--
-- SAFETY: this is a single additive, metadata-only statement on PostgreSQL 11+:
--   * ALTER TABLE ... ADD COLUMN (nullable, NO default) -> metadata-only; it does
--     NOT rewrite existing rows and takes only a brief catalog lock. Every
--     existing row reads as NULL with no table scan.
-- No NOT NULL constraint, no default, no backfill, no data migration, no index,
-- no change to any existing column. Organization.scanCount is untouched by this
-- migration -- the charge gate that reads this column lives in application code
-- (services/ingestion/persistence.ts), not in SQL.
--
-- Existing rows read as NULL, i.e. "not charged under this mechanism". That is
-- the deliberate direction: the first re-persist of a pre-existing document
-- charges once and then self-marks, rather than backfilling a guess and
-- silently refunding scans that were genuinely consumed.
--
-- Authored OFFLINE from `prisma migrate diff --from-migrations ./prisma/migrations
-- --to-schema-datamodel ./prisma/schema.prisma --shadow-database-url <throwaway>
-- --script`, which emitted exactly the AlterTable below and nothing else.
-- Rolling back is a plain DROP COLUMN (see the down note below).

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "scanChargedAt" TIMESTAMP(3);

-- Down (manual, if ever reverted):
--   ALTER TABLE "Document" DROP COLUMN "scanChargedAt";
