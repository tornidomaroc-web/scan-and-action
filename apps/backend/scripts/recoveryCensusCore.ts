/**
 * RECOVERY CENSUS, the pure half: the queries, the shape check, the disclosure
 * gate and the report. No database handle and no console live here.
 * scripts/recoveryCensus.ts runs the queries and prints what this returns.
 *
 * WHAT IT IS FOR. Documents whose extraction failed are still empty in users'
 * accounts. This counts which of them the re-extract endpoint would admit, whose
 * they are, and how active those accounts are, so that a recovery can be
 * decided without guessing. It changes nothing and reads no money.
 *
 * THE PRIVACY CONTRACT, ruled 2026-09-23 and enforced by structure, not by
 * discipline:
 *   1. NO MONEY, NO NAMES, NO IDS, NO DAY-LEVEL DATES. The queries select only
 *      booleans, status and type codes, months and an opaque organisation key.
 *      Every returned row is checked against that allowlist at runtime
 *      (assertCensusRows) before anything else sees it, so a column added to a
 *      query throws instead of flowing into the report.
 *   2. THE SMALL-BUCKET RULE. Other people's data reaches the report only
 *      through the gate below. The gate counts organisations itself, from the
 *      opaque keys, and never publishes a cell held by fewer than MIN_ORGS
 *      organisations: ordered buckets merge into a neighbour, other splits are
 *      withheld. Report sections are branded by the gate, and render() refuses
 *      any section the gate did not issue.
 *   3. NOTHING PRINTS WHILE THE CENSUS COMPUTES. runSealed() replaces console
 *      and stdout with functions that throw, so a helper that tries to print a
 *      row fails the run instead of leaking it.
 *   4. OUR OWN ROWS ARE REPORTED SEPARATELY. The owner's organisations and the
 *      review account are ours, so they skip the small-bucket rule and are
 *      never mixed into a cell that describes other people.
 *
 * WHAT THE STRUCTURE CANNOT STOP, said so no one reads more into it: code that
 * deliberately opens its own database client or writes to a file or the
 * network is outside it, and so is a value disguised under an allowed column
 * name and type. tests/recoveryCensus.test.ts scans these files for the first
 * two; nothing can see the third, which is why the queries stay small and fixed.
 */
import { Prisma } from '@prisma/client';
import { reextractionRefusal } from '../src/controllers/documentController';

// ── who is "us" ───────────────────────────────────────────────────────────────
// Organisation id prefixes this census treats as OURS: the owner's two
// organisations and the review/test account, as WORK-QUEUE.md records them.
// C4 fails the run unless each prefix matches exactly one organisation.
export const OUR_ORG_PREFIXES: readonly string[] = ['d8b34ee3', '5ce3e185', '22d51116'];
/** A document the owner uploaded himself on 2026-09-23. C4: its organisation is ours. */
export const OWNER_ANCHOR_DOC_PREFIX = 'e27a839b';
/** The deliberately malformed upload: empty, and admitted. C2's known empty row. */
export const CONTROL_EMPTY_DOC_PREFIX = '24c3ea41';
/** Restated from documentController.ts, where it is not exported. A test pins it to that file. */
export const USER_AUTHORED_SPAN_PREFIX = 'user_';
/** The small-bucket rule: no cell describing other people is published below this many organisations. */
export const MIN_ORGS = 3;

// ── the only two queries ──────────────────────────────────────────────────────
// Every output column is on its own line, `<expression> AS <alias>`, so the test
// can read the aliases straight off this object. rawText and overallConfidence
// are compared, never selected.
export const POPULATION_QUERY = Prisma.sql`
SELECT
  (SELECT count(*) FROM "Document")::int AS documents,
  (SELECT count(*) FROM "DocumentFact")::int AS facts,
  (SELECT count(*) FROM "Organization")::int AS organisations,
  (SELECT count(*) FROM "Organization" o WHERE left(o.id::text, 8) = ANY(${[...OUR_ORG_PREFIXES]}))::int AS our_orgs_found,
  (SELECT count(*) FROM "Document" a WHERE left(a.id::text, 8) = ${OWNER_ANCHOR_DOC_PREFIX})::int AS owner_anchor_docs,
  EXISTS (SELECT 1 FROM "Document" a WHERE left(a.id::text, 8) = ${OWNER_ANCHOR_DOC_PREFIX} AND left(a."organizationId"::text, 8) = ANY(${[...OUR_ORG_PREFIXES]})) AS owner_anchor_is_ours
`;

