-- Phase B data layer: per-source subscription state + manual entitlement floor.
--
-- SAFETY: every statement below is additive and metadata-only on PostgreSQL 11+:
--   * CREATE TYPE                       -> catalog-only, no table touched.
--   * ALTER TABLE ... ADD COLUMN (NULL, -> metadata-only; nullable with NO default
--     no default)                          does NOT rewrite existing rows.
--   * CREATE TABLE "Subscription"       -> brand-new empty table.
--   * CREATE INDEX on "Subscription"    -> table is empty, so no build cost/lock.
--   * ADD CONSTRAINT FK                 -> child table is empty, so validation is
--                                          instant; takes only a brief lock on
--                                          "Organization" (no scan of it required).
-- No NOT NULL backfills, no column type changes, no data migration here. The data
-- backfill is a separate idempotent script (scripts/backfillSubscriptions.ts).
--
-- WebhookEvent idempotency namespacing (paddle:${event_id}) is an application-level
-- key-construction change only; the WebhookEvent table/PK is intentionally unchanged
-- (TEXT PK already stores arbitrary strings), so there is deliberately no DDL for it.

-- CreateEnum
CREATE TYPE "BillingSource" AS ENUM ('PADDLE', 'REVENUECAT');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "planOverride" "PlanType";

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "source" "BillingSource" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
    "externalId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subscription_organizationId_idx" ON "Subscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_source_key" ON "Subscription"("organizationId", "source");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
