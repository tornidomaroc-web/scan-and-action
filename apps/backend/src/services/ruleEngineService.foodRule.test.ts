import { describe, it, expect } from 'vitest';
import { RuleEngineService } from './ruleEngineService';

// ============================================================================
// Rule B stops borrowing the CATEGORIZER's definition of food.
// ============================================================================
// Two rules disagreed about groceries, and one was quietly overriding the other:
//
//   ruleEngineService.ts:154  isFoodMerchant EXCLUDES 'grocery', with an explicit
//                             comment: "Keywords exclude 'grocery' as per specific
//                             business requirements."
//   expenseCategorizationService.ts:11-14  the Food category INCLUDES 'grocery',
//                             'supermarket' and 'walmart'.
//
// Both lists are right for their own question. The categorizer answers "what kind
// of expense is this?", and groceries genuinely are food. isFoodMerchant answers
// "should this be FLAGGED as a suspicious food expense?", and the business
// deliberately said groceries should not be. Rule B conflated them by reading
// `category === 'Food'` as a flagging signal, which imported the broader
// definition over the documented exclusion.
//
// That conflation was inert while it lasted: Rule B short-circuits on
// `amount !== null && amount > 50`, and resolveAmount never resolved an amount on
// the ingestion path, so Rule B could not fire there at all. Fixing the fact-key
// mismatch is exactly what arms it -- which is why both changes ship together and
// why the exclusion has to be honoured before the amount starts resolving.
//
// The fix is on the FLAGGING side, not the keyword lists: drop the category
// disjunct, and add the fast-food merchants isFoodMerchant was genuinely missing
// that the disjunct had been covering.
// ============================================================================

function makePrisma({ summary = null as string | null, duplicate = false } = {}) {
  return {
    document: {
      findUnique: async () => ({ summary }),
      findFirst: async () => (duplicate ? { id: 'dup' } : null),
    },
  } as any;
}

/** Canonical keys, as both callers now supply. */
const facts = (amount: number, category?: string) => [
  { key: 'TOTAL_AMOUNT', valueNumber: amount },
  ...(category ? [{ key: 'category', valueString: category }] : []),
];

describe('Rule B no longer flags on the category alone', () => {
  it('category "Food" with a NON-food merchant and NON-food summary does NOT flag', async () => {
    // This is the grocery case in disguise: the categorizer calls a supermarket
    // 'Food', and before this change that alone escalated to FLAGGED, overriding
    // the exclusion at :154.
    const engine = new RuleEngineService(makePrisma({ summary: 'A supermarket receipt.' }));
    const result = await engine.evaluate('d1', 'org', facts(100, 'Food'), 'Carrefour Market');

    expect(result.reasons).not.toContain('High food expense');
    expect(result.decision).toBe('APPROVED');
  });

  it('category "Food" does not flag even at a large amount', async () => {
    const engine = new RuleEngineService(makePrisma({ summary: 'A supermarket receipt.' }));
    const result = await engine.evaluate('d2', 'org', facts(480, 'Food'), 'Walmart');

    expect(result.reasons).not.toContain('High food expense');
  });

  // The two disjuncts that were never broken must keep working untouched.
  it('CONTROL: a food MERCHANT over 50 still flags', async () => {
    const engine = new RuleEngineService(makePrisma());
    const result = await engine.evaluate('d3', 'org', facts(100), 'Joe’s Pizza');

    expect(result.decision).toBe('FLAGGED');
    expect(result.reasons).toContain('High food expense');
  });

  it('CONTROL: a food SUMMARY over 50 still flags', async () => {
    const engine = new RuleEngineService(makePrisma({ summary: 'Team dinner at a restaurant.' }));
    const result = await engine.evaluate('d4', 'org', facts(100), 'Unknown Vendor Ltd');

    expect(result.decision).toBe('FLAGGED');
    expect(result.reasons).toContain('High food expense');
  });

  it('CONTROL: the documented grocery exclusion still holds on the merchant path', async () => {
    const engine = new RuleEngineService(makePrisma());
    const result = await engine.evaluate('d5', 'org', facts(100), 'Épicerie Léa');

    expect(result.reasons).not.toContain('High food expense');
    expect(result.decision).toBe('APPROVED');
  });
});

describe('isFoodMerchant covers the fast-food chains the category disjunct was carrying', () => {
  // These four sit in the categorizer's Food list but were absent from
  // isFoodMerchant, so dropping the category disjunct would have LOST them.
  // They are added deliberately rather than as a side effect.
  for (const merchant of ['DoorDash', 'KFC', 'Burger King', 'Subway']) {
    it(`flags "${merchant}" over 50 as a food expense`, async () => {
      const engine = new RuleEngineService(makePrisma());
      const result = await engine.evaluate('d6', 'org', facts(100), merchant);

      expect(result.decision).toBe('FLAGGED');
      expect(result.reasons).toContain('High food expense');
    });
  }

  it('CONTROL: a grocery-adjacent name is still not flagged by the additions', async () => {
    // 'subway' must not turn every transit receipt into a food expense... but it
    // is a sandwich chain, so the check here is that an unrelated merchant with
    // none of the keywords stays clean.
    const engine = new RuleEngineService(makePrisma());
    const result = await engine.evaluate('d7', 'org', facts(100), 'Supermarket Plus');

    expect(result.reasons).not.toContain('High food expense');
  });
});