export const CENSUS_QUERY = Prisma.sql`
WITH org_last AS (
  SELECT "organizationId", max("uploadedAt") AS last_upload FROM "Document" GROUP BY 1
), org_last_empty AS (
  SELECT "organizationId", max("uploadedAt") AS last_empty FROM "Document"
  WHERE "rawText" = '' AND "overallConfidence" = 0 GROUP BY 1
)
SELECT
  dense_rank() OVER (ORDER BY d."organizationId")::int AS org_key,
  d.status AS status,
  d."documentType" AS document_type,
  (d."rawText" = '') AS text_empty,
  (d."overallConfidence" = 0) AS confidence_zero,
  to_char(d."uploadedAt", 'YYYY-MM') AS upload_month,
  (d."scanChargedAt" IS NOT NULL) AS scan_charged,
  EXISTS (SELECT 1 FROM "DocumentFact" f WHERE f."documentId" = d.id AND starts_with(f."sourceSpan", ${USER_AUTHORED_SPAN_PREFIX})) AS has_user_fact,
  EXISTS (SELECT 1 FROM "DocumentFact" f WHERE f."documentId" = d.id AND f.key = 'extraction_recovered') AS recovered_marker,
  COALESCE(ol.last_upload > ole.last_empty, false) AS org_active_after_last_empty,
  (left(d."organizationId"::text, 8) = ANY(${[...OUR_ORG_PREFIXES]})) AS ours,
  (left(d.id::text, 8) = ${CONTROL_EMPTY_DOC_PREFIX}) AS control_row
FROM "Document" d
JOIN org_last ol ON ol."organizationId" = d."organizationId"
LEFT JOIN org_last_empty ole ON ole."organizationId" = d."organizationId"
`;

// ── the shapes that may come back, checked at runtime ────────────────────────
export interface PopulationRow {
  documents: number;
  facts: number;
  organisations: number;
  our_orgs_found: number;
  owner_anchor_docs: number;
  owner_anchor_is_ours: boolean;
}

export interface CensusRow {
  org_key: number;
  status: string;
  document_type: string;
  text_empty: boolean;
  confidence_zero: boolean;
  upload_month: string;
  scan_charged: boolean;
  has_user_fact: boolean;
  recovered_marker: boolean;
  org_active_after_last_empty: boolean;
  ours: boolean;
  control_row: boolean;
}

const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
const isBool = (v: unknown) => typeof v === 'boolean';
// Codes only: an uppercase word with underscores. A name, an email, a filename
// or a sentence cannot pass for one.
const isCode = (v: unknown) => typeof v === 'string' && /^[A-Z][A-Z_]{0,39}$/.test(v);
// A month and nothing finer.
const isMonth = (v: unknown) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export const POPULATION_COLUMNS: Record<keyof PopulationRow, (v: unknown) => boolean> = {
  documents: isCount,
  facts: isCount,
  organisations: isCount,
  our_orgs_found: isCount,
  owner_anchor_docs: isCount,
  owner_anchor_is_ours: isBool,
};

/** org_key is checked separately: it must also fall inside 1..organisations. */
export const CENSUS_COLUMNS: Record<keyof CensusRow, (v: unknown) => boolean> = {
  org_key: (v) => Number.isInteger(v) && (v as number) >= 1,
  status: isCode,
  document_type: isCode,
  text_empty: isBool,
  confidence_zero: isBool,
  upload_month: isMonth,
  scan_charged: isBool,
  has_user_fact: isBool,
  recovered_marker: isBool,
  org_active_after_last_empty: isBool,
  ours: isBool,
  control_row: isBool,
};

export class CensusShapeError extends Error {}

