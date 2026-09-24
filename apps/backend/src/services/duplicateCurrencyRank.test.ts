import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Which copy of one receipt stays counted, and that every change re-checks
// the whole group (duplicateRule.ts, duplicateGroupRecheck.ts).
// ============================================================================
// Everything here goes through the real entry points: RuleEngineService
// .evaluate, DocumentController.updateStatus and IngestionService
// .processUploadAsync, against an in-memory store that answers the queries
// they send. The file imports nothing that main (4b4987e) lacks, so the same
// file runs against main and shows where the behaviour differs; see the PR.
// ============================================================================

interface Fact { key: string; valueString: string | null; valueNumber: number | null; valueDate: Date | null; currency: string | null; sourceSpan: string }
interface Row { id: string; organizationId: string; status: string; uploadedAt: Date; summary: string | null; vendor: string | null; facts: Fact[] }

const { db, fake, byId, entitiesOf } = vi.hoisted(() => {
  const db = { docs: [] as Row[] };
  
  const entitiesOf = (d: Row) =>
    d.vendor ? [{ confidence: 0.99, role: 'ISSUER', entity: { entityType: 'VENDOR', canonicalName: d.vendor, displayName: d.vendor } }] : [];
  
  function nameMatch(name: string, cond: any): boolean {
    return cond.mode === 'insensitive' ? name.toLowerCase() === String(cond.equals).toLowerCase() : name === cond.equals;
  }
  function entityMatch(ent: { entityType: string; canonicalName: string }, w: any): boolean {
    if (!w) return true;
    if (w.entityType !== undefined && ent.entityType !== w.entityType) return false;
    if (w.canonicalName && !nameMatch(ent.canonicalName, w.canonicalName)) return false;
    if (w.OR && !w.OR.some((o: any) => nameMatch(ent.canonicalName, o.canonicalName))) return false;
    return true;
  }
  function docMatch(d: Row, w: any = {}): boolean {
    if (typeof w.id === 'string' && d.id !== w.id) return false;
    if (w.id?.not !== undefined && d.id === w.id.not) return false;
    if (w.organizationId !== undefined && d.organizationId !== w.organizationId) return false;
    if (typeof w.status === 'string' && d.status !== w.status) return false;
    if (w.status?.in && !w.status.in.includes(d.status)) return false;
    if (w.uploadedAt?.lt && !(d.uploadedAt < w.uploadedAt.lt)) return false;
    const es = w.documentEntities?.some?.entity;
    if (es && !entitiesOf(d).some(de => entityMatch(de.entity, es))) return false;
    const fs = w.facts?.some;
    if (fs && !d.facts.some(f => (!fs.key?.in || fs.key.in.includes(f.key)) && (fs.valueNumber === undefined || f.valueNumber === fs.valueNumber))) return false;
    return true;
  }
  function shape(d: Row, args: any = {}) {
    const keys: string[] | undefined = args.select?.facts?.where?.key?.in ?? args.include?.facts?.where?.key?.in;
    const entWhere = args.select?.documentEntities?.where?.entity;
    return {
      id: d.id, organizationId: d.organizationId, status: d.status, uploadedAt: d.uploadedAt, summary: d.summary,
      facts: d.facts.filter(f => !keys || keys.includes(f.key)).map(f => ({ ...f })),
      documentEntities: entitiesOf(d).filter(de => !entWhere || entityMatch(de.entity, entWhere)),
    };
  }
  const byId = (id: string) => db.docs.find(d => d.id === id)!;
  
  const fake: any = {
    document: {
      findFirst: async (a: any) => { const d = db.docs.find(x => docMatch(x, a.where)); return d ? shape(d, a) : null; },
      findUnique: async (a: any) => { const d = db.docs.find(x => x.id === a.where.id); return d ? shape(d, a) : null; },
      findMany: async (a: any) => db.docs.filter(d => docMatch(d, a.where)).map(d => shape(d, a)),
      update: async (a: any) => { const d = byId(a.where.id); Object.assign(d, a.data); return shape(d); },
      updateMany: async (a: any) => { const hit = db.docs.filter(d => docMatch(d, a.where)); hit.forEach(d => Object.assign(d, a.data)); return { count: hit.length }; },
    },
    documentFact: {
      deleteMany: async ({ where }: any) => {
        const d = byId(where.documentId);
        const drop = (k: string) => (typeof where.key === 'string' ? k === where.key : where.key?.in ? where.key.in.includes(k) : true);
        d.facts = d.facts.filter(f => !drop(f.key));
      },
      create: async ({ data }: any) => {
        byId(data.documentId).facts.push({
          key: data.key, valueString: data.valueString ?? null, valueNumber: data.valueNumber ?? null,
          valueDate: data.valueDate ?? null, currency: data.currency ?? null, sourceSpan: data.sourceSpan,
        });
      },
    },
    documentEntity: {
      findMany: async ({ where }: any) =>
        entitiesOf(byId(where.documentId)).filter(de => entityMatch(de.entity, where.entity)).map(de => ({ entity: de.entity })),
    },
    $transaction: async (fn: any) => fn(fake),
    $executeRaw: async () => 1,
  };
  return { db, fake, byId, entitiesOf };
});

