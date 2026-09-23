import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The census imports the endpoint's own refusal rule, and the controller that
// holds it constructs storage clients and a Prisma client on load. Stub those,
// exactly as documentController.reextractGate.test.ts does, so the REAL rule is
// what runs here.
vi.mock('../src/prismaClient', () => ({ prisma: {} }));
vi.mock('../src/services/storage/supabaseStorage', () => ({ downloadFromSupabase: vi.fn(), uploadToSupabase: vi.fn() }));
vi.mock('../src/services/storage/getSignedFileUrl', () => ({ getSignedFileUrl: vi.fn() }));
vi.mock('../src/services/ingestion/ingestionService', () => ({ IngestionService: class {} }));

import * as core from '../scripts/recoveryCensusCore';
import type { CensusRow, PopulationRow, Section } from '../scripts/recoveryCensusCore';
import { reextractionRefusal } from '../src/controllers/documentController';

// ============================================================================
// THE RECOVERY CENSUS READS NO MONEY AND PUBLISHES NO SMALL GROUP OF PEOPLE.
// ============================================================================
// scripts/recoveryCensus.ts runs against PRODUCTION over other people's
// accounts. Its privacy contract (the header of recoveryCensusCore.ts) is
// enforced by structure; this file proves the structure, and adds source
// checks for the few paths structure cannot reach:
//
//   STRUCTURE, exercised here on synthetic rows, no database:
//     * the runtime shape check rejects any row that is not exactly the
//       allowlisted columns and kinds, including rows shaped like the census
//       query's OWN output, so a column added to the query fails here;
//     * the disclosure gate counts organisations itself and never publishes a
//       cell held by fewer than three other organisations;
//     * report sections can only come from the gate;
//     * nothing can print while the census computes.
//   SOURCE, asserted (the residual, stated in the core's header): the census
//   files open no second database client, run no other query, write nothing,
//   and reach no file or network.
// ============================================================================

const CORE_SRC = readFileSync(join(process.cwd(), 'scripts', 'recoveryCensusCore.ts'), 'utf8');
const MAIN_SRC = readFileSync(join(process.cwd(), 'scripts', 'recoveryCensus.ts'), 'utf8');
const CONTROLLER_SRC = readFileSync(join(process.cwd(), 'src', 'controllers', 'documentController.ts'), 'utf8');

const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

/** The output column aliases of a query's outer SELECT, read off the query object itself. */
function aliasesOf(sql: string): string[] {
  const starts = [...sql.matchAll(/(^|\n)SELECT\n/g)];
  expect(starts.length, 'no outer SELECT found, so no alias could be read').toBeGreaterThan(0);
  const start = starts[starts.length - 1].index!;
  const endAt = sql.indexOf('\nFROM "Document" d', start);
  const select = sql.slice(start, endAt === -1 ? undefined : endAt);
  return [...select.matchAll(/\sAS\s+([a-z_]+),?\s*$/gm)].map((m) => m[1]);
}

const FORBIDDEN_IDENTIFIERS = ['valueNumber', 'valueString', 'valueDate', 'currency', 'originalFileName', 'fileUrl',
  'email', 'name', 'slug', 'User', 'Membership', 'summary', 'normalizedText', 'userId', 'detectedLanguage'];
function forbiddenIn(sql: string): string[] {
  const hits = FORBIDDEN_IDENTIFIERS.filter((id) => new RegExp(`\\b${id}\\b`).test(sql));
  // Text and confidence may be COMPARED, never selected.
  const residue = sql.replace(/"rawText" = ''/g, '').replace(/"overallConfidence" = 0/g, '');
  if (/rawText/.test(residue)) hits.push('rawText (read, not only compared)');
  if (/overallConfidence/.test(residue)) hits.push('overallConfidence (read, not only compared)');
  return hits;
}

