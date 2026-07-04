import { describe, it, expect } from 'vitest';
import { getVendor, getAmount, getStatus, getPrimaryFields } from '../src/lib/searchResultCard';
import { strings } from '../src/i18n/strings';

// ============================================================================
// Primary-field extraction for the mobile Search card (progressive disclosure)
// ============================================================================
// Guards: vendor/amount pulled from the right entity/fact, status mapped to a
// TRANSLATED label (never the raw enum), and graceful nulls (never fabricated).

const s = strings.en as any;

describe('getVendor', () => {
  it('returns the ISSUER/VENDOR entity canonical name', () => {
    expect(
      getVendor({ documentEntities: [{ role: 'VENDOR', entity: { canonicalName: 'Aurora Studios' } }] })
    ).toBe('Aurora Studios');
    expect(
      getVendor({ documentEntities: [{ role: 'ISSUER', entity: { canonicalName: 'Contoso' } }] })
    ).toBe('Contoso');
  });
  it('returns null when there is no vendor-role entity', () => {
    expect(getVendor({ documentEntities: [{ role: 'CLIENT', entity: { canonicalName: 'X' } }] })).toBeNull();
    expect(getVendor({})).toBeNull();
  });
});

describe('getAmount', () => {
  it('currency-formats the AMOUNT fact (by factType or key)', () => {
    const out = getAmount({ facts: [{ factType: 'AMOUNT', valueNumber: 4280, currency: 'USD' }] }, 'en')!;
    expect(out).toContain('4,280');
    expect(out).toMatch(/\$|USD/);
    const out2 = getAmount({ facts: [{ key: 'AMOUNT', valueNumber: 99, currency: 'EUR' }] }, 'en')!;
    expect(out2).toContain('99');
  });
  it('falls back to a plain number when currency code is invalid', () => {
    const out = getAmount({ facts: [{ factType: 'AMOUNT', valueNumber: 50, currency: 'BADCODE' }] }, 'en')!;
    expect(out).toContain('50');
    expect(out).not.toContain('[object Object]');
  });
  it('returns null when there is no amount fact', () => {
    expect(getAmount({ facts: [{ key: 'DATE', valueDate: '2026-01-01' }] }, 'en')).toBeNull();
    expect(getAmount({}, 'en')).toBeNull();
  });
});

describe('getStatus', () => {
  it('maps known statuses to a translated label + calm dot (never the raw enum)', () => {
    expect(getStatus({ status: 'COMPLETED' }, s)).toMatchObject({ label: s.statusProcessed, dot: 'bg-success' });
    expect(getStatus({ status: 'NEEDS_REVIEW' }, s)).toMatchObject({ label: s.needsReview, dot: 'bg-warning' });
    expect(getStatus({ status: 'REJECTED' }, s)).toMatchObject({ label: s.statusRejected, dot: 'bg-danger' });
    expect(getStatus({ status: 'PROCESSING' }, s)).toMatchObject({ label: s.statusProcessing });
    expect(getStatus({ status: 'FAILED' }, s)).toMatchObject({ label: s.statusFailed });
  });
  it('humanizes an unknown status (still not the raw enum) and returns null when absent', () => {
    const out = getStatus({ status: 'SOME_WEIRD_STATE' }, s)!;
    expect(out.label).toBe('Some weird state');
    expect(out.label).not.toContain('_');
    expect(getStatus({}, s)).toBeNull();
  });
});

describe('getPrimaryFields', () => {
  it('assembles title/vendor/amount/status from a document row', () => {
    const fields = getPrimaryFields(
      {
        originalFileName: 'invoice.pdf',
        status: 'COMPLETED',
        documentEntities: [{ role: 'VENDOR', entity: { canonicalName: 'Aurora' } }],
        facts: [{ factType: 'AMOUNT', valueNumber: 12, currency: 'USD' }],
      },
      s,
      'en'
    );
    expect(fields.title).toBe('invoice.pdf');
    expect(fields.vendor).toBe('Aurora');
    expect(fields.amount).toContain('12');
    expect(fields.status?.label).toBe(s.statusProcessed);
  });
  it('falls back for a title when there is no file name, and never yields [object Object]', () => {
    const fields = getPrimaryFields({ entity: { canonicalName: 'Jane Doe' } }, s, 'en');
    expect(fields.title).toBe('Jane Doe');
    expect(fields.title).not.toContain('[object Object]');
  });
});
