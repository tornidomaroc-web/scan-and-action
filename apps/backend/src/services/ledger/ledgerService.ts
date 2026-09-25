import { Prisma, PrismaClient } from '@prisma/client';
import { buildLedger, LedgerDocInput, LedgerMonth, LEDGER_FACT_KEYS, monthBounds } from './ledgerCore';

type Db = PrismaClient | Prisma.TransactionClient;

// The widest offset any IANA zone has from UTC (+14 Kiribati, -12 Baker). An
// undated row uploaded this far outside the UTC month can still belong to it
// in the caller's zone, so the read reaches that far and buildLedger decides.
const MAX_ZONE_OFFSET_MS = 14 * 60 * 60 * 1000;

/**
 * Reads ONE organisation's candidate rows for a month and hands them to
 * buildLedger, which applies every rule. The where-clause here is only a
 * superset filter: it must never drop a row buildLedger would count, and the
 * reconciliation script (scripts/ledgerReconcile.ts) checks exactly that
 * against a direct SQL read.
 *
 * `organizationId` must come from the authenticated request (authMiddleware
 * sets it from the caller's membership). It is the only tenant boundary here:
 * nothing in this read accepts an id from the client.
 */
export async function readLedgerMonth(db: Db, organizationId: string, month: string, timeZone: string): Promise<LedgerMonth> {
  const { start, end } = monthBounds(month);
  const rows = await db.document.findMany({
    // One statement with lateral joins for the nested facts and vendor, in
    // place of three sequential round trips (~126 ms each, measured
    // 2026-09-25). `relationJoins` is enabled in schema.prisma.
    relationLoadStrategy: 'join',
    where: {
      organizationId,
      OR: [
        { facts: { some: { key: 'TRANSACTION_DATE', valueDate: { gte: start, lt: end } } } },
        {
          facts: { none: { key: 'TRANSACTION_DATE', valueDate: { not: null } } },
          uploadedAt: { gte: new Date(start.getTime() - MAX_ZONE_OFFSET_MS), lt: new Date(end.getTime() + MAX_ZONE_OFFSET_MS) },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      uploadedAt: true,
      facts: {
        where: { key: { in: [...LEDGER_FACT_KEYS] } },
        select: { key: true, valueString: true, valueNumber: true, valueDate: true, currency: true, sourceSpan: true },
      },
      documentEntities: {
        where: { entity: { entityType: 'VENDOR' } },
        orderBy: { confidence: 'desc' },
        take: 1,
        select: { entity: { select: { displayName: true, canonicalName: true } } },
      },
    },
  });

  const docs: LedgerDocInput[] = rows.map(d => ({
    id: d.id,
    status: d.status,
    uploadedAt: d.uploadedAt,
    merchant: d.documentEntities[0]?.entity.displayName ?? d.documentEntities[0]?.entity.canonicalName ?? null,
    facts: d.facts,
  }));
  return buildLedger(docs, month, timeZone);
}
