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

import { formatCellValue, formatDateValue } from './formatCellValue';

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
  // Prefer the human-readable name over the normalized canonicalName matching
  // key. `displayName` is set by the DTO (Queue path); `aliases[0]` covers the
  // raw search-executor rows that are not DTO-mapped; canonicalName / name
  // remain as a last-resort fallback so a missing display name still shows
  // something real, never nothing. The canonicalName value itself is unchanged.
  const e = match?.entity;
  const name = e?.displayName ?? e?.aliases?.[0] ?? e?.canonicalName ?? e?.name;
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

// Known canonical document-type enums -> i18n label key. Kept next to getStatus
// because it is the same pattern: map a raw backend enum to a TRANSLATED,
// sentence-case label, and fall back to a humanized rendering of the real value
// for anything unmapped (e.g. the free-form "Other" / "UNKNOWN" the extractor
// emits). It NEVER fabricates: an unknown type shows its own humanized value, not
// a guess. Shared so Queue / Detail / Dashboard can render types identically.
// BOTH unknown spellings are real and reach the client:
//   'UNKNOWN'                -> written directly by uploadController on create
//   'UNKNOWN_DOCUMENT_TYPE'  -> emitted by normalizationService when the extracted
//                               type matches no entry in DOCUMENT_TYPE_MAP
// Mapping both is a correctness fix, not a convenience: renaming the key would
// leave every existing 'UNKNOWN' row falling through to humanizeEnum.
const DOC_TYPE_LABEL_KEY: Record<string, string> = {
  INVOICE: 'docTypeInvoice',
  RECEIPT: 'docTypeReceipt',
  BUSINESS_CARD: 'docTypeBusinessCard',
  APPOINTMENT: 'docTypeAppointment',
  UNKNOWN: 'docTypeUnknown',
  UNKNOWN_DOCUMENT_TYPE: 'docTypeUnknown',
};

export const getDocTypeLabel = (rawType: unknown, s: Strings): string | null => {
  const raw = typeof rawType === 'string' && rawType.trim() ? rawType.trim() : null;
  if (!raw) return null;
  const key = DOC_TYPE_LABEL_KEY[raw.toUpperCase()];
  // Known enum -> translated label; unknown/free-form -> humanized real value.
  return (key && s[key]) || humanizeEnum(raw);
};

// Graph-relationship entity roles (VENDOR / ISSUER / ...) -> translated,
// sentence-case label. Same contract as getStatus / getDocTypeLabel: a known
// enum maps to its i18n label, anything unknown is humanized from the real
// value (never a guess, never the raw uppercase enum). Returns '' only for a
// genuinely absent role so the caller renders nothing rather than a placeholder.
const ENTITY_ROLE_LABEL_KEY: Record<string, string> = {
  VENDOR: 'entityRoleVendor',
  ISSUER: 'entityRoleIssuer',
};

export const getEntityRoleLabel = (rawRole: unknown, s: Strings): string => {
  const raw = typeof rawRole === 'string' && rawRole.trim() ? rawRole.trim() : '';
  if (!raw) return '';
  const key = ENTITY_ROLE_LABEL_KEY[raw.toUpperCase()];
  return (key && s[key]) || humanizeEnum(raw);
};

// Localize a single extracted fact's value for the Detail facts table. It reads
// the fact's own value columns in a deliberate order and NEVER fabricates:
//   - a real string value is shown verbatim,
//   - a numeric value is Intl-formatted (grouped, and currency-formatted when a
//     currency code is present) exactly like the shared getAmount, so a
//     legitimate 0 is preserved (the old `valueString || valueNumber` dropped it
//     because 0 is falsy) and amounts read localized instead of "4280 MAD",
//   - a date value is localized via the shared date path (handles ISO string,
//     epoch number, or Date), never a raw "2026-02-08T00:00:00.000Z",
//   - a genuinely empty / invalid value becomes a calm placeholder.
// The amount stays plain document data here; it is never styled as a price.
export const formatFactValue = (fact: any, s: Strings, language: string): string => {
  if (fact?.valueString != null && String(fact.valueString) !== '') {
    return String(fact.valueString);
  }
  if (fact?.valueNumber != null) {
    return formatCurrency(Number(fact.valueNumber), fact.currency, language);
  }
  if (fact?.valueDate != null) {
    return formatDateValue(fact.valueDate, language) ?? s.notAvailable;
  }
  return s.notAvailable;
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