vi.mock('../prismaClient', () => ({ prisma: fake }));
vi.mock('./storage/getSignedFileUrl', () => ({ getSignedFileUrl: vi.fn() }));
vi.mock('./storage/supabaseStorage', () => ({ uploadToSupabase: vi.fn(), downloadFromSupabase: vi.fn() }));

import { RuleEngineService } from './ruleEngineService';
import { IngestionService } from './ingestion/ingestionService';
import { DocumentController } from '../controllers/documentController';
import { planDuplicateReevaluation } from './duplicateReevaluation';
import { buildLedger } from './ledger/ledgerCore';

const ORG = 'org-1';
const DUP = 'Possible duplicate expense';
const f = (key: string, p: Partial<Fact> = {}): Fact => ({ key, valueString: null, valueNumber: null, valueDate: null, currency: null, sourceSpan: 'fixture', ...p });

function row(id: string, o: { at: string; amount?: number; manual?: number; cur?: string | null; vendor?: string; status?: string; reason?: string; kept?: boolean; date?: string }): Row {
  const facts: Fact[] = [f('TRANSACTION_DATE', { valueDate: new Date(`${o.date ?? '2026-05-29'}T00:00:00Z`) })];
  if (o.amount !== undefined) facts.push(f('TOTAL_AMOUNT', { valueNumber: o.amount, currency: o.cur === undefined ? 'USD' : o.cur }));
  if (o.manual !== undefined) facts.push(f('manual_amount', { valueNumber: o.manual }));
  if (o.reason) {
    facts.push(f('decision', { valueString: o.reason.includes(DUP) || o.reason.includes('food') ? 'FLAGGED' : 'NEEDS_REVIEW' }));
    facts.push(f('decision_reason', { valueString: o.reason }));
  }
  if (o.kept) facts.push(f('review_action', { valueString: 'marked_valid' }));
  return { id, organizationId: ORG, status: o.status ?? 'COMPLETED', uploadedAt: new Date(o.at), summary: null, vendor: o.vendor ?? 'BRIGHTPATH ANALYTICS', facts };
}

const isFlagged = (id: string) => (byId(id).facts.find(x => x.key === 'decision_reason')?.valueString ?? '').includes(DUP);
const flaggedIds = () => db.docs.filter(d => isFlagged(d.id)).map(d => d.id).sort();

/** Judge every stored copy with the engine, as ingestion does, and store the verdicts. */
async function evaluateAll() {
  const engine = new RuleEngineService(fake);
  const verdicts: [string, string[]][] = [];
  for (const d of db.docs) {
    const r = await engine.evaluate(d.id, d.organizationId, d.facts, d.vendor);
    verdicts.push([d.id, r.reasons]);
  }
  for (const [id, reasons] of verdicts) {
    const d = byId(id);
    d.facts = d.facts.filter(x => x.key !== 'decision' && x.key !== 'decision_reason');
    if (reasons.length) d.facts.push(f('decision_reason', { valueString: reasons.join(', ') }));
  }
}

function ledger(month = '2026-05') {
  const l = buildLedger(db.docs.map(d => ({ id: d.id, status: d.status, uploadedAt: d.uploadedAt, merchant: d.vendor, facts: d.facts })), month, 'UTC');
  return l.currencies.map(c => `${c.currency ?? '???'} ${c.total} (${c.receipts.map(r => r.documentId).join(',')})`);
}

const res = () => ({ statusCode: 0, body: undefined as any, status(c: number) { this.statusCode = c; return this; }, json(p: any) { this.body = p; return this; } }) as any;