function assertShape(row: unknown, columns: Record<string, (v: unknown) => boolean>, what: string) {
  if (typeof row !== 'object' || row === null) throw new CensusShapeError(`${what}: not a row`);
  const keys = Object.keys(row).sort();
  const allowed = Object.keys(columns).sort();
  const extra = keys.filter((k) => !allowed.includes(k));
  const missing = allowed.filter((k) => !keys.includes(k));
  // Column NAMES only in the message, never values: a failing value is exactly
  // what must not be printed.
  if (extra.length || missing.length) {
    throw new CensusShapeError(`${what}: columns outside the allowlist [${extra.join(', ')}], missing [${missing.join(', ')}]`);
  }
  for (const k of allowed) {
    if (!columns[k]((row as Record<string, unknown>)[k])) throw new CensusShapeError(`${what}: column ${k} is not of its allowed kind`);
  }
}

export function assertPopulation(rows: unknown): PopulationRow {
  if (!Array.isArray(rows) || rows.length !== 1) throw new CensusShapeError('population: expected exactly one row');
  assertShape(rows[0], POPULATION_COLUMNS, 'population');
  return rows[0] as PopulationRow;
}

export function assertCensusRows(rows: unknown, organisations: number): CensusRow[] {
  if (!Array.isArray(rows)) throw new CensusShapeError('census: not a list of rows');
  for (const row of rows) {
    assertShape(row, CENSUS_COLUMNS, 'census');
    if ((row as CensusRow).org_key > organisations) throw new CensusShapeError('census: org_key is outside 1..organisations');
  }
  return rows as CensusRow[];
}

// ── the disclosure gate ───────────────────────────────────────────────────────
// A Section can only be made here. render() refuses anything not in `issued`,
// so a report line cannot be assembled around the gate.
export interface Section { readonly title: string; readonly lines: readonly string[] }
const issued = new WeakSet<object>();

function section(title: string, lines: string[]): Section {
  const s = Object.freeze({ title, lines: Object.freeze([...lines]) });
  issued.add(s);
  return s;
}

const othersOf = (rows: readonly CensusRow[]) => rows.filter((r) => !r.ours);
const oursOf = (rows: readonly CensusRow[]) => rows.filter((r) => r.ours);
const orgCount = (rows: readonly CensusRow[]) => new Set(rows.map((r) => r.org_key)).size;

/** One cell of other people's data, published only if enough organisations hold it. */
function othersCell(label: string, rows: readonly CensusRow[]): string {
  const orgs = orgCount(rows);
  return orgs >= MIN_ORGS
    ? `${label}: ${rows.length} documents across ${orgs} organisations`
    : `${label}: fewer than three organisations`;
}

/** Other people's rows, as one total. */
export function othersTotal(title: string, rows: readonly CensusRow[]): Section {
  return section(title, [othersCell('other people', othersOf(rows))]);
}

/**
 * Other people's rows split by an unordered value. Values held by fewer than
 * MIN_ORGS organisations are pooled into one cell; if the pool itself is below
 * the threshold the split is withheld and only the total is published, because
 * the total minus the published cells would give the small cell away.
 */
export function othersSplit(title: string, rows: readonly CensusRow[], valueOf: (r: CensusRow) => string): Section {
  const others = othersOf(rows);
  const groups = new Map<string, CensusRow[]>();
  for (const r of others) {
    const v = valueOf(r);
    groups.set(v, [...(groups.get(v) ?? []), r]);
  }
  const big = [...groups.entries()].filter(([, g]) => orgCount(g) >= MIN_ORGS).sort(([a], [b]) => a.localeCompare(b));
  const pooled = [...groups.entries()].filter(([, g]) => orgCount(g) < MIN_ORGS).flatMap(([, g]) => g);
  if (pooled.length > 0 && orgCount(pooled) < MIN_ORGS) {
    return section(title, [othersCell('other people, all values', others), 'split withheld: a value is held by fewer than three organisations']);
  }
  const lines = big.map(([v, g]) => othersCell(v, g));
  if (pooled.length > 0) lines.push(othersCell('other values, pooled', pooled));
  return section(title, lines.length ? lines : [othersCell('other people', others)]);
}

/**
 * Other people's rows in ORDERED buckets (months, size ranges). A bucket held by
 * fewer than MIN_ORGS organisations merges with its smaller neighbour until every
 * published bucket clears the threshold.
 */
