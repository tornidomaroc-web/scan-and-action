import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// ============================================================================
// THE PLAN IS AN INTERFACE. NOTHING REFUSES A BAD ONE.
// ============================================================================
// `QueryIntentSchema` in types/querySchemas.ts is a zod object and intentParser
// ends on `QueryIntentSchema.parse(intent)` — the INTENT is validated at
// runtime. `QueryPlan`, in the same file, is a bare `export interface`. There is
// no `QueryPlanSchema`, no parse, no guard anywhere in the tree, and the
// `'eq' | 'in' | 'gte' | 'lte' | 'contains'` union on `filters[].operator` is
// erased at compile time. Two places in queryExecutor.ts then build a Prisma
// key out of plan data:
//
//   baseWhere.AND.push({ uploadedAt: { [filter.operator]: filter.value } })
//   orderBy: { [plan.sort?.field.split('.').pop() || 'uploadedAt']: ... }
//
// ── WHERE THIS FILE GETS ITS ORACLE, AND WHY NOT FROM A LIST ────────────────
//
// There is no enumerable allow-list in the source. Fields are compared against
// string literals inside a `for` loop in queryExecutor.ts; operators live only
// in an erased type. A test that hand-wrote `const ALLOWED = [...]` would be
// inventing its own oracle and would agree with itself forever — including
// about the two fields below that are emitted and then silently discarded.
//
// So the CONSUMER is the oracle, measured. For each field a producer emits, the
// same plan is compiled by the REAL QueryExecutor twice — once with the filter,
// once without — and the two `where` clauses are compared. A field that changes
// nothing was not consumed. Nothing is transcribed; the check reads what the
// executor actually built.
//
// The producer vocabulary is derived the same way, by RUNNING the producers:
// QueryPlanner over every member of `SupportedIntents.options` (a zod enum, so
// the intent list is code-derived too) crossed with the intent variants below,
// and ReportController through its own blueprints, read back out of the plan
// the executor itself writes to QueryLog.
//
// ── WHAT IS A FREEZE HERE, AND SAID SO ──────────────────────────────────────
//
// Three assertions below are FREEZES ON CONSTANTS, labelled `FREEZE` in their
// names. Nothing a user can type reaches them:
//
//   * plan.sort is set in exactly two places in queryPlanner.ts, both the
//     identical literal { field: 'Document.uploadedAt', direction: 'desc' }.
//   * plan.limit is one of four literals.
//   * filters[].operator is always a planner literal; the intent's free-text
//     arrays (documentTypes, categories, entityNames) reach filter VALUES only.
//
// They are worth pinning — they go red when someone widens them — but they
// caught no attack and this file must not imply one. The sort-key check IS
// measured (it asks Prisma's own dmmf whether the compiled orderBy key is a
// real Document column); the operator ALPHABET check is not.
//
// ── THE LIVE DEFECT THIS PINS ───────────────────────────────────────────────
//
// queryExecutor.ts compiles filters through a closed if/else-if chain. A filter
// whose `field` matches no branch falls off the end and is DISCARDED — no
// throw, no log, no counter. queryPlanner.ts emits two such fields on the
// sum_expenses branch:
//
//   plan.filters.push({ field: 'DocumentFact.factType', operator: 'eq', ... })
//   plan.filters.push({ field: 'DocumentFact.key',      operator: 'eq', ... })
//
// Both are dropped today. They are harmless ONLY because the executor's
// sum_expenses case re-applies `factType: 'AMOUNT'` and `key: 'TOTAL_AMOUNT'`
// as its own literals — two ends agreeing by luck, which is the same shape as
// the receipt and business-card bugs that receiptFilter.test.ts and
// reportController.recentCards.test.ts were written for.
//
// They are NOT fixed here. `baseWhere` is a Document where-clause and those are
// DocumentFact columns, so honouring them means a `facts: { some: ... }`
// relation predicate — which narrows WHICH DOCUMENTS QUALIFY rather than which
// facts are summed. That moves a money figure in the ask path. Out of scope
// here too: the home screen's money is GET /api/ledger, which does not use it.
// See WORK-QUEUE.md.
//
// The pin is bidirectional: red if a THIRD dropped field appears, and red if
// these two are ever honoured, which is when someone should read this note.
//
// ── NAMED BLIND SPOTS (this file does not cover them; do not read it as if it
//    did) ─────────────────────────────────────────────────────────────────────
//
//   1. REPORT_IDS below is TRANSCRIBED. The blueprint ids are `case` labels
//      inside ReportController.getReport and are not enumerable at runtime; a
//      third blueprint added to that switch is not probed until it is added
//      here. The ORACLE is still measured — only the probe's input list is not.
//   2. Plan properties that no consumer reads are out of scope. Measured while
//      writing this: the only reader of a plan is queryExecutor, and it reads
//      requiresClarification, explanation, filters, limit, sort and outputMode.
//      `aggregations`, `sourceTables`, `joins` and `groupBy` are written by
//      producers and read by nothing. That is a dead-field problem, not a
//      dropped-filter problem, and instrumenting it honestly needs a different
//      mechanism than this one.
//   3. Filter VALUES are not checked. They reach Prisma as parameters through
//      its query builder, not as keys.
// ============================================================================

