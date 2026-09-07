import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersistenceService } from './persistence';
import { GeminiExtractionResult } from '../../types/schemas';

// ============================================================================
// The scan-charge gate: one document charges the org AT MOST ONCE.
// ============================================================================
// updateDocumentWithExtraction operates on an EXISTING stub row (created
// PROCESSING by uploadController, then filled in by the background flow). It is
// therefore re-runnable against the same documentId, and every run used to hit
//
//     tx.organization.update({ ..., data: { scanCount: { increment: 1 } } })
//
// unconditionally (persistence.ts:149). A second persist on the same document —
// a re-extraction of a stub that already paid — charged the organization again.
// Nothing in the row recorded that it had already been charged, so there was no
// value the increment could have consulted.
//
// Document.scanChargedAt is that value. The increment is now gated on claiming
// it, inside the SAME transaction, so the charge stays atomic with the
// extraction write (the property that was already sound and must not regress).
//
// ---------------------------------------------------------------------------
// WHY THIS FAKE MODELS THE `where` CLAUSES INSTEAD OF RETURNING FIXED VALUES
// ---------------------------------------------------------------------------
// The whole mechanism IS a conditional write. A double that returns
// `{ count: 1 }` from updateMany regardless of the row's state, or that lets
// organization.update succeed regardless of its `where`, would report a green
// suite against an implementation with no gate at all — the same class of
// failure as a log-capture harness that cannot see the field it asserts on.
//
// So the store below honours:
//   * document.updateMany  -> matches on scanChargedAt: null, returns a REAL
//                             count, and only mutates rows that matched;
//   * organization.update  -> evaluates the OR(plan != FREE, scanCount < 10)
//                             predicate and throws P2025 when it fails, which
//                             is what Prisma does and what the LIMIT_REACHED
//                             branch at persistence.ts:163 keys off;
//   * $transaction         -> snapshots before the callback and RESTORES on
//                             throw, so a rolled-back charge is genuinely
//                             observable rather than asserted about.
// The `assertsRealSemantics` test below pins those three behaviours directly,
// so a later edit that hollows out the double fails loudly instead of silently
// making the real tests vacuous.
// ============================================================================

type DocRow = {
  id: string;
  status: string;
  scanChargedAt: Date | null;
  rawText: string;
  processedAt: Date | null;
};
type OrgRow = { id: string; plan: string; scanCount: number };

const DOC_ID = 'doc-1';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';

// The REQUIRED columns of DocumentFact, read off schema.prisma:156-171.
// `id` and `isReviewed` are excluded because they carry @default; valueString,
// valueNumber, valueDate and currency are excluded because they are nullable.
const DOCUMENT_FACT_REQUIRED = [
  'documentId',
  'factType',
  'key',
  'confidence',
  'sourceSpan',
] as const;