export function othersOrdered(
  title: string,
  rows: readonly CensusRow[],
  bucketOf: (r: CensusRow) => string,
  order: readonly string[],
): Section {
  const others = othersOf(rows);
  let cells = order
    .map((label) => ({ first: label, last: label, rows: others.filter((r) => bucketOf(r) === label) }))
    .filter((c) => c.rows.length > 0);
  while (cells.length > 1 && cells.some((c) => orgCount(c.rows) < MIN_ORGS)) {
    const i = cells.reduce((m, c, k) => (orgCount(c.rows) < orgCount(cells[m].rows) ? k : m), 0);
    const j = i === 0 ? 1 : i === cells.length - 1 ? i - 1
      : orgCount(cells[i - 1].rows) <= orgCount(cells[i + 1].rows) ? i - 1 : i + 1;
    const [a, b] = i < j ? [cells[i], cells[j]] : [cells[j], cells[i]];
    cells = [...cells.slice(0, Math.min(i, j)), { first: a.first, last: b.last, rows: [...a.rows, ...b.rows] }, ...cells.slice(Math.max(i, j) + 1)];
  }
  const label = (c: { first: string; last: string }) => (c.first === c.last ? c.first : `${c.first} to ${c.last}`);
  return section(title, cells.length ? cells.map((c) => othersCell(label(c), c.rows)) : ['other people: none']);
}

/** Our own rows only. Exempt from the small-bucket rule because they are ours. */
export function ourOwn(title: string, rows: readonly CensusRow[], valueOf: (r: CensusRow) => string): Section {
  const ours = oursOf(rows);
  const counts = new Map<string, number>();
  for (const r of ours) counts.set(valueOf(r), (counts.get(valueOf(r)) ?? 0) + 1);
  const lines = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([v, n]) => `ours, ${v}: ${n} documents`);
  return section(title, lines.length ? lines : ['ours: none']);
}

/** Global counts that describe no organisation: the controls. */
function statement(title: string, lines: string[]): Section {
  return section(title, lines);
}

export function render(sections: readonly Section[]): string[] {
  const out: string[] = [];
  for (const s of sections) {
    if (!issued.has(s)) throw new Error('a report section was not produced by the disclosure gate; nothing is printed');
    out.push('', s.title, ...s.lines.map((l) => `  ${l}`));
  }
  return out;
}

// ── nothing prints while the census computes ─────────────────────────────────
export function sealOutput<T>(fn: () => T): T {
  const c = console as unknown as Record<string, unknown>;
  const names = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table', 'dir'];
  const saved = names.map((n) => c[n]);
  const out = process.stdout.write;
  const err = process.stderr.write;
  const refuse = () => { throw new Error('the census tried to write output outside the disclosure gate'); };
  for (const n of names) c[n] = refuse;
  process.stdout.write = refuse as typeof process.stdout.write;
  process.stderr.write = refuse as typeof process.stderr.write;
  try {
    return fn();
  } finally {
    names.forEach((n, i) => { c[n] = saved[i]; });
    process.stdout.write = out;
    process.stderr.write = err;
  }
}

// ── the census ────────────────────────────────────────────────────────────────
// The refusal rule sees what it would see in production except the text itself:
// an empty text is passed as '', a non-empty one as this placeholder, and a test
// pins that the rule's answer does not depend on which non-empty text it gets.
const NON_EMPTY_TEXT = 'x';
const NON_ZERO_CONFIDENCE = 1;

export function refusalOf(r: CensusRow): string | null {
  const refusal = reextractionRefusal(
    {
      status: r.status,
      documentType: r.document_type,
      rawText: r.text_empty ? '' : NON_EMPTY_TEXT,
      overallConfidence: r.confidence_zero ? 0 : NON_ZERO_CONFIDENCE,
    },
    r.has_user_fact,
  );
  return refusal ? refusal.code : null;
}

const SIZE_ORDER = ['1 document', '2 to 5 documents', '6 to 20 documents', '21 or more documents'];
const sizeLabel = (n: number) => (n === 1 ? SIZE_ORDER[0] : n <= 5 ? SIZE_ORDER[1] : n <= 20 ? SIZE_ORDER[2] : SIZE_ORDER[3]);

