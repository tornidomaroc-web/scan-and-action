import { describe, it, expect } from 'vitest';
import { RuleEngineService } from './ruleEngineService';
import { buildLedger, LedgerDocInput } from './ledger/ledgerCore';

// ============================================================================
// Rule D: only LATER copies are duplicates, and only of a COUNTED original.
// ============================================================================
// These drive the real RuleEngineService.evaluate against an in-memory store
// that answers the where-clauses the rule sends: the old findFirst shape and
// the new findMany shape alike. So the same file runs against the rule on
// main (25ba096) and shows where the behaviour differs; see the PR for that
// run. Nothing here stubs the answer to "is this a duplicate".
// ============================================================================

interface StoredDoc {
  id: string;
  organizationId: string;
  status: string;
  uploadedAt: Date;
  summary: string | null;
  documentEntities: { entity: { entityType: string; canonicalName: string } }[];
  facts: { key: string; valueNumber: number | null; valueString?: string | null; currency: string | null }[];
}

function matches(d: StoredDoc, where: any): boolean {
  if (where.organizationId !== undefined && d.organizationId !== where.organizationId) return false;
  if (where.id?.not !== undefined && d.id === where.id.not) return false;
  if (where.status?.in && !where.status.in.includes(d.status)) return false;
  const ent = where.documentEntities?.some?.entity;
  if (ent) {
    const hit = d.documentEntities.some(de =>
      (ent.entityType === undefined || de.entity.entityType === ent.entityType) &&
      (ent.canonicalName === undefined ||
        (ent.canonicalName.mode === 'insensitive'
          ? de.entity.canonicalName.toLowerCase() === ent.canonicalName.equals.toLowerCase()
          : de.entity.canonicalName === ent.canonicalName.equals)));
    if (!hit) return false;
  }
  const fs = where.facts?.some;
  if (fs) {
    const hit = d.facts.some(f => (!fs.key?.in || fs.key.in.includes(f.key)) && (fs.valueNumber === undefined || f.valueNumber === fs.valueNumber));
    if (!hit) return false;
  }
  return true;
}

function store(docs: StoredDoc[]) {
  return {
    document: {
      findUnique: async ({ where }: any) => {
        const d = docs.find(x => x.id === where.id);
        return d ? { summary: d.summary, uploadedAt: d.uploadedAt } : null;
      },
      findFirst: async ({ where }: any) => docs.find(d => matches(d, where)) ?? null,
      findMany: async ({ where }: any) => docs.filter(d => matches(d, where)),
    },
  } as any;
}

const ORG = 'org-1';
let seq = 0;
function doc(id: string, o: { at: string; status?: string; amount?: number; manual?: number; cur?: string | null; vendor?: string; kept?: boolean }): StoredDoc {
  seq++;
  const facts: StoredDoc['facts'] = [];
  if (o.amount !== undefined) facts.push({ key: 'TOTAL_AMOUNT', valueNumber: o.amount, currency: o.cur === undefined ? 'MAD' : o.cur });
  if (o.manual !== undefined) facts.push({ key: 'manual_amount', valueNumber: o.manual, currency: null });
  if (o.kept) facts.push({ key: 'review_action', valueNumber: null, valueString: 'marked_valid', currency: null });
  return {
    id, organizationId: ORG, status: o.status ?? 'COMPLETED', uploadedAt: new Date(o.at), summary: null,
    documentEntities: [{ entity: { entityType: 'VENDOR', canonicalName: o.vendor ?? 'MARJANE' } }],
    facts,
  };
}

/** Evaluate every stored document as the engine would, and name the flagged ones. */
async function flagged(docs: StoredDoc[]): Promise<string[]> {
  const engine = new RuleEngineService(store(docs));
  const out: string[] = [];
  for (const d of docs) {
    const r = await engine.evaluate(d.id, d.organizationId, d.facts, d.documentEntities[0]?.entity.canonicalName ?? null);
    if (r.reasons.includes('Possible duplicate expense')) out.push(d.id);
  }
  return out.sort();
}