function makeDb(initialOrg: Partial<OrgRow> = {}) {
  const state = {
    docs: new Map<string, DocRow>(),
    orgs: new Map<string, OrgRow>(),
    facts: [] as any[],
    docEntities: [] as any[],
  };

  state.docs.set(DOC_ID, {
    id: DOC_ID,
    status: 'PROCESSING',
    scanChargedAt: null,
    rawText: '',
    processedAt: null,
  });
  state.orgs.set(ORG_ID, {
    id: ORG_ID,
    plan: 'FREE',
    scanCount: 0,
    ...initialOrg,
  });

  const snapshot = () => ({
    docs: new Map([...state.docs].map(([k, v]) => [k, { ...v }])),
    orgs: new Map([...state.orgs].map(([k, v]) => [k, { ...v }])),
    facts: state.facts.map((f) => ({ ...f })),
    docEntities: state.docEntities.map((e) => ({ ...e })),
  });
  const restore = (s: ReturnType<typeof snapshot>) => {
    state.docs = s.docs;
    state.orgs = s.orgs;
    state.facts = s.facts;
    state.docEntities = s.docEntities;
  };

  const notFound = () => {
    const e: any = new Error(
      'An operation failed because it depends on one or more records that were required but not found.'
    );
    e.code = 'P2025';
    return e;
  };

  const tx = {
    document: {
      update: async ({ where, data }: any) => {
        const row = state.docs.get(where.id);
        if (!row) throw notFound();
        Object.assign(row, data);
        return { ...row };
      },
      // The conditional claim. Honours `scanChargedAt: null` in the where and
      // returns the real number of rows it touched.
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of state.docs.values()) {
          if (where.id !== undefined && row.id !== where.id) continue;
          if (
            Object.prototype.hasOwnProperty.call(where, 'scanChargedAt') &&
            where.scanChargedAt === null &&
            row.scanChargedAt !== null
          ) {
            continue;
          }
          Object.assign(row, data);
          count++;
        }
        return { count };
      },
    },
    documentFact: {
      findFirst: async ({ where }: any) =>
        state.facts.find(
          (f) => f.documentId === where.documentId && f.key === where.key
        ) ?? null,
      // Enforces the REQUIRED columns of DocumentFact (schema.prisma:156-171).
      //
      // Prisma rejects a create that omits a required field CLIENT-SIDE, before
      // any query reaches Postgres — which is why such a failure never poisons
      // the surrounding transaction and can pass unnoticed indefinitely. A
      // double that stores whatever it is handed cannot model that, and this one
      // did not: persistence.ts:435 has omitted `sourceSpan` since the feature
      // shipped, and this suite stayed green the entire time.
      create: async ({ data }: any) => {
        for (const field of DOCUMENT_FACT_REQUIRED) {
          if (data[field] === undefined || data[field] === null) {
            // Shaped like the real rejection, which reads:
            //   Invalid `tx.documentFact.create()` invocation ...
            //   Argument `sourceSpan` is missing.
            const err: any = new Error(
              'Invalid `tx.documentFact.create()` invocation. ' +
                'Argument `' + field + '` is missing.'
            );
            err.name = 'PrismaClientValidationError';
            throw err;
          }
        }
        state.facts.push({ ...data });
        return { ...data };
      },
      deleteMany: async ({ where }: any) => {
        const keys: string[] = where.key?.in ?? [];
        const before = state.facts.length;
        state.facts = state.facts.filter(
          (f) => !(f.documentId === where.documentId && keys.includes(f.key))
        );
        return { count: before - state.facts.length };
      },
    },
    documentEntity: {
      create: async ({ data }: any) => {
        state.docEntities.push({ ...data });
        return { ...data };
      },
    },
    organization: {
      // Evaluates the real OR predicate and throws P2025 when it fails, which
      // is the signal the LIMIT_REACHED branch depends on.
      update: async ({ where, data }: any) => {
        const row = state.orgs.get(where.id);
        if (!row) throw notFound();
        if (Array.isArray(where.OR)) {
          const ok = where.OR.some((clause: any) => {
            if (clause.plan?.not !== undefined) return row.plan !== clause.plan.not;
            if (clause.scanCount?.lt !== undefined)
              return row.scanCount < clause.scanCount.lt;
            return false;
          });
          if (!ok) throw notFound();
        }
        if (data.scanCount?.increment !== undefined) {
          row.scanCount += data.scanCount.increment;
        }
        return { ...row };
      },
    },
  };

  const prisma: any = {
    $transaction: async (fn: (t: any) => Promise<any>) => {
      const before = snapshot();
      try {
        return await fn(tx);
      } catch (err) {
        restore(before); // real rollback — the charge is atomic or it is nothing
        throw err;
      }
    },
  };

  return {
    prisma,
    tx,
    doc: () => state.docs.get(DOC_ID)!,
    org: () => state.orgs.get(ORG_ID)!,
    facts: () => state.facts,
  };
}