const mocks = vi.hoisted(() => {
  const docFindMany = vi.fn();
  const docCount = vi.fn();
  const factGroupBy = vi.fn();
  const factFindMany = vi.fn();
  const entityFindMany = vi.fn();
  const queryLogCreate = vi.fn();
  return {
    docFindMany,
    docCount,
    factGroupBy,
    factFindMany,
    entityFindMany,
    queryLogCreate,
    prisma: {
      document: { findMany: docFindMany, count: docCount },
      documentFact: { groupBy: factGroupBy, findMany: factFindMany },
      documentEntity: { findMany: entityFindMany },
      queryLog: { create: queryLogCreate },
    },
  };
});

vi.mock('../../prismaClient', () => ({ prisma: mocks.prisma }));

import { QueryPlanner } from './queryPlanner';
import { QueryExecutor } from './queryExecutor';
import { ReportController } from '../../controllers/reportController';
import { SupportedIntents, QueryIntent, QueryPlan } from '../../types/querySchemas';

const ORG = 'org-contract';
const USER = 'user-contract';

type Filter = QueryPlan['filters'][number];

// ── The oracle for the sort key: Prisma's own model metadata ────────────────
// Not a list written here. If it ever stops being available this file fails at
// import rather than quietly asserting nothing — a silently absent oracle is
// indistinguishable from a passing check.
const documentModel = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Document');
if (!documentModel) {
  throw new Error('Prisma dmmf exposes no Document model; the sort-key oracle is gone.');
}
const DOCUMENT_COLUMNS: string[] = documentModel.fields
  .filter((f) => f.kind === 'scalar' || f.kind === 'enum')
  .map((f) => f.name);

// Emitted by the planner, never consumed by the executor. See the header.
const PINNED_AS_DROPPED = ['DocumentFact.factType', 'DocumentFact.key'];

// TRANSCRIBED PROBE INPUTS, not an oracle — blind spot 1 in the header.
// `monthly_expenses` was removed 2026-09-23 (it grouped on EXPENSE_CATEGORY,
// which nothing writes); the month's money is GET /api/ledger.
const REPORT_IDS = ['recent_cards'];

const primeDoubles = () => {
  mocks.docFindMany.mockResolvedValue([]);
  mocks.docCount.mockResolvedValue(0);
  mocks.factGroupBy.mockResolvedValue([]);
  mocks.factFindMany.mockResolvedValue([]);
  mocks.entityFindMany.mockResolvedValue([]);
  mocks.queryLogCreate.mockResolvedValue({});
};

const baseIntent = (intent: string): QueryIntent => ({
  intent: intent as QueryIntent['intent'],
  outputFormat: 'table',
  confidence: 1,
  needsClarification: false,
});

