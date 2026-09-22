import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { classify, type DocRow, type Traces } from '../scripts/extractionWatchClassify';

// ============================================================================
// THE EXTRACTION WATCH IS READ-ONLY, AND JUDGES A FIRST ATTEMPT BY ITS TRACES.
// ============================================================================
// scripts/extractionWatch.ts runs against PRODUCTION. Two things must never
// drift, and neither would be noticed without this file:
//
//   1. It must not be able to write. The database enforces that at run time
//      (SET TRANSACTION READ ONLY, asserted before any read); this holds the
//      source so a write method cannot be added and then only discovered by
//      Postgres refusing it in production.
//
//   2. A recovered document must count as a FAILED first attempt. Re-extraction
//      rewrites a failure into a success, so a predicate on the row's current
//      state undercounts every failure since recovered, and understates more the
//      better recovery works.
// ============================================================================

const SRC = readFileSync(join(process.cwd(), 'scripts', 'extractionWatch.ts'), 'utf8');

/** Source with comments removed: the header DESCRIBES writes it does not make. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
}
const CODE = codeOnly(SRC);

const WRITE_METHOD = /\.(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\s*\(/;
const UNSAFE_RAW = /\$(executeRawUnsafe|queryRawUnsafe)\b/;

describe('the watch cannot write', () => {
  it('calls no Prisma write method', () => {
    expect(CODE).not.toMatch(WRITE_METHOD);
  });

  it('uses no unsafe raw query at all', () => {
    expect(CODE).not.toMatch(UNSAFE_RAW);
  });

  it('its only $executeRaw is the statement that makes the transaction read-only', () => {
    const execs = CODE.match(/\$executeRaw`[^`]*`/g) ?? [];
    expect(execs).toEqual(['$executeRaw`SET TRANSACTION READ ONLY`']);
  });

  it('asserts the transaction is read-only before it reads anything', () => {
    const show = CODE.indexOf('SHOW transaction_read_only');
    const firstRead = CODE.indexOf('FROM "Document"');
    expect(show).toBeGreaterThan(-1);
    expect(firstRead).toBeGreaterThan(show);
    expect(CODE).toMatch(/transaction_read_only !== 'on'/);
  });

  it('POSITIVE CONTROL: the same scan does find a planted write', () => {
    const planted = codeOnly("// prisma.document.update( in a comment is fine\nawait tx.document.update({ where: {} });\nawait tx.$executeRawUnsafe('x');");
    expect(planted).toMatch(WRITE_METHOD);
    expect(planted).toMatch(UNSAFE_RAW);
    expect(codeOnly('// tx.document.update(')).not.toMatch(WRITE_METHOD);
  });

  it('prints no rawText, filename or email: it reads rawText only as a length', () => {
    expect(CODE).toMatch(/length\("rawText"\)/);
    expect(CODE).not.toMatch(/"rawText"\s*(,|FROM|AS\s+"rawText")/);
    expect(CODE).not.toMatch(/originalFileName|email/i);
  });
});

const T0 = new Date('2026-09-15T10:00:00Z');
const doc = (over: Partial<DocRow> = {}): DocRow => ({
  id: '00000000-0000-0000-0000-000000000000',
  organizationId: 'org',
  status: 'COMPLETED',
  documentType: 'RECEIPT',
  rawLen: 400,
  overallConfidence: 0.99,
  uploadedAt: T0,
  processedAt: new Date(T0.getTime() + 20_000),
  ...over,
});
const GAP = 60;

describe('a first attempt is judged by its traces, not by the row today', () => {
  it('a RECOVERED document, full of content now, is a FAILED first attempt with its class', () => {
    const t: Traces = { hasRecovered: true, recovered: 'RATE_LIMITED', hasModel: true };
    const c = classify(doc({ processedAt: new Date(T0.getTime() + 3 * 86400_000) }), t, GAP);
    expect(c).toMatchObject({ outcome: 'FAILED', cls: 'RATE_LIMITED', via: 'recovered', reextracted: true });
  });

  it('a recovery that recorded no class still counts, as UNRECORDED', () => {
    const c = classify(doc(), { hasRecovered: true, recovered: null }, GAP);
    expect(c).toMatchObject({ outcome: 'FAILED', cls: 'UNRECORDED', via: 'recovered' });
  });

  it('a traceless recovery is caught by the clock alone', () => {
    const c = classify(doc({ processedAt: new Date(T0.getTime() + 2 * 86400_000) }), {}, GAP);
    expect(c).toMatchObject({ outcome: 'FAILED', cls: 'UNRECORDED', via: 'clock', reextracted: true });
  });

  it('a stale extraction_error on a recovered-looking row is a failure with that class', () => {
    const c = classify(doc(), { hasError: true, error: 'VENDOR_ERROR' }, GAP);
    expect(c).toMatchObject({ outcome: 'FAILED', cls: 'VENDOR_ERROR', via: 'error' });
  });

  it('an empty row with no trace at all is a failure with no class', () => {
    const c = classify(doc({ rawLen: 0, overallConfidence: 0, status: 'NEEDS_REVIEW', documentType: 'UNKNOWN_DOCUMENT_TYPE' }), {}, GAP);
    expect(c).toMatchObject({ outcome: 'FAILED', cls: 'UNRECORDED', via: 'empty' });
  });

  it('LowConfidence on a row with text stays its own class: a poor document, not a vendor failure', () => {
    const c = classify(doc({ overallConfidence: 0.4 }), { hasError: true, error: 'LowConfidence' }, GAP);
    expect(c).toMatchObject({ outcome: 'FAILED', cls: 'LowConfidence' });
  });

  it('NEGATIVE CONTROL: a clean first-pass success is a success', () => {
    expect(classify(doc(), { hasModel: true }, GAP)).toMatchObject({ outcome: 'SUCCEEDED', reextracted: false });
  });

  it('a first pass that finished inside the threshold is not read as a re-extraction', () => {
    const c = classify(doc({ processedAt: new Date(T0.getTime() + 20 * 60_000) }), {}, GAP);
    expect(c.outcome).toBe('SUCCEEDED');
  });
});

describe('what is not a vendor attempt is kept out of the vendor rate', () => {
  it('LIMIT_REACHED was never attempted', () => {
    expect(classify(doc({ status: 'LIMIT_REACHED', rawLen: 0, overallConfidence: 0 }), {}, GAP).outcome).toBe('NOT_ATTEMPTED');
  });

  it('PROCESSING is unresolved', () => {
    expect(classify(doc({ status: 'PROCESSING', processedAt: null }), {}, GAP).outcome).toBe('UNRESOLVED');
  });

  it('a stub with no extraction_model never reached the persist', () => {
    const c = classify(doc({ documentType: 'UNKNOWN', rawLen: 0, overallConfidence: 0, status: 'NEEDS_REVIEW' }), {}, GAP);
    expect(c.outcome).toBe('NEVER_PERSISTED');
  });

  it('a stub that DID run extraction, with no error, is the delivery witness', () => {
    const c = classify(doc({ documentType: 'UNKNOWN', rawLen: 0, overallConfidence: 0, status: 'NEEDS_REVIEW' }), { hasModel: true }, GAP);
    expect(c).toMatchObject({ outcome: 'DELIVERY_LOST', via: 'witness' });
  });

  it('a recorded delivery_error is a delivery loss, whatever else is on the row', () => {
    const c = classify(doc({ documentType: 'UNKNOWN', rawLen: 0, overallConfidence: 0 }), { hasDelivery: true, delivery: 'PrismaClientKnownRequestError', hasModel: true }, GAP);
    expect(c).toMatchObject({ outcome: 'DELIVERY_LOST', cls: 'PrismaClientKnownRequestError', via: 'delivery' });
  });
});