const extraction: GeminiExtractionResult = {
  detectedLanguage: 'en',
  documentType: 'Receipt',
  documentSubtype: 'Grocery',
  rawText:
    'MARKET RECEIPT\nsubtotal 10.00\ntax 2.00\ntotal 12.00\nitem: bread\npayment card',
  summary: 'A grocery receipt.',
  facts: [],
  entities: [],
  overallConfidence: 0.99,
};

function makeService(db: ReturnType<typeof makeDb>) {
  const svc = new PersistenceService(db.prisma);
  // The rule engine reads the DB through its own client; the charge gate does
  // not depend on it. Categorization stays REAL (it is pure + tx-backed).
  (svc as any).ruleEngine = {
    evaluate: vi.fn().mockResolvedValue({ decision: 'ALLOW', reasons: [] }),
  };
  return svc;
}

const persist = (svc: PersistenceService) =>
  svc.updateDocumentWithExtraction(
    DOC_ID,
    USER_ID,
    ORG_ID,
    'org-1/receipt.jpg',
    'receipt.jpg',
    extraction
  );

describe('PersistenceService.updateDocumentWithExtraction — scan charge is once per document', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('the FIRST persist charges the organization exactly once', async () => {
    const db = makeDb();
    await persist(makeService(db));

    expect(db.org().scanCount).toBe(1);
  });

  it('the first persist stamps scanChargedAt on the document', async () => {
    const db = makeDb();
    expect(db.doc().scanChargedAt).toBeNull();

    await persist(makeService(db));

    expect(db.doc().scanChargedAt).toBeInstanceOf(Date);
  });

  it('a SECOND persist on the same document does NOT charge again', async () => {
    const db = makeDb();
    const svc = makeService(db);

    await persist(svc);
    expect(db.org().scanCount).toBe(1); // control: the first one did charge

    await persist(svc); // re-extraction of the same stub

    expect(db.org().scanCount).toBe(1);
  });

  it('the second persist still rewrites the extraction fields (it is a no-op only for the charge)', async () => {
    const db = makeDb();
    const svc = makeService(db);

    await persist(svc);
    const firstStamp = db.doc().scanChargedAt;
    db.doc().rawText = 'clobbered';

    await persist(svc);

    expect(db.doc().rawText).toBe(extraction.rawText);
    // and the original charge instant is preserved, not refreshed
    expect(db.doc().scanChargedAt).toEqual(firstStamp);
  });

  it('a third and fourth persist still leave scanCount at 1', async () => {
    const db = makeDb();
    const svc = makeService(db);

    await persist(svc);
    await persist(svc);
    await persist(svc);
    await persist(svc);

    expect(db.org().scanCount).toBe(1);
  });

  it('when the FREE limit is already reached, the whole transaction rolls back — no charge, no stamp', async () => {
    const db = makeDb({ plan: 'FREE', scanCount: 10 });

    await expect(persist(makeService(db))).rejects.toThrow('LIMIT_REACHED');

    expect(db.org().scanCount).toBe(10);
    expect(db.doc().scanChargedAt).toBeNull();
    // the extraction write is rolled back with it — the charge is atomic with it
    expect(db.doc().status).toBe('PROCESSING');
    expect(db.doc().rawText).toBe('');
  });

  it('a PRO organization is charged once too, and not again', async () => {
    const db = makeDb({ plan: 'PRO', scanCount: 42 });
    const svc = makeService(db);

    await persist(svc);
    expect(db.org().scanCount).toBe(43);

    await persist(svc);
    expect(db.org().scanCount).toBe(43);
  });
});