const planWith = (filters: Filter[], extra: Partial<QueryPlan> = {}): QueryPlan => ({
  sourceTables: ['Document'],
  joins: [],
  filters,
  outputMode: 'table',
  ...extra,
});

const runPlan = async (plan: QueryPlan, intentName = 'list_documents') => {
  vi.clearAllMocks();
  primeDoubles();
  await new QueryExecutor(mocks.prisma as any).execute(
    USER,
    ORG,
    'plan-contract-probe',
    'en',
    baseIntent(intentName),
    plan,
  );
};

const whereForFilters = async (filters: Filter[]) => {
  await runPlan(planWith(filters));
  return mocks.docFindMany.mock.calls[0][0].where;
};

/** The measured consumption check: did this filter change what the executor built? */
const changesTheWhere = async (filter: Filter): Promise<boolean> => {
  const withFilter = JSON.stringify(await whereForFilters([filter]));
  const withoutFilter = JSON.stringify(await whereForFilters([]));
  return withFilter !== withoutFilter;
};

/** The single clause a single filter compiled into, or undefined if it compiled into none. */
const clauseFor = async (filter: Filter) => {
  const where = await whereForFilters([filter]);
  return (where.AND ?? [])[0];
};

// ── Producer vocabulary, derived by running the producers ───────────────────

// Adversarial and ordinary intent shapes. The free-text arrays carry values a
// user could actually get into an intent, including ones that would be hostile
// if they ever reached a key position.
const INTENT_VARIANTS: Partial<QueryIntent>[] = [
  {},
  { documentTypes: ['INVOICE', 'RECEIPT'] },
  { documentTypes: ['__proto__', 'constructor'] },
  { categories: ['NEEDS_REVIEW'] },
  { categories: ['Groceries', '__proto__', "'; DROP TABLE \"Document\"; --"] },
  { entityNames: ['ACME', '__proto__', '{"$ne":null}'] },
  { dateRange: { relativeExpression: 'last_month' } },
  { dateRange: { relativeExpression: 'today' } },
  { dateRange: { relativeExpression: '__proto__' } },
  { dateRange: { startIso: '2026-01-01', endIso: '2026-02-01' } },
  {
    documentTypes: ['X'],
    categories: ['NEEDS_REVIEW', 'Food'],
    entityNames: ['E'],
    dateRange: { relativeExpression: 'this_year' },
  },
];

interface Emitted {
  fields: string[];
  pairs: { field: string; operator: string }[];
  sorts: { field: string; direction: string }[];
  limits: number[];
  reportFields: string[];
}

const reportPlan = async (id: string): Promise<QueryPlan | undefined> => {
  vi.clearAllMocks();
  primeDoubles();
  const req: any = { params: { id }, query: {}, user: { id: USER, organizationId: ORG } };
  const res: any = {
    status() {
      return this;
    },
    json() {
      return this;
    },
  };
  await ReportController.getReport(req, res, vi.fn());
  const call = mocks.queryLogCreate.mock.calls[0];
  return call ? (call[0].data.queryPlanJson as QueryPlan) : undefined;
};

const deriveEmitted = async (): Promise<Emitted> => {
  const plans: QueryPlan[] = [];

  const planner = new QueryPlanner();
  for (const intent of SupportedIntents.options) {
    for (const variant of INTENT_VARIANTS) {
      plans.push(planner.generatePlan({ ...baseIntent(intent), ...variant }));
    }
  }

  const reportFields = new Set<string>();
  for (const id of REPORT_IDS) {
    const plan = await reportPlan(id);
    if (plan) {
      plans.push(plan);
      for (const f of plan.filters ?? []) reportFields.add(f.field);
    }
  }

  const fields = new Set<string>();
  const pairs = new Map<string, { field: string; operator: string }>();
  const sorts = new Map<string, { field: string; direction: string }>();
  const limits = new Set<number>();

  for (const plan of plans) {
    for (const f of plan.filters ?? []) {
      fields.add(f.field);
      pairs.set(`${f.field}|${f.operator}`, { field: f.field, operator: f.operator });
    }
    if (plan.sort) sorts.set(`${plan.sort.field}|${plan.sort.direction}`, plan.sort);
    if (plan.limit !== undefined) limits.add(plan.limit);
  }

  return {
    fields: [...fields].sort(),
    pairs: [...pairs.values()],
    sorts: [...sorts.values()],
    limits: [...limits].sort((a, b) => a - b),
    reportFields: [...reportFields].sort(),
  };
};

