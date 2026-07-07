import { describe, it, expect } from 'vitest';
import {
  getVendor,
  getAmount,
  getStatus,
  getPrimaryFields,
  getDocTypeLabel,
  getEntityRoleLabel,
  formatFactValue,
} from '../src/lib/searchResultCard';
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

describe('getDocTypeLabel', () => {
  it('maps known canonical types to a TRANSLATED label in each locale (never the raw enum)', () => {
    // English: sentence-case, real translations (not raw uppercase).
    expect(getDocTypeLabel('INVOICE', strings.en as any)).toBe(strings.en.docTypeInvoice);
    expect(getDocTypeLabel('RECEIPT', strings.en as any)).toBe(strings.en.docTypeReceipt);
    expect(getDocTypeLabel('BUSINESS_CARD', strings.en as any)).toBe(strings.en.docTypeBusinessCard);
    expect(getDocTypeLabel('UNKNOWN', strings.en as any)).toBe(strings.en.docTypeUnknown);
    // Case-insensitive on the raw enum.
    expect(getDocTypeLabel('invoice', strings.en as any)).toBe(strings.en.docTypeInvoice);
    // Arabic parity: an Arabic user reads the Arabic label, not English "Invoice".
    expect(getDocTypeLabel('INVOICE', strings.ar as any)).toBe(strings.ar.docTypeInvoice);
    expect(getDocTypeLabel('INVOICE', strings.ar as any)).not.toBe('Invoice');
    // French parity.
    expect(getDocTypeLabel('INVOICE', strings.fr as any)).toBe(strings.fr.docTypeInvoice);
  });
  it('humanizes an unknown / free-form type (never raw uppercase) and returns null when absent', () => {
    // Unknown enum -> humanized real value, not a guess, not raw uppercase.
    expect(getDocTypeLabel('PURCHASE_ORDER', strings.en as any)).toBe('Purchase order');
    expect(getDocTypeLabel('Other', strings.en as any)).toBe('Other');
    expect(getDocTypeLabel('PURCHASE_ORDER', strings.en as any)).not.toContain('_');
    expect(getDocTypeLabel('PURCHASE_ORDER', strings.en as any)).not.toBe('PURCHASE_ORDER');
    // Null / empty -> null (caller hides the line, no placeholder).
    expect(getDocTypeLabel(null, strings.en as any)).toBeNull();
    expect(getDocTypeLabel('', strings.en as any)).toBeNull();
    expect(getDocTypeLabel(undefined, strings.en as any)).toBeNull();
  });
});

describe('getEntityRoleLabel', () => {
  it('maps known roles to a TRANSLATED, sentence-case label in each locale (never the raw enum)', () => {
    expect(getEntityRoleLabel('VENDOR', strings.en as any)).toBe(strings.en.entityRoleVendor);
    expect(getEntityRoleLabel('ISSUER', strings.en as any)).toBe(strings.en.entityRoleIssuer);
    // Case-insensitive on the raw enum.
    expect(getEntityRoleLabel('vendor', strings.en as any)).toBe(strings.en.entityRoleVendor);
    // Arabic parity: an Arabic user reads the Arabic label, not English "Vendor".
    expect(getEntityRoleLabel('VENDOR', strings.ar as any)).toBe(strings.ar.entityRoleVendor);
    expect(getEntityRoleLabel('VENDOR', strings.ar as any)).not.toBe('VENDOR');
    expect(getEntityRoleLabel('ISSUER', strings.fr as any)).toBe(strings.fr.entityRoleIssuer);
  });
  it('humanizes an unknown role (never raw uppercase) and returns "" when absent', () => {
    expect(getEntityRoleLabel('CUSTOMER', strings.en as any)).toBe('Customer');
    expect(getEntityRoleLabel('CUSTOMER', strings.en as any)).not.toBe('CUSTOMER');
    expect(getEntityRoleLabel('CUSTOMER', strings.en as any)).not.toContain('_');
    expect(getEntityRoleLabel('', strings.en as any)).toBe('');
    expect(getEntityRoleLabel(null, strings.en as any)).toBe('');
    expect(getEntityRoleLabel(undefined, strings.en as any)).toBe('');
  });
});

describe('formatFactValue', () => {
  it('preserves a legitimate numeric 0 (the old `valueString || valueNumber` dropped it)', () => {
    // No currency: grouped plain number, still "0" and NOT the empty/placeholder.
    expect(formatFactValue({ valueString: null, valueNumber: 0 }, strings.en as any, 'en')).toBe('0');
    // With a currency: still shows the zero, never blank.
    const withCur = formatFactValue({ valueNumber: 0, currency: 'MAD' }, strings.en as any, 'en');
    expect(withCur).toContain('0');
    expect(withCur).not.toBe(strings.en.notAvailable);
  });
  it('Intl-formats amounts (grouped + currency), like the shared getAmount, not "4280 MAD"', () => {
    const out = formatFactValue({ valueNumber: 4280, currency: 'MAD' }, strings.en as any, 'en');
    expect(out).toContain('4,280');
    expect(out).toContain('MAD');
    expect(out).not.toBe('4280 MAD');
  });
  it('shows a real string value verbatim', () => {
    expect(formatFactValue({ valueString: 'Travel' }, strings.en as any, 'en')).toBe('Travel');
  });
  it('localizes a date value (ISO string / Date), never the raw ISO', () => {
    const fromIso = formatFactValue({ valueDate: '2026-02-08T00:00:00.000Z' }, strings.en as any, 'en');
    expect(fromIso).toContain('2026');
    expect(fromIso).not.toContain('T00:00:00');
    expect(fromIso).not.toContain('2026-02-08T00:00:00.000Z');
    // A non-string valueDate (Date) is handled defensively too.
    const fromDate = formatFactValue({ valueDate: new Date('2026-02-08T00:00:00.000Z') }, strings.en as any, 'en');
    expect(fromDate).toContain('2026');
  });
  it('falls back to a calm placeholder for an empty / invalid value (never a raw ISO or fabricated date)', () => {
    expect(formatFactValue({}, strings.en as any, 'en')).toBe(strings.en.notAvailable);
    expect(formatFactValue({ valueString: '' }, strings.en as any, 'en')).toBe(strings.en.notAvailable);
    expect(formatFactValue({ valueDate: 'not-a-date' }, strings.en as any, 'en')).toBe(strings.en.notAvailable);
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
