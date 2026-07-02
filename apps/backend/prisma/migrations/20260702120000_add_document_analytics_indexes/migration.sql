-- PR-C1: composite indexes on "Document" to support the dashboard analytics
-- aggregations added to GET /documents/stats (by-status breakdown + monthly
-- processed-series + period counts).
--
-- SAFETY: additive and reversible. Two CREATE INDEX statements only — no column
-- add/drop, no type change, no data migration, nothing destructive. Rolling
-- back is a plain DROP INDEX (see the down note below).
--
-- LOCK CAVEAT: a plain CREATE INDEX takes a SHARE lock that blocks writes to
-- "Document" for the duration of the build. At the current table size this is
-- negligible. If/when "Document" grows large, switch these to
-- CREATE INDEX CONCURRENTLY (which Prisma Migrate does NOT emit by default and
-- which cannot run inside the migration's implicit transaction) run out-of-band.
-- Flagged deliberately rather than silently chosen.

-- CreateIndex
CREATE INDEX "Document_organizationId_status_idx" ON "Document"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Document_organizationId_processedAt_idx" ON "Document"("organizationId", "processedAt");

-- Down (manual, if ever reverted):
--   DROP INDEX "Document_organizationId_status_idx";
--   DROP INDEX "Document_organizationId_processedAt_idx";
