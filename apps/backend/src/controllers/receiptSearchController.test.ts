import { describe, it, expect, vi, beforeEach } from 'vitest';

// The tenant boundary of GET /api/search, measured on the where-clause the
// read actually sends, as ledgerController.test.ts measures /api/ledger.

const mocks = vi.hoisted(() => {
  const findMany = vi.fn();
  return { findMany, prisma: { document: { findMany } } };
});
vi.mock('../prismaClient', () => ({ prisma: mocks.prisma }));

import { ReceiptSearchController } from './receiptSearchController';
import { LEDGER_FACT_KEYS } from '../services/ledger/ledgerCore';

const MINE = '11111111-1111-1111-1111-111111111111';
const THEIRS = '22222222-2222-2222-2222-222222222222';

function call(query: Record<string, unknown>, user: unknown = { id: 'u', organizationId: MINE }) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  const next = vi.fn();
  const req: any = { query, user, body: {}, params: {} };
  return ReceiptSearchController.search(req, res, next).then(() => ({ res, next }));
}

beforeEach(() => {
  mocks.findMany.mockReset();
  mocks.findMany.mockResolvedValue([]);
});

describe('GET /api/search', () => {
  it("scopes the read to the caller's organisation, whatever the client names", async () => {
    const { res } = await call({ q: 'marjane', organizationId: THEIRS, orgId: THEIRS });
    expect(res.statusCode).toBe(200);
    const arg = mocks.findMany.mock.calls[0][0];
    expect(arg.where.organizationId).toBe(MINE);
    expect(JSON.stringify(arg)).not.toContain(THEIRS);
  });

  it('control: the probe does see an organisation id when one reaches the where', async () => {
    await call({}, { id: 'u', organizationId: THEIRS });
    expect(JSON.stringify(mocks.findMany.mock.calls[0][0])).toContain(THEIRS);
  });

  it('reads only the ledger fact keys, and the vendor entity the ledger reads', async () => {
    await call({ q: 'x' });
    const select = mocks.findMany.mock.calls[0][0].select;
    expect(select.facts.where.key.in).toEqual([...LEDGER_FACT_KEYS]);
    expect(select.documentEntities.where).toEqual({ entity: { entityType: 'VENDOR' } });
    expect(select.documentEntities.take).toBe(1);
  });

  it('with no parameters the whole organisation is read and the mode is recent', async () => {
    const { res } = await call({});
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ organizationId: MINE });
    expect(res.body.mode).toBe('recent');
  });

  it('a month narrows the read with the ledger superset filter', async () => {
    await call({ month: '2026-09' });
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe(MINE);
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0].facts.some.key).toBe('TRANSACTION_DATE');
  });

  it('refuses a category, month or zone the ledger would refuse, and no user', async () => {
    expect((await call({ category: 'Groceries' })).res.statusCode).toBe(400);
    expect((await call({ category: 'Groceries' })).res.body).toEqual({ error: 'INVALID_CATEGORY' });
    expect((await call({ month: '2026-9' })).res.body).toEqual({ error: 'INVALID_MONTH' });
    expect((await call({ tz: 'Mars/Olympus' })).res.body).toEqual({ error: 'INVALID_TIME_ZONE' });
    expect((await call({}, null)).res.statusCode).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('a very long query is cut, not refused', async () => {
    const { res } = await call({ q: 'a'.repeat(1000) });
    expect(res.statusCode).toBe(200);
    expect(res.body.q).toHaveLength(200);
  });
});