export function buildCensus(rows: readonly CensusRow[]): Section[] {
  const admitted = rows.filter((r) => refusalOf(r) === null);
  const refused = rows.filter((r) => refusalOf(r) !== null);
  const emptyAdmitted = admitted.filter((r) => r.text_empty && r.confidence_zero);

  const perOrg = new Map<number, number>();
  for (const r of othersOf(admitted)) perOrg.set(r.org_key, (perOrg.get(r.org_key) ?? 0) + 1);
  const months = [...new Set(othersOf(admitted).map((r) => r.upload_month))].sort();

  return [
    othersTotal('Documents in the empty shape (no text, confidence 0), other people', rows.filter((r) => r.text_empty && r.confidence_zero)),
    othersTotal('Admitted by the re-extract endpoint\'s own rule (reextractionRefusal), other people', admitted),
    othersSplit('Refused by that rule, by refusal code, other people', refused, (r) => refusalOf(r) as string),
    othersTotal(
      'Would begin counting toward their organisation\'s totals if re-extracted: admitted and holding no text. The amount they would add is unknown until they are extracted, and is not estimated.',
      emptyAdmitted,
    ),
    othersOrdered('Other people\'s organisations by how many admitted documents each holds', admitted, (r) => sizeLabel(perOrg.get(r.org_key) ?? 0), SIZE_ORDER),
    othersSplit('Admitted, by whether the organisation uploaded anything after its last empty document', admitted,
      (r) => (r.org_active_after_last_empty ? 'uploaded after its last empty document' : 'no upload since its last empty document')),
    othersOrdered('Admitted, by upload month', admitted, (r) => r.upload_month, months),
    othersSplit('Admitted, by whether the upload was charged a scan', admitted, (r) => (r.scan_charged ? 'charged a scan' : 'not charged')),
    othersTotal('Documents already recovered through the retry button (an extraction_recovered marker)', rows.filter((r) => r.recovered_marker)),
    ourOwn('Our own organisations (the owner\'s two and the review account): admission', rows, (r) => refusalOf(r) ?? 'ADMITTED'),
  ];
}

/** The census computation, with output sealed. `build` is injectable only so the seal can be tested. */
export function runSealed(rows: readonly CensusRow[], build: (rows: readonly CensusRow[]) => Section[] = buildCensus): Section[] {
  return sealOutput(() => build(rows));
}

// ── controls: no rate is printed unless every one passes ─────────────────────
export class CensusControlError extends Error {}

export function checkControls(pop: PopulationRow, rows: readonly CensusRow[]): Section {
  const fail = (m: string): never => { throw new CensusControlError(m); };
  if (!(pop.documents > 0 && pop.facts > 0 && pop.organisations > 0)) fail('C1 the database is empty or is not the one the backend uses');
  if (rows.length !== pop.documents) fail(`C1 read ${rows.length} rows but counted ${pop.documents} documents`);
  const control = rows.filter((r) => r.control_row);
  if (control.length !== 1) fail(`C2 expected exactly one known empty row, found ${control.length}`);
  if (!(control[0].text_empty && control[0].confidence_zero)) fail('C2 the known empty row is not empty');
  if (refusalOf(control[0]) !== null) fail('C2 the admission rule refuses the known empty row');
  const nAdmitted = rows.filter((r) => refusalOf(r) === null).length;
  if (!(nAdmitted > 0 && nAdmitted < rows.length)) fail(`C3 the admission rule is degenerate: ${nAdmitted} of ${rows.length} admitted`);
  if (pop.our_orgs_found !== OUR_ORG_PREFIXES.length) fail(`C4 expected ${OUR_ORG_PREFIXES.length} of our organisations, found ${pop.our_orgs_found}`);
  if (!(pop.owner_anchor_docs === 1 && pop.owner_anchor_is_ours)) fail('C4 the owner\'s own anchor document is missing or not in one of our organisations');
  return statement('Controls, all passed', [
    `C1 population: ${pop.documents} documents, ${pop.facts} facts, ${pop.organisations} organisations`,
    'C2 the known empty row is empty and the admission rule admits it',
    `C3 the admission rule discriminates: ${nAdmitted} admitted, ${rows.length - nAdmitted} refused`,
    `C4 our ${OUR_ORG_PREFIXES.length} organisations found, and the owner's anchor document is in one of them`,
    'Privacy: no money, names, ids or day-level dates are read; cells held by fewer than three other organisations are not published',
  ]);
}