beforeEach(() => {
  db.docs = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the copy that stays counted: most specific currency, then earliest', () => {
  it('BRIGHTPATH: a CAD copy uploaded first and two USD copies keep CAD', async () => {
    db.docs = [
      row('bp-usd-2', { at: '2026-06-03T10:00:00Z', amount: 7282.31 }),
      row('bp-cad', { at: '2026-06-01T10:00:00Z', amount: 7282.31, cur: 'CAD' }),
      row('bp-usd-1', { at: '2026-06-02T10:00:00Z', amount: 7282.31 }),
    ];
    await evaluateAll();
    expect(flaggedIds()).toEqual(['bp-usd-1', 'bp-usd-2']);
    expect(ledger()).toEqual(['CAD 7282.31 (bp-cad)']);
  });

  it('Flame Kitchen: a USD copy first and an INR copy later keep INR and flag the USD copy', async () => {
    // Both copies carry the owner's correction to 290; the currency is the
    // extracted total's (ledger rule 5).
    db.docs = [
      row('fk-usd', { at: '2026-03-10T10:00:00Z', amount: 290, manual: 290, vendor: 'FLAME KITCHEN RESTAURANT', date: '2025-05-21' }),
      row('fk-inr', { at: '2026-03-11T10:00:00Z', amount: 290, manual: 290, cur: 'INR', vendor: 'FLAME KITCHEN RESTAURANT', date: '2025-05-21' }),
    ];
    await evaluateAll();
    expect(flaggedIds()).toEqual(['fk-usd']);
    expect(ledger('2025-05')).toEqual(['INR 290 (fk-inr)']);
  });

  it('only USD and no-currency copies: the earliest USD copy stays counted, not the earlier no-currency one', async () => {
    db.docs = [
      row('none-first', { at: '2026-02-01T10:00:00Z', amount: 16.5, cur: null, vendor: 'SHOP NAME' }),
      row('usd-a', { at: '2026-02-02T10:00:00Z', amount: 16.5, vendor: 'SHOP NAME' }),
      row('usd-b', { at: '2026-02-03T10:00:00Z', amount: 16.5, vendor: 'SHOP NAME' }),
      row('unknown-word', { at: '2026-02-04T10:00:00Z', amount: 16.5, cur: 'UNKNOWN', vendor: 'SHOP NAME' }),
    ];
    await evaluateAll();
    expect(flaggedIds()).toEqual(['none-first', 'unknown-word', 'usd-b']);
    expect(ledger()).toEqual(['USD 16.5 (usd-a)']);
  });
});

