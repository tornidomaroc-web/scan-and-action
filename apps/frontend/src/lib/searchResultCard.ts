// ============================================================================
// Primary-field extraction for the mobile Search result card.
// ============================================================================
// The mobile card uses PROGRESSIVE DISCLOSURE: instead of dumping every column
// (the old behavior produced a long, unstructured list with raw enums), it shows
// only the few fields a user needs to identify the record — name, vendor, amount,
// status — and taps through to the document detail route for everything else.
//
// This helper pulls those primaries out of a raw search row (a passthrough of a
// document record). It NEVER fabricates data: a field it cannot find is returned
// as null and simply omitted from the card. Status is mapped to a TRANSLATED
// label (never the raw backend enum).

import { formatCellValue } from './formatCellValue';

export interface CardStatus {
  key: string;
  dot: string; // token bg-* class for the colored dot
  text: string; // token text-* class for the label
  label: string; // already-translated, human-readable label
}

export interface PrimaryFields {
  title: string;
  vendor: string | null;
  amount: string | null;
  status: CardStatus | null;
}

// Minimal shape of the i18n dictionary this helper reads (keeps it React-free).
type Strings = Record<string, string>;

const VENDOR_ROLES = new Set(['ISSUER', 'VENDOR']);

// Known document statuses -> calm colored dot + reused/added i18n label key.
const STATUS_STYLE: Record<string, { dot: string; text: string; labelKey: string }> = {
  COMPLETED: { dot: 'bg-success', text: 'text-success-text', labelKey: 'statusProcessed' },
  NEEDS_REVIEW: { dot: 'bg-warning', text: 'text-warning-text', labelKey: 'needsReview' },
  REJECTED: { dot: 'bg-danger', text: 'text-danger-text', labelKey: 'statusRejected' },
  PROCESSING: { dot: 'bg-accent', text: 'text-ink-tertiary', labelKey: 'statusProcessing' },
  FAILED: { dot: 'bg-danger', text: 'text-danger-text', labelKey: 'statusFailed' },
};

// "SOME_UNMAPPED_STATUS" -> "Some unmapped status" (readable, never the raw enum).
const humanizeEnum = (v: string): string =>
  v
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

const formatCurrency = (value: number, currency: unknown, language: string): string => {
  const locale = language || 'en';
  const code = typeof currency === 'string' ? currency.toUpperCase() : '';
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(value);
    } catch {
      /* invalid currency code -> fall through to a plain number */
    }
  }
  const n = new Intl.NumberFormat(locale).format(value);
  return code ? `${n} ${code}` : n;
};

export const getVendor = (row: any): string | null => {
  const entities = Array.isArray(row?.documentEntities) ? row.documentEntities : [];
  const match = entities.find((e: any) => e && VENDOR_ROLES.has(String(e.role || '').toUpperCase()));
  const name = match?.entity?.canonicalName ?? match?.entity?.name;
  return name != null && name !== '' ? String(name) : null;
};

export const getAmount = (row: any, language: string): string | null => {
  const facts = Array.isArray(row?.facts) ? row.facts : [];
  const amt = facts.find(
    (f: any) => String(f?.factType || f?.key || '').toUpperCase() === 'AMOUNT' && f?.valueNumber != null
  );
  if (!amt) return null;
  return formatCurrency(Number(amt.valueNumber), amt.currency, language);
};

export const getStatus = (row: any, s: Strings): CardStatus | null => {
  const raw = typeof row?.status === 'string' && row.status.trim() ? row.status : null;
  if (!raw) return null;
  const key = raw.toUpperCase();
  const style = STATUS_STYLE[key];
  if (style) {
    return { key, dot: style.dot, text: style.text, label: s[style.labelKey] || humanizeEnum(raw) };
  }
  // Unknown status: readable humanized text, still never the raw enum.
  return { key, dot: 'bg-ink-faint', text: 'text-ink-muted', label: humanizeEnum(raw) };
};

const firstReadable = (row: any, language: string): string | null => {
  for (const [k, v] of Object.entries(row || {})) {
    if (k === 'id') continue;
    const f = formatCellValue(v, k, language);
    if (f) return f;
  }
  return null;
};

export const getPrimaryFields = (row: any, s: Strings, language: string): PrimaryFields => {
  const title =
    (typeof row?.originalFileName === 'string' && row.originalFileName.trim()) ||
    (typeof row?.name === 'string' && row.name.trim()) ||
    (typeof row?.entity?.canonicalName === 'string' && row.entity.canonicalName.trim()) ||
    firstReadable(row, language) ||
    s.noData;
  return {
    title: String(title),
    vendor: getVendor(row),
    amount: getAmount(row, language),
    status: getStatus(row, s),
  };
};