// ---------------------------------------------------------------------------
// Guard on the guard: if these fail, every test above is vacuous.
// ---------------------------------------------------------------------------
describe('the in-memory double actually models the conditional semantics', () => {
  it('updateMany returns count 0 and mutates nothing once scanChargedAt is set', async () => {
    const db = makeDb();
    const stamp = new Date('2020-01-01T00:00:00.000Z');

    const first = await db.tx.document.updateMany({
      where: { id: DOC_ID, scanChargedAt: null },
      data: { scanChargedAt: stamp },
    });
    expect(first.count).toBe(1);

    const second = await db.tx.document.updateMany({
      where: { id: DOC_ID, scanChargedAt: null },
      data: { scanChargedAt: new Date('2021-01-01T00:00:00.000Z') },
    });
    expect(second.count).toBe(0);
    expect(db.doc().scanChargedAt).toEqual(stamp); // untouched by the no-match
  });

  it('organization.update throws P2025 when the OR predicate fails', async () => {
    const db = makeDb({ plan: 'FREE', scanCount: 10 });

    await expect(
      db.tx.organization.update({
        where: { id: ORG_ID, OR: [{ plan: { not: 'FREE' } }, { scanCount: { lt: 10 } }] },
        data: { scanCount: { increment: 1 } },
      })
    ).rejects.toMatchObject({ code: 'P2025' });
  });

  // ---- the matched pair that proves the required-field check discriminates ----
  //
  // These two must be read together. An always-throwing validator fails the
  // POSITIVE; an always-passing one fails the NEGATIVE. Neither can pass both,
  // so passing both is evidence the check actually distinguishes a valid create
  // from an invalid one, rather than being vacuous in either direction.

  it('POSITIVE CONTROL: a create with all five required fields succeeds and LANDS in the store', async () => {
    const db = makeDb();
    const before = db.facts().length;

    const created = await db.tx.documentFact.create({
      data: {
        documentId: DOC_ID,
        factType: 'CATEGORY',
        key: 'category',
        valueString: 'Groceries',
        confidence: 0.9,
        sourceSpan: 'auto_categorization',
        isReviewed: false,
      },
    });

    expect(created.key).toBe('category');
    expect(db.facts().length).toBe(before + 1);
    expect(db.facts().find((f: any) => f.key === 'category')).toBeTruthy();
  });

  it.each(DOCUMENT_FACT_REQUIRED)(
    'NEGATIVE CONTROL: a create omitting `%s` throws, naming that field',
    async field => {
      const db = makeDb();
      const before = db.facts().length;

      const data: Record<string, unknown> = {
        documentId: DOC_ID,
        factType: 'CATEGORY',
        key: 'category',
        confidence: 0.9,
        sourceSpan: 'auto_categorization',
      };
      delete data[field];

      await expect(db.tx.documentFact.create({ data })).rejects.toThrow(
        new RegExp('`' + field + '` is missing')
      );
      // and nothing was stored on the way out
      expect(db.facts().length).toBe(before);
    }
  );

  it('$transaction restores state when the callback throws', async () => {
    const db = makeDb();

    await expect(
      db.prisma.$transaction(async (t: any) => {
        await t.organization.update({
          where: { id: ORG_ID },
          data: { scanCount: { increment: 5 } },
        });
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(db.org().scanCount).toBe(0);
  });
});

// ===========================================================================
// chargeScan = false — the re-extraction path.
// ===========================================================================
// A re-extraction re-runs the pipeline over a document the user ALREADY has.
// It must not consume a scan. Note what this is NOT: it is not "the row is
// already stamped so the gate skips it". A FAILED row is never stamped —
// every writer of FAILED (persistence.markAsFailed, staleSweepService, the
// uploadController background catch) is reached only AFTER the charge
// transaction rolled back, so the charge never committed and scanChargedAt is
// null. Left to itself the gate would see null, claim it, and charge. The
// caller has to say "do not charge", explicitly, which is what this flag is.
//
// Consequence worth pinning: because no charge happens, scanChargedAt stays
// NULL after a re-extraction. That keeps the invariant honest — the column
// means "this document consumed a scan", and this document did not.
// ===========================================================================
const persistNoCharge = (svc: PersistenceService) =>
  svc.updateDocumentWithExtraction(
    DOC_ID,
    USER_ID,
    ORG_ID,
    'org-1/receipt.jpg',
    'receipt.jpg',
    extraction,
    false // chargeScan
  );

describe('updateDocumentWithExtraction with chargeScan=false — re-extraction never charges', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does NOT increment scanCount on an UNSTAMPED row (the real FAILED-row case)', async () => {
    const db = makeDb({ plan: 'FREE', scanCount: 3 });
    expect(db.doc().scanChargedAt).toBeNull();

    await persistNoCharge(makeService(db));

    expect(db.org().scanCount).toBe(3);
  });

  it('leaves scanChargedAt NULL, so the column keeps meaning "consumed a scan"', async () => {
    const db = makeDb({ plan: 'FREE', scanCount: 3 });

    await persistNoCharge(makeService(db));

    expect(db.doc().scanChargedAt).toBeNull();
  });

  it('does NOT increment scanCount on an ALREADY-STAMPED row either', async () => {
    const db = makeDb({ plan: 'FREE', scanCount: 3 });
    db.doc().scanChargedAt = new Date('2020-01-01T00:00:00.000Z');

    await persistNoCharge(makeService(db));

    expect(db.org().scanCount).toBe(3);
    // and the original stamp is not disturbed
    expect(db.doc().scanChargedAt).toEqual(new Date('2020-01-01T00:00:00.000Z'));
  });

  it('still writes the extraction — it is a no-op for the CHARGE only', async () => {
    const db = makeDb({ plan: 'FREE', scanCount: 3 });

    await persistNoCharge(makeService(db));

    expect(db.doc().rawText).toBe(extraction.rawText);
    expect(db.doc().processedAt).toBeInstanceOf(Date);
  });

  it('is NOT blocked by a FREE org already at its limit — no charge means no limit check', async () => {
    // The whole point: a user who burned their last scan on a document that
    // then FAILED must still be able to recover it. If the limit check ran,
    // recovery would be impossible for exactly the users who need it most.
    const db = makeDb({ plan: 'FREE', scanCount: 10 });

    await expect(persistNoCharge(makeService(db))).resolves.toBeUndefined();

    expect(db.org().scanCount).toBe(10);
    expect(db.doc().rawText).toBe(extraction.rawText);
  });

  it('the default (omitted flag) still charges — this flag cannot silently disarm the upload path', async () => {
    const db = makeDb({ plan: 'FREE', scanCount: 3 });

    await persist(makeService(db)); // no flag passed

    expect(db.org().scanCount).toBe(4);
    expect(db.doc().scanChargedAt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// The auto-categorization fact must actually be WRITTEN.
// ===========================================================================
// categorizeAndSave (persistence.ts:435) is the only DocumentFact.create of the
// five in this file that does not pass `sourceSpan`, which schema.prisma:167
// declares required. Prisma rejects that CLIENT-SIDE, and the method's own
// catch at :447-450 swallows the rejection and returns 'Other' — so the feature
// fails silently on every document and the transaction commits regardless.
//
// This assertion is the red. It is only meaningful on a double that enforces
// the schema's required fields: against the permissive double it passed while
// the feature was completely inert, which is exactly the false green that let
// this survive from day one.
// ===========================================================================
describe('auto-categorization persists a CATEGORY fact', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('writes a CATEGORY/category fact for the document', async () => {
    const db = makeDb();
    await persist(makeService(db));

    const category = db.facts().find((f: any) => f.key === 'category');
    expect(category, 'no CATEGORY fact was written').toBeTruthy();
    expect(category.factType).toBe('CATEGORY');
    expect(category.documentId).toBe(DOC_ID);
  });

  it('the CATEGORY fact carries a sourceSpan, like every other synthesized fact', async () => {
    const db = makeDb();
    await persist(makeService(db));

    const category = db.facts().find((f: any) => f.key === 'category');
    expect(category?.sourceSpan).toBeTruthy();
  });
});