const ORGS = 31;
const row = (over: Partial<CensusRow> = {}): CensusRow => ({
  org_key: 1, status: 'NEEDS_REVIEW', document_type: 'UNKNOWN_DOCUMENT_TYPE', text_empty: true, confidence_zero: true,
  upload_month: '2026-06', scan_charged: true, has_user_fact: false, recovered_marker: false,
  org_active_after_last_empty: false, ours: false, control_row: false, ...over,
});
const population = (over: Partial<PopulationRow> = {}): PopulationRow => ({
  documents: 0, facts: 100, organisations: ORGS, our_orgs_found: 3, owner_anchor_docs: 1, owner_anchor_is_ours: true, ...over,
});

/** Every line that states an organisation count, parsed. */
const orgCountsIn = (lines: readonly string[]) =>
  lines.flatMap((l) => [...l.matchAll(/across (\d+) organisations/g)].map((m) => Number(m[1])));

// A small deterministic PRNG so the property tests are reproducible.
function prng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
function randomPopulation(seed: number): CensusRow[] {
  const r = prng(seed);
  const orgs = 1 + Math.floor(r() * 12);
  const rows: CensusRow[] = [];
  for (let o = 1; o <= orgs; o++) {
    const n = Math.floor(r() * 25);
    for (let i = 0; i < n; i++) {
      rows.push(row({
        org_key: o,
        status: ['FAILED', 'NEEDS_REVIEW', 'COMPLETED', 'REJECTED'][Math.floor(r() * 4)],
        document_type: ['UNKNOWN', 'UNKNOWN_DOCUMENT_TYPE', 'INVOICE', 'RECEIPT'][Math.floor(r() * 4)],
        text_empty: r() < 0.6, confidence_zero: r() < 0.6,
        upload_month: `2026-0${3 + Math.floor(r() * 7)}`,
        scan_charged: r() < 0.5, has_user_fact: r() < 0.1, org_active_after_last_empty: o % 2 === 0,
        ours: o <= 2 && r() < 0.5,
      }));
    }
  }
  return rows;
}

describe('the queries select only what the contract allows', () => {
  it('CENSUS_QUERY returns exactly the allowlisted columns', () => {
    expect(aliasesOf(core.CENSUS_QUERY.sql).sort()).toEqual(Object.keys(core.CENSUS_COLUMNS).sort());
  });

  it('POPULATION_QUERY returns exactly the allowlisted columns', () => {
    expect(aliasesOf(core.POPULATION_QUERY.sql).sort()).toEqual(Object.keys(core.POPULATION_COLUMNS).sort());
  });

  it('neither query names a value, a file, a user, a name or an email, and text and confidence are only compared', () => {
    expect(forbiddenIn(core.CENSUS_QUERY.sql)).toEqual([]);
    expect(forbiddenIn(core.POPULATION_QUERY.sql)).toEqual([]);
  });

  it('POSITIVE CONTROL: the scans do see a planted value column, a planted name and a read of the text', () => {
    const planted = 'SELECT\n  d.status AS status,\n  f."valueNumber" AS amount,\n  u.email AS who,\n  d."rawText" AS text\nFROM "Document" d';
    expect(aliasesOf(planted)).toEqual(['status', 'amount', 'who', 'text']);
    expect(forbiddenIn(planted)).toEqual(expect.arrayContaining(['valueNumber', 'email', 'rawText (read, not only compared)']));
    expect(forbiddenIn('SELECT ("rawText" = \'\') AS text_empty')).toEqual([]);
  });
});

