import { describe, it, expect, vi } from 'vitest';
import { RuleEngineService } from './ruleEngineService';

// ============================================================================
// Rule D queried the wrong COLUMN, so it has never matched anything.
// ============================================================================
// checkDuplicate (ruleEngineService.ts:125-147) filtered on
// `documentEntities.some({ role: 'VENDOR' })`. But 'VENDOR' is not a role — it
// is an entityType. types/schemas.ts:16-17 documents the two axes:
//
//   entityType: z.enum(['VENDOR','CLIENT','PERSON','OTHER'])  "the type of entity"
//   role:       z.string()  "the role this entity plays IN THE DOCUMENT
//                            (e.g. 'Issuer', 'Billed To', 'Attendee')"
//
// geminiAdapter.ts:240-241 emits BOTH correctly — entityType 'VENDOR', role
// 'Issuer' — and persistence.ts:143 upper-cases the role to 'ISSUER'. The stored
// data is right; the query asked the role column for an entityType value.
//
// Measured in production: 156 DocumentEntity rows, ALL role='ISSUER', ZERO
// 'VENDOR'. So the duplicate-expense rule has never matched a single row in the
// product's life, and the fact-key fix that revived Rules A/B did nothing for it.
//
// The ingestion path already picks the merchant by entityType
// (persistence.ts:156), so keying this query the same way makes the two agree
// and needs no change to any stored row.
// ============================================================================

/** Captures the `where` that checkDuplicate builds. */
function makeCapturingPrisma() {
  const seen: any[] = [];
  const prisma = {
    document: {
      findUnique: async () => ({ summary: null }),
      findFirst: async (args: any) => { seen.push(args); return null; },
    },
  } as any;
  return { prisma, seen };
}

const facts = (amount: number) => [{ key: 'TOTAL_AMOUNT', valueNumber: amount }];

describe('checkDuplicate queries the entity TYPE, not the role column', () => {
  it('does not filter on role: "VENDOR" — that value is not in the role vocabulary', async () => {
    const { prisma, seen } = makeCapturingPrisma();
    const engine = new RuleEngineService(prisma);

    await engine.evaluate('d1', 'org-1', facts(100), 'Acme Supplies');

    expect(seen.length, 'checkDuplicate never ran').toBe(1);
    const json = JSON.stringify(seen[0]);
    expect(json, 'still querying the role column for an entityType value')
      .not.toMatch(/"role"\s*:\s*"VENDOR"/);
  });

  it('filters on entityType "VENDOR", which is what the adapter actually writes', async () => {
    const { prisma, seen } = makeCapturingPrisma();
    const engine = new RuleEngineService(prisma);

    await engine.evaluate('d2', 'org-1', facts(100), 'Acme Supplies');

    expect(JSON.stringify(seen[0])).toContain('entityType');
  });

  it('still scopes to the organization and excludes the document itself', async () => {
    // Guard: the fix must not widen the query. Cross-org duplicate detection
    // would be a data-isolation break, not a feature.
    const { prisma, seen } = makeCapturingPrisma();
    const engine = new RuleEngineService(prisma);

    await engine.evaluate('d3', 'org-9', facts(100), 'Acme Supplies');

    const where = seen[0].where;
    expect(where.organizationId).toBe('org-9');
    expect(where.id).toEqual({ not: 'd3' });
  });

  it('FLAGS a duplicate when the lookup finds a sibling document', async () => {
    const prisma = {
      document: {
        findUnique: async () => ({ summary: null }),
        findFirst: async () => ({ id: 'other-doc' }), // a match exists
      },
    } as any;
    const engine = new RuleEngineService(prisma);

    const result = await engine.evaluate('d4', 'org-1', facts(100), 'Acme Supplies');

    expect(result.decision).toBe('FLAGGED');
    expect(result.reasons).toContain('Possible duplicate expense');
  });

  it('CONTROL: no merchant means the duplicate lookup never runs', async () => {
    const { prisma, seen } = makeCapturingPrisma();
    const engine = new RuleEngineService(prisma);

    await engine.evaluate('d5', 'org-1', facts(100), null);

    expect(seen.length).toBe(0);
  });

  it('CONTROL: no amount means the duplicate lookup never runs', async () => {
    const { prisma, seen } = makeCapturingPrisma();
    const engine = new RuleEngineService(prisma);

    await engine.evaluate('d6', 'org-1', [], 'Acme Supplies');

    expect(seen.length).toBe(0);
  });
});