describe('Rule D flags later copies only', () => {
  it('three identical copies: the first survives, the later two are flagged', async () => {
    const docs = [
      doc('c3', { at: '2026-02-03T10:00:00Z', amount: 467.85 }),
      doc('c1', { at: '2026-02-01T10:00:00Z', amount: 467.85 }),
      doc('c2', { at: '2026-02-02T10:00:00Z', amount: 467.85 }),
    ];
    expect(await flagged(docs)).toEqual(['c2', 'c3']);
  });

  it('a tie on upload time is broken by id: the smaller id is the original', async () => {
    const at = '2026-02-01T10:00:00.000Z';
    const docs = [doc('b-later', { at, amount: 50 }), doc('a-first', { at, amount: 50 })];
    expect(await flagged(docs)).toEqual(['b-later']);
  });

  it('an excluded earliest copy is not an original: a valid later copy is the receipt', async () => {
    // Ruling on objection 1: only a COMPLETED or NEEDS_REVIEW document can be
    // the original. The REJECTED first upload is not an expense; B is.
    const docs = [
      doc('a-rejected', { at: '2026-02-01T10:00:00Z', amount: 120, status: 'REJECTED' }),
      doc('b-valid', { at: '2026-02-02T10:00:00Z', amount: 120 }),
      doc('c-copy', { at: '2026-02-03T10:00:00Z', amount: 120 }),
      doc('f-failed', { at: '2026-01-15T10:00:00Z', amount: 120, status: 'FAILED' }),
    ];
    const flags = await flagged(docs);
    expect(flags).not.toContain('b-valid');
    expect(flags).toContain('c-copy');
  });

  it('a kept duplicate stays flagged and stays counted', async () => {
    const docs = [
      doc('k1', { at: '2026-02-01T10:00:00Z', amount: 30 }),
      doc('k2', { at: '2026-02-02T10:00:00Z', amount: 30, kept: true }),
      doc('k3', { at: '2026-02-03T10:00:00Z', amount: 30 }),
    ];
    const flags = await flagged(docs);
    expect(flags).toEqual(['k2', 'k3']);
    // The ledger, given those flags: k1 original, k2 kept, k3 excluded. 30 + 30 by hand.
    const ledger = buildLedger(docs.map((d): LedgerDocInput => ({
      id: d.id, status: d.status, uploadedAt: d.uploadedAt, merchant: null,
      facts: [
        ...d.facts.map(f => ({ key: f.key, valueString: f.valueString ?? null, valueNumber: f.valueNumber, valueDate: null, currency: f.currency, sourceSpan: 't' })),
        ...(flags.includes(d.id) ? [{ key: 'decision_reason', valueString: 'Possible duplicate expense', valueNumber: null, valueDate: null, currency: null, sourceSpan: 't' }] : []),
      ],
    })), '2026-02', 'UTC');
    expect(ledger.currencies[0].total).toBe(60);
    expect(ledger.currencies[0].receipts.map(r => r.documentId).sort()).toEqual(['k1', 'k2']);
    expect(ledger.excluded.duplicate).toBe(1);
  });

  it('a new upload is still flagged against an existing receipt', async () => {
    const docs = [
      doc('old', { at: '2026-01-10T10:00:00Z', amount: 99.9 }),
      doc('new', { at: '2026-09-24T08:00:00Z', amount: 99.9 }),
    ];
    expect(await flagged(docs)).toEqual(['new']);
  });

  it('a corrected original owns its corrected figure, not the extracted one', async () => {
    // 71.11 extracted, corrected to 85 (a real row in the owner's data): a
    // later 71.11 is not its copy; a later 85 is.
    const docs = [
      doc('corr', { at: '2026-03-01T10:00:00Z', amount: 71.11, manual: 85, cur: 'USD' }),
      doc('at-7111', { at: '2026-03-02T10:00:00Z', amount: 71.11, cur: 'USD' }),
      doc('at-85', { at: '2026-03-03T10:00:00Z', amount: 85, cur: 'USD' }),
    ];
    expect(await flagged(docs)).toEqual(['at-85']);
  });

  it('a copy read in another currency is still a copy (currency is not compared)', async () => {
    // The owner's BRIGHTPATH ANALYTICS 7282.31: one receipt, extracted once as
    // CAD and twice as USD. Comparing currency would count it twice.
    const docs = [
      doc('cad', { at: '2026-09-08T18:03:00Z', amount: 7282.31, cur: 'CAD' }),
      doc('usd1', { at: '2026-09-09T00:41:00Z', amount: 7282.31, cur: 'USD' }),
      doc('usd2', { at: '2026-09-09T01:52:00Z', amount: 7282.31, cur: 'USD' }),
    ];
    expect(await flagged(docs)).toEqual(['usd1', 'usd2']);
  });

  it('CONTROL: another vendor, or another organisation, is never a copy', async () => {
    const other = doc('other-org', { at: '2026-01-01T10:00:00Z', amount: 10 });
    other.organizationId = 'org-2';
    const docs = [
      other,
      doc('v1', { at: '2026-01-02T10:00:00Z', amount: 10, vendor: 'ACIMA' }),
      doc('v2', { at: '2026-01-03T10:00:00Z', amount: 10 }),
    ];
    expect(await flagged(docs)).toEqual([]);
  });
});