describe('the runtime shape check: only allowlisted columns and kinds get in', () => {
  it('a row shaped exactly like CENSUS_QUERY\'s own output passes', () => {
    // Built from the query's aliases, not from the allowlist, so a column added
    // to the query produces a row that must fail here.
    const sample: Record<string, unknown> = { org_key: 2, status: 'FAILED', document_type: 'INVOICE', upload_month: '2026-07' };
    const derived = Object.fromEntries(aliasesOf(core.CENSUS_QUERY.sql).map((a) => [a, a in sample ? sample[a] : typeof (row() as any)[a] === 'boolean' ? false : 1]));
    expect(() => core.assertCensusRows([derived], ORGS)).not.toThrow();
  });

  it.each([
    ['an extra column', { ...row(), amount: 12.5 }],
    ['a missing column', (({ ours, ...rest }) => rest)(row())],
    ['a free-text status', row({ status: 'someone@example.com' })],
    ['a filename as a document type', row({ document_type: 'receipt-2026.jpg' })],
    ['a day-level date', row({ upload_month: '2026-06-14' })],
    ['a non-boolean flag', { ...row(), text_empty: 1 }],
    ['an org_key outside 1..organisations', row({ org_key: ORGS + 1 })],
    ['a zero org_key', row({ org_key: 0 })],
  ])('rejects %s', (_label, bad) => {
    expect(() => core.assertCensusRows([bad], ORGS)).toThrow(core.CensusShapeError);
  });

  it('a shape error names columns, never values', () => {
    try { core.assertCensusRows([{ ...row(), secret_amount: 98765.43 }], ORGS); } catch (e: any) {
      expect(e.message).toContain('secret_amount');
      expect(e.message).not.toContain('98765');
      return;
    }
    throw new Error('the shape check did not fire');
  });

  it('the population row is shape-checked the same way', () => {
    expect(() => core.assertPopulation([population({ documents: 5 })])).not.toThrow();
    expect(() => core.assertPopulation([{ ...population(), total_spend: 10 }])).toThrow(core.CensusShapeError);
  });
});

describe('the disclosure gate: no cell describing other people is published below three organisations', () => {
  it('a lone organisation in a bucket is merged, never printed with its count', () => {
    const rows = [
      ...Array.from({ length: 50 }, () => row({ org_key: 1, upload_month: '2026-06' })),
      row({ org_key: 2, upload_month: '2026-07' }), row({ org_key: 3, upload_month: '2026-07' }), row({ org_key: 4, upload_month: '2026-07' }),
    ];
    const s = core.othersOrdered('by month', rows, (r) => r.upload_month, ['2026-06', '2026-07']);
    expect(s.lines).toEqual(['2026-06 to 2026-07: 53 documents across 4 organisations']);
  });

  it('a split with a value held by fewer than three organisations is pooled or withheld', () => {
    const rows = [row({ org_key: 1, status: 'FAILED' }), ...[2, 3, 4].map((o) => row({ org_key: o, status: 'NEEDS_REVIEW' }))];
    const s = core.othersSplit('by status', rows, (r) => r.status);
    expect(s.lines.join('\n')).not.toMatch(/FAILED/);
    expect(s.lines).toContain('split withheld: a value is held by fewer than three organisations');
  });

  it('grouping other people by organisation publishes no organisation', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ org_key: i + 1 }));
    const s = core.othersSplit('per organisation', rows, (r) => `organisation ${r.org_key}`);
    expect(s.lines).toEqual(['other values, pooled: 10 documents across 10 organisations']);
  });

  it('PROPERTY: across 300 random populations and every grouping, no published cell names fewer than three organisations', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rows = randomPopulation(seed);
      const months = [...new Set(rows.map((r) => r.upload_month))].sort();
      const sections: Section[] = [
        core.othersTotal('t', rows),
        core.othersSplit('status', rows, (r) => r.status),
        core.othersSplit('org', rows, (r) => String(r.org_key)),
        core.othersSplit('type', rows, (r) => r.document_type),
        core.othersOrdered('month', rows, (r) => r.upload_month, months),
        ...core.buildCensus(rows),
      ];
      for (const s of sections) {
        for (const n of orgCountsIn(s.lines)) expect(n, `seed ${seed}, ${s.title}`).toBeGreaterThanOrEqual(core.MIN_ORGS);
      }
    }
  });

  it('our own rows are reported on their own and never mixed into a cell about other people', () => {
    const rows = [row({ org_key: 1, ours: true }), row({ org_key: 1, ours: true }), row({ org_key: 2 })];
    expect(core.ourOwn('ours', rows, () => 'ADMITTED').lines).toEqual(['ours, ADMITTED: 2 documents']);
    expect(core.othersTotal('others', rows).lines).toEqual(['other people: fewer than three organisations']);
  });
});