let emittedMemo: Promise<Emitted> | null = null;
const emitted = () => (emittedMemo ??= deriveEmitted());

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  primeDoubles();
});

// ────────────────────────────────────────────────────────────────────────────

describe('the probe, proved in both directions before anything is concluded from it', () => {
  it('calls a field the executor has a branch for CONSUMED', async () => {
    const consumed = await changesTheWhere({
      field: 'Document.status',
      operator: 'in',
      value: ['COMPLETED'],
    });
    expect(consumed).toBe(true);
  });

  it('calls a field the executor has no branch for NOT consumed', async () => {
    const consumed = await changesTheWhere({
      field: 'Document.zzqNoSuchFieldAnywhere',
      operator: 'eq',
      value: 'x',
    });
    expect(consumed).toBe(false);
  });

  it('the filter compile runs before the intent switch, so one intent measures them all', async () => {
    const filter: Filter = { field: 'Document.status', operator: 'in', value: ['COMPLETED'] };

    await runPlan(planWith([filter]), 'list_documents');
    const viaFindMany = JSON.stringify(mocks.docFindMany.mock.calls[0][0].where);

    await runPlan(planWith([filter]), 'count_documents');
    const viaCount = JSON.stringify(mocks.docCount.mock.calls[0][0].where);

    expect(viaCount).toBe(viaFindMany);
  });

  it('the producer derivation is not silently empty', async () => {
    const e = await emitted();
    // A derivation that quietly returned nothing would make every assertion
    // below vacuous and green. Both producers must have contributed.
    expect(e.fields.length).toBeGreaterThanOrEqual(5);
    expect(e.fields).toContain('Document.documentType');
    expect(e.pairs.length).toBeGreaterThanOrEqual(5);
    expect(e.reportFields.length).toBeGreaterThanOrEqual(1);
    expect(e.limits.length).toBeGreaterThanOrEqual(1);
    expect(e.sorts.length).toBeGreaterThanOrEqual(1);
  });
});

describe('every field either producer emits is consumed by the executor', () => {
  it('no emitted field is silently discarded, except the two pinned below', async () => {
    const e = await emitted();
    const unconsumed: string[] = [];
    for (const field of e.fields) {
      const probe: Filter = { field, operator: 'in', value: ['probe-value'] };
      if (!(await changesTheWhere(probe))) unconsumed.push(field);
    }
    expect(unconsumed.sort()).toEqual([...PINNED_AS_DROPPED].sort());
  });

  it('PINNED LIVE DEFECT — these two are emitted and dropped; red when fixed', async () => {
    // Bidirectional. If someone honours these in queryExecutor, this goes red
    // and sends them to the header note about the money figure.
    for (const field of PINNED_AS_DROPPED) {
      const probe: Filter = { field, operator: 'eq', value: 'probe-value' };
      expect(await changesTheWhere(probe)).toBe(false);
    }
  });

  it('and the planner really does still emit them, so the pin is not vacuous', async () => {
    const e = await emitted();
    for (const field of PINNED_AS_DROPPED) expect(e.fields).toContain(field);
  });

  it('every field the report blueprints emit is consumed', async () => {
    const e = await emitted();
    for (const field of e.reportFields) {
      const probe: Filter = { field, operator: 'eq', value: 'probe-value' };
      expect(await changesTheWhere(probe)).toBe(true);
    }
  });
});

