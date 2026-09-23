import { describe, it, expect, vi, beforeEach } from 'vitest';

// The tenant boundary of GET /api/ledger, measured on the where-clause the
// read actually sends. The organisation must come from req.user (set by
// authMiddleware from the caller's membership) and from nothing the client
// sends. A test that only checked the response would pass against a handler
// that read `req.query.organizationId`, because the double answers whatever
// it is asked.

const mocks = vi.hoisted(() => {
  const findMany = vi.fn();
  return { findMany, prisma: { document: { findMany } } };
});
vi.mock('../prismaClient', () => ({ prisma: mocks.prisma }));

import { LedgerController } from './ledgerController';
import { LEDGER_FACT_KEYS } from '../services/ledger/ledgerCore';

const MINE = '11111111-1111-1111-1111-111111111111';
const THEIRS = '22222222-2222-2222-2222-222222222222';

function call(query: Record<string, unknown>, user: unknown = { id: 'u', organizationId: MINE }, body: unknown = {}) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  const next = vi.fn();
  const req: any = { query, user, body, params: {} };
  return LedgerController.getMonth(req, res, next).then(() => ({ res, next }));
}

beforeEach(() => {
  mocks.findMany.mockReset();
  mocks.findMany.mockResolvedValue([]);
});

describe('GET /api/ledger', () => {
  it('scopes the read to the caller\'s organisation, whatever the client names', async () => {
    const { res } = await call({ month: '2026-09', organizationId: THEIRS, orgId: THEIRS }, { id: 'u', organizationId: MINE }, { organizationId: THEIRS });
    expect(res.statusCode).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    const arg = mocks.findMany.mock.calls[0][0];
    expect(arg.where.organizationId).toBe(MINE);
    expect(JSON.stringify(arg)).not.toContain(THEIRS);
  });

  it('control: the same probe does see an organisation id when one reaches the where', async () => {
    // Without this, "not.toContain(THEIRS)" above could pass on a serialiser
    // that dropped the field. Here the caller IS the other organisation.
    await call({ month: '2026-09' }, { id: 'u', organizationId: THEIRS });
    expect(JSON.stringify(mocks.findMany.mock.calls[0][0])).toContain(THEIRS);
  });

  it('reads only the ledger\'s fact keys, and never EXPENSE_CATEGORY or amount', async () => {
    await call({ month: '2026-09' });
    const keys = mocks.findMany.mock.calls[0][0].select.facts.where.key.in;
    expect(keys).toEqual([...LEDGER_FACT_KEYS]);
    expect(keys).not.toContain('EXPENSE_CATEGORY');
    expect(keys).not.toContain('amount');
  });

  it('refuses without an organisation, before reading anything', async () => {
    // null, not undefined: undefined would select call()'s default user.
    const { res } = await call({ month: '2026-09' }, null);
    expect(res.statusCode).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('refuses a malformed month or time zone, before reading anything', async () => {
    for (const month of [undefined, '2026-9', '2026-13', '2026-09-01', ['2026-09'], "2026-09' OR 1=1"]) {
      const { res } = await call({ month });
      expect(res.statusCode, String(month)).toBe(400);
      expect(res.body).toEqual({ error: 'INVALID_MONTH' });
    }
    for (const tz of ['Mars/Olympus', '', ['UTC'], 'x'.repeat(65)]) {
      const { res } = await call({ month: '2026-09', tz });
      expect(res.statusCode, String(tz)).toBe(400);
      expect(res.body).toEqual({ error: 'INVALID_TIME_ZONE' });
    }
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('passes the caller\'s zone through and defaults to UTC', async () => {
    const a = await call({ month: '2026-09', tz: 'Africa/Casablanca' });
    expect(a.res.body.timeZone).toBe('Africa/Casablanca');
    const b = await call({ month: '2026-09' });
    expect(b.res.body.timeZone).toBe('UTC');
  });

  it('maps rows through buildLedger, merchant from the vendor entity', async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: 'doc-a', status: 'COMPLETED', uploadedAt: new Date('2026-09-02T10:00:00Z'),
        facts: [
          { key: 'TOTAL_AMOUNT', valueString: null, valueNumber: 12.5, valueDate: null, currency: 'MAD', sourceSpan: 'Primary Total' },
          { key: 'category', valueString: 'Food', valueNumber: null, valueDate: null, currency: null, sourceSpan: 'extractor' },
        ],
        documentEntities: [{ entity: { displayName: null, canonicalName: 'MARJANE' } }],
      },
    ]);
    const { res } = await call({ month: '2026-09' });
    expect(res.body.currencies).toHaveLength(1);
    expect(res.body.currencies[0].currency).toBe('MAD');
    expect(res.body.currencies[0].total).toBe(12.5);
    expect(res.body.currencies[0].receipts[0]).toEqual({
      documentId: 'doc-a', date: '2026-09-02', dateSource: 'uploaded', amount: 12.5, amountSource: 'extracted',
      category: 'Food', merchant: 'MARJANE', status: 'COMPLETED',
    });
  });
});