describe('only the gate can make a report, and nothing prints while the census computes', () => {
  it('render refuses a section the gate did not issue', () => {
    const forged = { title: 'per organisation', lines: ['organisation 7: 22 documents'] } as Section;
    expect(() => core.render([forged])).toThrow(/not produced by the disclosure gate/);
  });

  it('the seal refuses console and stdout, and restores them afterwards', () => {
    expect(() => core.sealOutput(() => console.log('leak'))).toThrow(/outside the disclosure gate/);
    expect(() => core.sealOutput(() => process.stdout.write('leak'))).toThrow(/outside the disclosure gate/);
    expect(typeof console.log).toBe('function');
    expect(() => core.sealOutput(() => 1)).not.toThrow();
  });

  it('runSealed really seals: a census that tries to print fails', () => {
    expect(() => core.runSealed([row()], () => { console.log('leak'); return []; })).toThrow(/outside the disclosure gate/);
  });

  it('the real census computes without writing anything outside the gate', () => {
    for (let seed = 1; seed <= 20; seed++) expect(() => core.runSealed(randomPopulation(seed))).not.toThrow();
  });
});

describe('the report reads no money and says so', () => {
  // Rendered inside each test, so a section the gate did not issue fails a
  // NAMED test instead of breaking the whole file at collection time.
  const renderReport = () => core.render(core.buildCensus(randomPopulation(7)));

  it('the movement figure is replaced by a count, with the amount stated as unknown and not estimated', () => {
    expect(renderReport().join('\n')).toContain('The amount they would add is unknown until they are extracted, and is not estimated.');
  });

  it('no rendered line carries a currency or an amount', () => {
    for (const l of renderReport()) expect(l).not.toMatch(/\b(USD|EUR|SGD|MAD|CAD|SAR|AED|INR|CHF|PHP|GBP)\b|[$€£]|\d+\.\d{2}\b/);
  });
});

describe('controls: the census refuses to report unless every one passes', () => {
  const good = () => [row({ org_key: 1, control_row: true, ours: true }), row({ org_key: 2, status: 'COMPLETED', text_empty: false, confidence_zero: false })];

  it('passes on a healthy population', () => {
    const rows = good();
    expect(core.checkControls(population({ documents: rows.length }), rows).lines[0]).toMatch(/^C1 population/);
  });

  it.each([
    ['C1 an empty database', (rows: CensusRow[]) => [population({ documents: 0, facts: 0 }), rows]],
    ['C1 rows read do not match the count', (rows: CensusRow[]) => [population({ documents: rows.length + 1 }), rows]],
    ['C2 no known empty row', (rows: CensusRow[]) => [population({ documents: rows.length }), rows.map((r) => ({ ...r, control_row: false }))]],
    ['C2 the known row is not empty', (rows: CensusRow[]) => [population({ documents: rows.length }), rows.map((r) => (r.control_row ? { ...r, text_empty: false } : r))]],
    ['C2 the rule refuses the known row', (rows: CensusRow[]) => [population({ documents: rows.length }), rows.map((r) => (r.control_row ? { ...r, status: 'COMPLETED' } : r))]],
    ['C3 everything admitted', (rows: CensusRow[]) => [population({ documents: rows.length }), rows.map((r) => ({ ...r, status: 'FAILED' }))]],
    ['C4 one of our organisations missing', (rows: CensusRow[]) => [population({ documents: rows.length, our_orgs_found: 2 }), rows]],
    ['C4 the owner anchor is not ours', (rows: CensusRow[]) => [population({ documents: rows.length, owner_anchor_is_ours: false }), rows]],
  ])('fails closed on %s', (_label, make) => {
    const [pop, rows] = make(good()) as [PopulationRow, CensusRow[]];
    expect(() => core.checkControls(pop, rows)).toThrow(core.CensusControlError);
  });
});

