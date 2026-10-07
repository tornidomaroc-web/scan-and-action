import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ============================================================================
// No backend code reads the fact keys 'EXPENSE_CATEGORY' or 'amount'.
// ============================================================================
// Neither has a writer: the categorizer writes `category`, the adapter's
// 'Total Amount' is stored as TOTAL_AMOUNT, and normalizeFactKey would store a
// raw 'amount' as 'AMOUNT'. Production held zero rows under either key across
// all 391 documents (read-only, 2026-09-23). Every reader of them was a money
// figure that could only ever say zero or "nothing found": the old
// /api/expenses/summary, the monthly_expenses report, group_expenses, the
// ExpenseCategory plan filter, and a fallback in the rule engine. All removed
// with the ledger; this keeps them from coming back.
//
// The scan is a quoted-literal match over every non-test .ts file under src/
// and scripts/, comments skipped. It is proved in both directions below: a
// planted read IS found, and the walk really does cover the tree.
// ============================================================================

const BACKEND = join(__dirname, '..', '..', '..');
const DEAD = /(['"`])(EXPENSE_CATEGORY|amount)\1/;

// A line may be allowed to carry the word when it is not a fact key. Matched on
// the whole line, so any edit to it re-arms. Until 2026-10-05 one line was
// allowed: the review gate's list of English anchor words, searched for in the
// receipt's raw text; that condition is gone (persistence.ts, the review gate),
// and with it the allowance.
const ALLOWED = new Set<string>([]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' || name === 'dist' ? [] : walk(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

function scan(files: { path: string; text: string }[]): string[] {
  const hits: string[] = [];
  for (const { path, text } of files) {
    text.split(/\r?\n/).forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      if (!DEAD.test(line)) return;
      if (ALLOWED.has(`${path}|${line}`)) return;
      hits.push(`${path}:${i + 1}: ${t}`);
    });
  }
  return hits;
}

const tree = () =>
  ['src', 'scripts'].flatMap(d => walk(join(BACKEND, d))).map(p => ({
    path: relative(BACKEND, p).split('\\').join('/'),
    text: readFileSync(p, 'utf8'),
  }));

describe('dead fact keys', () => {
  it('no non-test backend file reads EXPENSE_CATEGORY or amount', () => {
    expect(scan(tree())).toEqual([]);
  });

  it('control: the same scan finds a planted read of each key, in each quoting', () => {
    const planted = [
      { path: 'planted/a.ts', text: "const x = facts.find(f => f.key === 'amount');" },
      { path: 'planted/b.ts', text: 'WHERE cat."key" = \'EXPENSE_CATEGORY\'' },
      { path: 'planted/c.ts', text: 'where: { key: { in: ["amount", "manual_amount"] } }' },
      { path: 'planted/d.ts', text: 'const k = `EXPENSE_CATEGORY`;' },
    ];
    expect(scan(planted)).toHaveLength(4);
    // and the allowance is by exact line, not by file: a second 'amount' in
    // persistence.ts is still caught.
    expect(scan([{ path: 'src/services/ingestion/persistence.ts', text: "f.key === 'amount'" }])).toHaveLength(1);
  });

  it('control: the walk covers the tree, including the files the old readers lived beside', () => {
    const paths = tree().map(f => f.path);
    expect(paths.length).toBeGreaterThan(50);
    for (const p of [
      'src/services/ledger/ledgerCore.ts',
      'src/services/query/queryExecutor.ts',
      'src/services/ruleEngineService.ts',
      'src/services/ingestion/persistence.ts',
      'scripts/ledgerReconcile.ts',
    ]) expect(paths).toContain(p);
    // and every allowed line still exists, so no allowance is stale.
    for (const entry of ALLOWED) {
      const [path, allowedLine] = entry.split('|');
      const file = tree().find(f => f.path === path)!;
      expect(file.text.split(/\r?\n/)).toContain(allowedLine);
    }
  });
});
