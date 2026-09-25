import { Prisma, PrismaClient } from '@prisma/client';
import { LEDGER_FACT_KEYS, monthBounds } from './ledgerCore';
import { searchReceipts, SearchDocInput, SearchQuery, SearchResult } from './receiptSearch';

type Db = PrismaClient | Prisma.TransactionClient;

// The same reach as ledgerService.ts: an undated row uploaded this far outside
// the UTC month can still belong to it in the caller's zone.
const MAX_ZONE_OFFSET_MS = 14 * 60 * 60 * 1000;

/**
 * Reads ONE organisation's candidate rows and hands them to searchReceipts,
 * which applies every rule. With a month the where-clause is the ledger's own
 * superset filter; without one it is the whole organisation, which is small
 * (391 documents across all of production on 2026-09-25) and is judged in
 * memory so the money rules stay in one place.
 *
 * `organizationId` must come from the authenticated request. It is the only
 * tenant boundary here: nothing in this read accepts an id from the client.
 */
export async function readReceiptSearch(db: Db, organizationId: string, query: SearchQuery): Promise<SearchResult> {
  const where: Prisma.DocumentWhereInput = { organizationId };
  if (query.month !== null) {
    const { start, end } = monthBounds(query.month);
    where.OR = [
      { facts: { some: { key: 'TRANSACTION_DATE', valueDate: { gte: start, lt: end } } } },
      {
        facts: { none: { key: 'TRANSACTION_DATE', valueDate: { not: null } } },
        uploadedAt: { gte: new Date(start.getTime() - MAX_ZONE_OFFSET_MS), lt: new Date(end.getTime() + MAX_ZONE_OFFSET_MS) },
      },
    ];
  }
  const rows = await db.document.findMany({
    where,
    select: {
      id: true,
      status: true,
      uploadedAt: true,
      originalFileName: true,
      facts: {
        where: { key: { in: [...LEDGER_FACT_KEYS] } },
        select: { key: true, valueString: true, valueNumber: true, valueDate: true, currency: true, sourceSpan: true },
      },
      // The merchant exactly as the ledger reads it (ledgerService.ts), so a
      // row here is the row on the home.
      documentEntities: {
        where: { entity: { entityType: 'VENDOR' } },
        orderBy: { confidence: 'desc' },
        take: 1,
        select: { entity: { select: { displayName: true, canonicalName: true } } },
      },
    },
  });

  const docs: SearchDocInput[] = rows.map(d => ({
    id: d.id,
    status: d.status,
    uploadedAt: d.uploadedAt,
    merchant: d.documentEntities[0]?.entity.displayName ?? d.documentEntities[0]?.entity.canonicalName ?? null,
    fileName: d.originalFileName,
    facts: d.facts,
  }));
  return searchReceipts(docs, query);
}