describe('the census cannot drift from what a real recovery would admit', () => {
  it('the user-authored prefix is the one documentController.ts uses', () => {
    expect(CONTROLLER_SRC).toContain(`const USER_AUTHORED_SPAN_PREFIX = '${core.USER_AUTHORED_SPAN_PREFIX}';`);
  });

  const statuses = ['FAILED', 'NEEDS_REVIEW', 'COMPLETED', 'REJECTED', 'LIMIT_REACHED', 'PROCESSING'];
  const types = ['UNKNOWN', 'UNKNOWN_DOCUMENT_TYPE', 'INVOICE'];

  it('the rule depends on text and confidence only through "empty" and "zero", so the census may pass placeholders', () => {
    for (const status of statuses) for (const documentType of types) for (const user of [false, true]) {
      const a = reextractionRefusal({ status, documentType, rawText: 'x', overallConfidence: 1 }, user);
      const b = reextractionRefusal({ status, documentType, rawText: 'TOTAL 98.21 thank you for shopping', overallConfidence: 0.37 }, user);
      expect(a?.code ?? null, `${status}/${documentType}/${user}`).toBe(b?.code ?? null);
    }
  });

  it('the census asks the imported rule, and agrees with it on every combination', () => {
    for (const status of statuses) for (const document_type of types) for (const has_user_fact of [false, true])
      for (const text_empty of [false, true]) for (const confidence_zero of [false, true]) {
        const r = row({ status, document_type, has_user_fact, text_empty, confidence_zero });
        const direct = reextractionRefusal({ status, documentType: document_type, rawText: text_empty ? '' : 'some text', overallConfidence: confidence_zero ? 0 : 0.9 }, has_user_fact);
        expect(core.refusalOf(r)).toBe(direct?.code ?? null);
      }
  });

  it('the census imports the rule rather than restating it', () => {
    expect(CORE_SRC).toMatch(/import \{ reextractionRefusal \} from '\.\.\/src\/controllers\/documentController';/);
    expect(codeOnly(CORE_SRC)).not.toMatch(/INVALID_SOURCE_STATE|DOCUMENT_HAS_CONTENT|DOCUMENT_HAS_USER_EDITS|DOCUMENT_NOT_SINGLE/);
  });
});

describe('SOURCE (the residual the structure cannot reach): one client, fixed queries, no writes, no files, no network', () => {
  const core_ = codeOnly(CORE_SRC);
  const main_ = codeOnly(MAIN_SRC);

  it('only the runner constructs a database client, and only once', () => {
    expect(core_).not.toMatch(/new PrismaClient/);
    expect(main_.match(/new PrismaClient\(/g) ?? []).toHaveLength(1);
  });

  it('the runner issues exactly the read-only statement, the check, and the two fixed queries', () => {
    const calls = [...main_.matchAll(/\.\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)\b(<[^>]*>)?(`[^`]*`|\([^)]*\))/g)].map((m) => m[0].replace(/<[^>]*>/, ''));
    expect(calls).toEqual([
      '.$executeRaw`SET TRANSACTION READ ONLY`',
      '.$queryRaw`SHOW transaction_read_only`',
      '.$queryRaw(POPULATION_QUERY)',
      '.$queryRaw(CENSUS_QUERY)',
    ]);
    expect(core_).not.toMatch(/\$(queryRaw|executeRaw)/);
  });

  it('no census file calls a write method, touches the filesystem or the network', () => {
    for (const src of [core_, main_]) {
      expect(src).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
      expect(src).not.toMatch(/from '(node:)?(fs|http|https|net|child_process)'|require\('(node:)?(fs|http|https|net|child_process)'\)|fetch\(/);
    }
  });

  it('the core prints nothing itself, and the runner prints only rendered lines and a safe error', () => {
    expect(core_).not.toMatch(/console\.(log|info|warn|error|debug|table|dir|trace)\(/);
    expect(main_.match(/console\.\w+\(/g)).toEqual(['console.log(', 'console.error(']);
    expect(main_).toMatch(/return render\(\[checkControls\(population, rows\), \.\.\.runSealed\(rows\)\]\);/);
  });

  it('POSITIVE CONTROL: the source scans do fire on planted code', () => {
    expect('await tx.document.updateMany({})').toMatch(/\.(updateMany)\s*\(/);
    expect("import { writeFileSync } from 'fs'").toMatch(/from '(node:)?(fs)'/);
    expect(codeOnly('// console.log(x)\nconsole.log(y)').match(/console\.\w+\(/g)).toEqual(['console.log(']);
  });
});
