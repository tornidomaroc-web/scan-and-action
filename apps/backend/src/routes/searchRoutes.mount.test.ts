import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// ============================================================================
// GET /api/search through the MOUNT: the real app, the real authMiddleware.
// ============================================================================
// receiptSearchController.test.ts calls the handler with a hand-made req, so it
// cannot see where the route is mounted. Two properties live in app.ts and
// routes/, not in the handler, and are pinned here:
//
//   1. The route sits behind authMiddleware. No token and a bad token are
//      refused before any database read.
//   2. A signed-in caller sees only their own organisation's rows, whatever
//      the query string names. The database double below filters on the
//      where-clause it is sent, the way Postgres would: a where with no
//      organizationId returns EVERY row. So a read that dropped or replaced
//      organizationId puts the other organisation's row in the RESPONSE, where
//      this file looks, rather than only in a call argument. The control
//      proves the double does return that row to its own owner.
//
// Both were shown red on 2026-09-25: a service with `where = {}` failed the
// two signed-in tests, and the handler mounted above authMiddleware failed
// all four.
//
// A signed-in caller is made by seeding authContextCache, the path the real
// middleware takes for a token it has already verified, so Supabase is never
// called for them.
// ============================================================================

vi.hoisted(() => {
  process.env.SUPABASE_URL ||= 'http://localhost/supabase-not-used-in-this-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-not-used-in-this-test';
});

const mocks = vi.hoisted(() => {
  const getUser = vi.fn();
  const findMany = vi.fn();
  return { getUser, findMany };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('../prismaClient', () => ({ prisma: { document: { findMany: mocks.findMany } } }));

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../app';
import { cacheAuthContext, clearAuthContextCache } from '../middleware/authContextCache';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
const TOKEN_A = 'token-for-a-user-of-org-a';
const TOKEN_B = 'token-for-a-user-of-org-b';

const row = (id: string, organizationId: string, amount: number) => ({
  id,
  organizationId,
  status: 'COMPLETED',
  uploadedAt: new Date('2026-09-10T09:00:00Z'),
  originalFileName: `${id}.jpg`,
  facts: [{ key: 'TOTAL_AMOUNT', valueString: null, valueNumber: amount, valueDate: null, currency: 'USD', sourceSpan: String(amount) }],
  documentEntities: [{ entity: { displayName: 'Pizza Palace', canonicalName: 'pizza palace' } }],
});
const ROWS = [row('doc-of-a', ORG_A, 50), row('doc-of-b', ORG_B, 999)];

let server: Server;
let base: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/search`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  clearAuthContextCache();
  cacheAuthContext(TOKEN_A, { id: 'user-a', email: 'a@example.test', organizationId: ORG_A });
  cacheAuthContext(TOKEN_B, { id: 'user-b', email: 'b@example.test', organizationId: ORG_B });
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } });
  mocks.findMany.mockReset().mockImplementation(({ where }: any) =>
    Promise.resolve(ROWS.filter((r) => where?.organizationId === undefined || r.organizationId === where.organizationId)));
});

const get = (qs: string, token?: string) =>
  fetch(`${base}?${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

const ids = (body: any): string[] => [
  ...body.receipts.map((r: any) => r.documentId),
  ...body.notCounted.map((r: any) => r.documentId),
];

describe('GET /api/search behind the /api auth mount', () => {
  it('refuses a request with no token, before any read', async () => {
    const res = await get('q=pizza&tz=UTC');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Missing or malformed access token' });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('refuses a token Supabase does not accept, before any read', async () => {
    const res = await get('q=pizza&tz=UTC', 'not-a-valid-token');
    expect(res.status).toBe(401);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("answers a signed-in caller with their own organisation's rows only", async () => {
    const res = await get(`q=pizza&tz=UTC&organizationId=${ORG_B}&orgId=${ORG_B}`, TOKEN_A);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(ids(body)).toEqual(['doc-of-a']);
    expect(body.currencies).toEqual([{ currency: 'USD', total: 50, receiptCount: 1 }]);
    expect(JSON.stringify(body)).not.toContain('doc-of-b');
  });

  it('control: the same double does hand the other row to its own organisation', async () => {
    const res = await get('q=pizza&tz=UTC', TOKEN_B);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(ids(body)).toEqual(['doc-of-b']);
    expect(body.currencies).toEqual([{ currency: 'USD', total: 999, receiptCount: 1 }]);
  });
});
