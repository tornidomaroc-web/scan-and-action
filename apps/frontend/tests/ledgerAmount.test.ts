import { describe, it, expect } from 'vitest';
import { ledgerAmount, ledgerCurrency } from '../src/lib/ledgerAmount';
import { getAmount, getPrimaryFields } from '../src/lib/searchResultCard';
import { strings } from '../src/i18n/strings';

// ============================================================================
// One amount per receipt, the ledger's, on every row.
// ============================================================================
// Measured on production 2026-09-25: 10 receipts carry a manual_amount
// correction; on 2 of them the Queue and Search rows showed the OLD extracted
// amount, because getAmount took the first fact of type AMOUNT. Against
// 35af4d2 the "corrected receipt" cases below fail (the row still shows the
// extraction); the "order" cases prove the fix does not depend on the order
// the endpoint happens to return facts in.
// ============================================================================

const TOTAL = { key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 698.35, currency: 'MAD', confidence: 0.99 };
const MANUAL = { key: 'manual_amount', factType: 'AMOUNT', valueNumber: 689.35 };
const TAX = { key: 'TAX_AMOUNT', factType: 'AMOUNT', valueNumber: 114.89, currency: 'MAD' };

describe('ledgerAmount mirrors ledgerCore rule 2', () => {
  it('the correction beats the extraction, in the extraction\'s currency, whichever comes first', () => {
    expect(ledgerAmount([TOTAL, MANUAL])).toEqual({ amount: 689.35, currency: 'MAD', source: 'corrected' });
    expect(ledgerAmount([MANUAL, TOTAL])).toEqual({ amount: 689.35, currency: 'MAD', source: 'corrected' });
    expect(ledgerAmount([TAX, TOTAL, MANUAL])).toEqual({ amount: 689.35, currency: 'MAD', source: 'corrected' });
  });

  it('with no correction the extraction counts (control), and a tax amount never stands in for the total', () => {
    expect(ledgerAmount([TOTAL])).toEqual({ amount: 698.35, currency: 'MAD', source: 'extracted' });
    expect(ledgerAmount([TAX, TOTAL])).toEqual({ amount: 698.35, currency: 'MAD', source: 'extracted' });
    expect(ledgerAmount([TAX])).toBeNull();
  });

  it('a row from before TOTAL_AMOUNT existed keeps its AMOUNT-typed fact (the old rows still show), never counting it as the ledger would', () => {
    expect(ledgerAmount([{ key: 'amount', factType: 'AMOUNT', valueNumber: 42.07, currency: 'USD' }])).toEqual({ amount: 42.07, currency: 'USD', source: 'extracted' });
    expect(ledgerAmount([{ key: 'amount', factType: 'AMOUNT', valueNumber: 42.07, currency: 'USD' }, MANUAL])).toEqual({ amount: 689.35, currency: 'USD', source: 'corrected' });
  });

  it('a correction on a receipt whose total read no currency is a bare number, said so', () => {
    expect(ledgerAmount([{ ...TOTAL, currency: null }, MANUAL])).toEqual({ amount: 689.35, currency: null, source: 'corrected' });
    expect(ledgerAmount([MANUAL])).toEqual({ amount: 689.35, currency: null, source: 'corrected' });
  });

  it('nothing finite is nothing: NaN, strings and missing facts', () => {
    expect(ledgerAmount([{ key: 'manual_amount', valueNumber: NaN }, TOTAL])).toEqual({ amount: 698.35, currency: 'MAD', source: 'extracted' });
    expect(ledgerAmount([{ key: 'TOTAL_AMOUNT', valueNumber: '12' }])).toBeNull();
    expect(ledgerAmount([])).toBeNull();
    expect(ledgerAmount(undefined)).toBeNull();
  });

  it('the currency is an ISO code or nothing ("TVA" and "د.م." are not currencies)', () => {
    expect(ledgerCurrency(' mad ')).toBe('MAD');
    expect(ledgerCurrency('TVA1')).toBeNull();
    expect(ledgerCurrency('د.م.')).toBeNull();
    expect(ledgerCurrency(null)).toBeNull();
  });
});

describe('the Queue and Search row amount (getAmount) follows it', () => {
  it('a corrected receipt shows the correction with its currency, in either fact order', () => {
    expect(getAmount({ facts: [TOTAL, MANUAL] }, 'en')).toMatch(/^MAD\s689\.35$/);
    expect(getAmount({ facts: [MANUAL, TOTAL] }, 'en')).toMatch(/^MAD\s689\.35$/);
    expect(getAmount({ facts: [TOTAL, MANUAL] }, 'en')).not.toContain('698');
  });

  it('never a bare number when the extraction read a currency (the second failure mode)', () => {
    expect(getAmount({ facts: [MANUAL, TOTAL] }, 'fr')).toContain('MAD');
  });

  it('an uncorrected receipt is unchanged (control), and the primary fields carry the same figure', () => {
    expect(getAmount({ facts: [TOTAL] }, 'en')).toMatch(/^MAD\s698\.35$/);
    expect(getPrimaryFields({ originalFileName: 'x.jpg', facts: [TOTAL, MANUAL] }, strings.en as any, 'en').amount).toMatch(/^MAD\s689\.35$/);
  });

  it('Western digits in Arabic, and the code, never a symbol', () => {
    const ar = getAmount({ facts: [TOTAL, MANUAL] }, 'ar')!;
    expect(ar).toMatch(/689[.,]35/);
    expect(ar).not.toMatch(/[٠-٩]/);
    expect(ar).toContain('MAD');
  });
});
