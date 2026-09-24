import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// No code path on the ledger home adds amounts, so none can add them across
// currencies. Every figure is /api/ledger's own per-currency total.
// ============================================================================
// Read from source, because the rule is about what the code CAN do, not only
// what one fixture happened to render. The rule: no arithmetic operator
// touches an identifier or property named `total` or `amount`. Receipt counts
// (receiptCount, notYetSorted) may be added: a count means the same in every
// currency. The behavioural twin is in ledgerScreen.test.tsx ("NO figure
// anywhere on the screen is a sum across currencies").
//
// The anti-steering half: the ledger home imports nothing that sells.
// ============================================================================

const SRC = join(process.cwd(), 'src');
const FILES = [
  'lib/ledgerView.ts', 'lib/ledgerTypes.ts', 'screens/LedgerScreen.tsx', 'services/ledgerService.ts',
  'components/ui/CategoryIcon.tsx', 'components/ui/CountChip.tsx', 'components/ui/Panel.tsx',
];

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// An arithmetic operator (not part of =>, ==, a JSX className dash, ++ or --)
// on either side of a name ending in total/amount.
const MONEY = String.raw`(?<![\w$])(?:[\w$]+\.)*[\w$]*(?:total|amount|Total|Amount)(?![\w$])`;
// Binary operators are spaced in this codebase; an unspaced dash is part of a
// name (data-ledger-amount, text-[17px]), not a subtraction.
const OP = String.raw`(?:\+=|-=|\*=|\/=|\s[+\-*/]\s)`;
const MONEY_ARITH = new RegExp(`${MONEY}\\s*${OP}|${OP}\\s*${MONEY}`);

const offenders = (src: string) =>
  stripComments(src)
    .split('\n')
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => MONEY_ARITH.test(line));

describe('the no-sum rule can see a sum (positive controls)', () => {
  it.each([
    'const all = cad.total + usd.total;',
    'sum += line.amount;',
    'const x = rows.reduce((s, r) => s + r.amount, 0);',
    'grand = total - refund;',
    'const t = c.total * rate;',
    'let amount = 0; amount += 5;',
  ])('flags %s', (code) => {
    expect(offenders(code)).toHaveLength(1);
  });

  it.each([
    'receiptCount += line.receiptCount;',
    'return ledger.currencies.reduce((n, c) => n + c.receipts.length, 0);',
    'lines.push({ currency: c.currency, total: line.total });',
    '<Money amount={r.amount} currency={r.currency} />',
    'className="text-[17px] font-bold"',
    '<bdi dir="ltr" data-ledger-amount className={x}>{p.number}</bdi>',
    "const shown = filter ? rows.filter(r => r.amountSource === 'x') : rows;",
  ])('does not flag %s', (code) => {
    expect(offenders(code)).toEqual([]);
  });
});

describe('the ledger home adds no amounts', () => {
  for (const rel of FILES) {
    it(`${rel}: no arithmetic on a total or an amount`, () => {
      const src = readFileSync(join(SRC, rel), 'utf8');
      // The scan read real code, not an empty file.
      expect(src.length).toBeGreaterThan(500);
      expect(offenders(src)).toEqual([]);
    });
  }

  it('the files the rule scans are the ones that render money', () => {
    const screen = readFileSync(join(SRC, 'screens/LedgerScreen.tsx'), 'utf8');
    expect(screen).toMatch(/from '\.\.\/lib\/ledgerView'/);
    expect(screen).toMatch(/from '\.\.\/services\/ledgerService'/);
    // Money reaches the screen only through /api/ledger.
    expect(screen).not.toMatch(/documentService|searchService|fetch\(/);
  });
});

describe('the ledger home sells nothing (native anti-steering)', () => {
  it('imports no paywall, pricing or payment module', () => {
    const screen = stripComments(readFileSync(join(SRC, 'screens/LedgerScreen.tsx'), 'utf8'));
    expect(screen).not.toMatch(/PaywallModal|paddle|pricing|ProWelcome|upgrade|checkout/i);
  });
});