describe('any change to one copy re-checks its whole group', () => {
  it('rejecting the copy that stays counted moves the count to the next copy instead of dropping the receipt', async () => {
    db.docs = [
      row('orig', { at: '2026-02-01T10:00:00Z', amount: 467.85, cur: 'MAD', vendor: 'BIM MAROC', reason: 'Amount exceeds threshold' }),
      row('copy-1', { at: '2026-02-02T10:00:00Z', amount: 467.85, cur: 'MAD', vendor: 'BIM MAROC', reason: `Amount exceeds threshold, ${DUP}` }),
      row('copy-2', { at: '2026-02-03T10:00:00Z', amount: 467.85, cur: 'MAD', vendor: 'BIM MAROC', reason: `Amount exceeds threshold, ${DUP}` }),
    ];
    expect(ledger()).toEqual(['MAD 467.85 (orig)']);

    const r = res();
    await DocumentController.updateStatus({ params: { id: 'orig' }, body: { status: 'REJECTED' }, user: { organizationId: ORG } } as any, r, vi.fn());
    expect(r.statusCode).toBe(200);

    expect(ledger()).toEqual(['MAD 467.85 (copy-1)']);
    // copy-1's decision is recomputed from the reasons that remain.
    expect(byId('copy-1').facts.find(x => x.key === 'decision')?.valueString).toBe('NEEDS_REVIEW');
    // The rejected row itself is left as it was: it counts nowhere, and a
    // duplicate banner on a document he rejected would be noise.
    expect(flaggedIds()).toEqual(['copy-2']);
    expect(byId('orig').status).toBe('REJECTED');

    // And back: accepting it again hands the count back to the earliest copy.
    await DocumentController.updateStatus({ params: { id: 'orig' }, body: { status: 'COMPLETED' }, user: { organizationId: ORG } } as any, res(), vi.fn());
    expect(ledger()).toEqual(['MAD 467.85 (orig)']);
    expect(flaggedIds()).toEqual(['copy-1', 'copy-2']);
  });

  it('a new upload that outranks the copy that stays counted takes the count, and the old copy is flagged', async () => {
    db.docs = [
      row('old-usd', { at: '2026-06-01T10:00:00Z', amount: 7282.31 }),
      { id: 'new-cad', organizationId: ORG, status: 'PROCESSING', uploadedAt: new Date('2026-06-05T10:00:00Z'), summary: null, vendor: null, facts: [] },
    ];
    await evaluateAll();
    expect(ledger()).toEqual(['USD 7282.31 (old-usd)']);

    const svc = new IngestionService(fake);
    (svc as any).geminiAdapter = {
      isSingleDocument: async () => true,
      extractFromImage: async () => ({ overallConfidence: 0.99, facts: [], entities: [] }),
    };
    // The persist, as persistence.ts does it: the row, its facts and vendor,
    // then the rule engine's verdict on this document alone.
    (svc as any).persistenceService = {
      recordExtractionModel: async () => {},
      updateDocumentWithExtraction: async (id: string, _u: string, org: string) => {
        const d = byId(id);
        d.status = 'COMPLETED';
        d.vendor = 'BRIGHTPATH ANALYTICS';
        d.facts = [
          f('TRANSACTION_DATE', { valueDate: new Date('2026-05-29T00:00:00Z') }),
          f('TOTAL_AMOUNT', { valueNumber: 7282.31, currency: 'CAD' }),
        ];
        const r = await new RuleEngineService(fake).evaluate(id, org, d.facts, d.vendor);
        if (r.reasons.length) d.facts.push(f('decision_reason', { valueString: r.reasons.join(', ') }));
      },
    };
    await svc.processUploadAsync('new-cad', 'user-1', ORG, Buffer.from('x'), 'image/jpeg', 'bp.jpg', 'path/bp.jpg');

    expect(flaggedIds()).toEqual(['old-usd']);
    expect(ledger()).toEqual(['CAD 7282.31 (new-cad)']);
  });

  it('after any of those changes, re-planning the whole store plans nothing: the live re-check and the script agree', async () => {
    db.docs = [
      row('a', { at: '2026-02-01T10:00:00Z', amount: 50, cur: 'MAD', vendor: 'BIM MAROC' }),
      row('b', { at: '2026-02-02T10:00:00Z', amount: 50, cur: 'MAD', vendor: 'BIM MAROC', reason: DUP }),
    ];
    await DocumentController.updateStatus({ params: { id: 'a' }, body: { status: 'REJECTED' }, user: { organizationId: ORG } } as any, res(), vi.fn());
    const docs = db.docs.map(d => ({ id: d.id, organizationId: d.organizationId, status: d.status, uploadedAt: d.uploadedAt, vendors: d.vendor ? [d.vendor] : [], facts: d.facts }));
    expect(planDuplicateReevaluation(docs).changes).toEqual([]);
  });
});

describe('the owner\'s word outranks a currency reading, so nothing counts twice', () => {
  it('a copy he marked valid while it was NOT a duplicate stays the one counted when a better-read copy arrives', async () => {
    // "Mark valid" is offered on any FLAGGED row, and "High food expense"
    // flags too. Were the new CAD copy to take over, the old one would be
    // flagged AND kept, and the ledger would count the receipt twice.
    db.docs = [
      row('meal-usd', { at: '2026-05-01T10:00:00Z', amount: 80, vendor: 'CHEZ LOUIS', reason: 'High food expense', kept: true }),
      row('meal-cad', { at: '2026-05-02T10:00:00Z', amount: 80, cur: 'CAD', vendor: 'CHEZ LOUIS' }),
    ];
    await evaluateAll();
    expect(flaggedIds()).toEqual(['meal-cad']);
    expect(ledger()).toEqual(['USD 80 (meal-usd)']);
  });

  it('a copy he KEPT as a duplicate never takes the count: the receipt it was kept beside stays counted too', async () => {
    db.docs = [
      row('first-usd', { at: '2026-05-01T10:00:00Z', amount: 30, vendor: 'TAXI' }),
      row('kept-cad', { at: '2026-05-02T10:00:00Z', amount: 30, cur: 'CAD', vendor: 'TAXI', reason: DUP, kept: true }),
    ];
    await evaluateAll();
    expect(flaggedIds()).toEqual(['kept-cad']);
    expect(ledger()).toEqual(['CAD 30 (kept-cad)', 'USD 30 (first-usd)']);
  });
});
