import { describe, it, expect } from 'vitest';
import { RuleEngineService } from './ruleEngineService';

// The rule engine only touches prisma for (1) the document summary and (2) the
// duplicate lookup. A tiny fake covers both so we can unit-test the food rule
// (deferred item C) without a database.
function makePrisma({ summary = null as string | null, duplicate = false } = {}) {
  return {
    document: {
      findUnique: async () => ({ summary }),
      findFirst: async () => (duplicate ? { id: 'dup' } : null),
    },
  } as any;
}

const facts = (amount: number) => [{ key: 'TOTAL_AMOUNT', valueNumber: amount }];

describe('RuleEngineService — food rule is accent- and boundary-aware (item C)', () => {
  it('FLAGS an accented food merchant over 50 with "High food expense"', async () => {
    const engine = new RuleEngineService(makePrisma());
    const result = await engine.evaluate('d1', 'org', facts(100), 'Café Central');
    expect(result.decision).toBe('FLAGGED');
    expect(result.reasons).toContain('High food expense');
  });

  it('does NOT flag a non-food accented merchant (grocery) as a food expense', async () => {
    const engine = new RuleEngineService(makePrisma());
    const result = await engine.evaluate('d2', 'org', facts(100), 'Épicerie Léa');
    expect(result.reasons).not.toContain('High food expense');
    expect(result.decision).toBe('APPROVED');
  });

  it('does NOT flag "Barber Shop" as food (old bar-substring false positive)', async () => {
    const engine = new RuleEngineService(makePrisma());
    const result = await engine.evaluate('d3', 'org', facts(100), 'Barber Shop');
    expect(result.reasons).not.toContain('High food expense');
    expect(result.decision).toBe('APPROVED');
  });

  it('does NOT flag "Publix" grocery as food (old pub-substring false positive)', async () => {
    const engine = new RuleEngineService(makePrisma());
    const result = await engine.evaluate('d4', 'org', facts(100), 'Publix');
    expect(result.reasons).not.toContain('High food expense');
    expect(result.decision).toBe('APPROVED');
  });

  it('still flags via an accented AI summary when the merchant is unknown', async () => {
    const engine = new RuleEngineService(makePrisma({ summary: 'Reçu du Café du Marché' }));
    const result = await engine.evaluate('d5', 'org', facts(100), null);
    expect(result.decision).toBe('FLAGGED');
    expect(result.reasons).toContain('High food expense');
  });

  it('a true food merchant with a spaced keyword still matches ("corner bar")', async () => {
    const engine = new RuleEngineService(makePrisma());
    const result = await engine.evaluate('d6', 'org', facts(100), 'The Corner Bar');
    expect(result.reasons).toContain('High food expense');
  });
});

describe('RuleEngineService — checkDuplicate normalizes the merchant before comparing (item B)', () => {
  // Capturing fake: records the exact `where` passed to document.findFirst so we
  // can assert what canonical key the duplicate query actually compares against.
  function makeCapturingPrisma() {
    const calls: any[] = [];
    return {
      calls,
      prisma: {
        document: {
          findUnique: async () => ({ summary: null }),
          findFirst: async (args: any) => {
            calls.push(args);
            return null; // not a duplicate — we only care about the query shape
          },
        },
      } as any,
    };
  }

  const facts = (amount: number) => [{ key: 'TOTAL_AMOUNT', valueNumber: amount }];
  const canonOf = (args: any) => args.where.documentEntities.some.entity.canonicalName.equals;

  it('canonicalizes a raw accented/punctuated vendor name (ingestion path)', async () => {
    const { calls, prisma } = makeCapturingPrisma();
    await new RuleEngineService(prisma).evaluate('d1', 'org', facts(100), 'Café Central');
    expect(calls.length).toBe(1);
    expect(canonOf(calls[0])).toBe('CAF CENTRAL'); // NOT the raw "Café Central"
  });

  it('an already-canonical name (documentController re-eval path) yields the SAME query key', async () => {
    const { calls, prisma } = makeCapturingPrisma();
    await new RuleEngineService(prisma).evaluate('d2', 'org', facts(100), 'CAF CENTRAL');
    expect(canonOf(calls[0])).toBe('CAF CENTRAL'); // identical to the ingestion path
  });

  it('does not run a duplicate query for an all-punctuation (empty-canonical) merchant', async () => {
    const { calls, prisma } = makeCapturingPrisma();
    await new RuleEngineService(prisma).evaluate('d3', 'org', facts(100), '***');
    expect(calls.length).toBe(0); // short-circuits before querying
  });
});