describe('operators', () => {
  it('every emitted field/operator pair compiles to a clause matching the operator', async () => {
    const e = await emitted();
    for (const { field, operator } of e.pairs) {
      if (PINNED_AS_DROPPED.includes(field)) continue; // compiles to nothing, pinned above

      const value =
        operator === 'in' ? ['probe-value'] : operator === 'eq' ? 'probe-value' : new Date('2026-01-01');
      const clause = await clauseFor({ field, operator: operator as Filter['operator'], value });
      expect(clause, `${field} | ${operator} compiled to no clause`).toBeDefined();
      const shape = JSON.stringify(clause);

      if (operator === 'in') {
        expect(shape, `${field} | in`).toContain('"in":');
      } else if (operator === 'eq') {
        // An `eq` that compiled into an `in` wrapper is the silent
        // mis-compile the else-branches in queryExecutor can produce.
        expect(shape, `${field} | eq`).not.toContain('"in":');
      } else if (operator === 'gte' || operator === 'lte') {
        // This is the dynamic-key site: the operator becomes the Prisma key.
        expect(shape, `${field} | ${operator}`).toContain(`"${operator}":`);
      } else {
        expect.fail(`unrecognised operator "${operator}" on ${field}; it reaches a Prisma key position`);
      }
    }
  });

  it('FREEZE — the operator alphabet is these four literals, and no input reaches it', async () => {
    // NOT adversarial coverage. filters[].operator is a planner literal at every
    // emit site; nothing a user types changes it. This goes red when the
    // alphabet is widened, which is the point.
    const e = await emitted();
    expect([...new Set(e.pairs.map((p) => p.operator))].sort()).toEqual(['eq', 'gte', 'in', 'lte']);
  });
});

describe('sort key', () => {
  it('the orderBy key the executor builds is a real Document column', async () => {
    // Measured against Prisma's own datamodel, not a list written here.
    const e = await emitted();
    for (const sort of e.sorts) {
      await runPlan(planWith([], { sort: sort as QueryPlan['sort'] }));
      const orderBy = mocks.docFindMany.mock.calls[0][0].orderBy;
      const key = Object.keys(orderBy)[0];
      expect(DOCUMENT_COLUMNS, `sort '${sort.field}' compiled to orderBy key '${key}'`).toContain(key);
    }
  });

  it('and so is the key used when a plan carries no sort at all', async () => {
    await runPlan(planWith([]));
    const orderBy = mocks.docFindMany.mock.calls[0][0].orderBy;
    expect(DOCUMENT_COLUMNS).toContain(Object.keys(orderBy)[0]);
  });

  it('FREEZE — the emitted sort vocabulary is one field and one direction', async () => {
    // NOT adversarial coverage. plan.sort is set from the identical literal in
    // both places queryPlanner sets it; there is no input-derived branch here.
    const e = await emitted();
    expect([...new Set(e.sorts.map((s) => s.field))]).toEqual(['Document.uploadedAt']);
    expect([...new Set(e.sorts.map((s) => s.direction))]).toEqual(['desc']);
  });
});

describe('limit', () => {
  it('FREEZE/BOUND — every emitted limit is a positive integer within a sane page', async () => {
    // NOT adversarial coverage. plan.limit is one of four planner literals. The
    // bound is what encodes a consequence: Prisma reads a negative `take` as
    // take-from-the-end, silently reversing the page, and an unbounded one is a
    // resource problem.
    const e = await emitted();
    for (const limit of e.limits) {
      expect(Number.isInteger(limit), `limit ${limit}`).toBe(true);
      expect(limit).toBeGreaterThan(0);
      expect(limit).toBeLessThanOrEqual(100);
    }
  });

  it('and the take the executor falls back to when a plan carries no limit is in the same bound', async () => {
    await runPlan(planWith([]));
    const take = mocks.docFindMany.mock.calls[0][0].take;
    expect(Number.isInteger(take)).toBe(true);
    expect(take).toBeGreaterThan(0);
    expect(take).toBeLessThanOrEqual(100);
  });
});
