// ============================================================================
// Safe table cell-value formatting for the Search results table.
// ============================================================================
// The /search "table" output is a PURE PASSTHROUGH of raw document rows, so a
// cell can be a primitive, an ISO date string, an object, or an ARRAY of objects
// (e.g. `facts` -> [{ key, valueString, valueNumber, currency, ... }],
// `documentEntities` -> [{ role, entity: { canonicalName } }]). Rendering those
// directly produced the unreadable "[object Object]" cells.
//
// This helper turns any value into a readable string. It NEVER fabricates data —
// it only formats what is actually present — and returns `null` for a genuinely
// empty value so the caller can show a muted placeholder instead of a blank or
// "[object Object]".

// Matches an ISO date ("2026-03-01") or datetime ("2026-03-01T10:00:00Z").
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]|$)/;

// "EXPENSE_CATEGORY" / "valueString" -> "expense category" / "value string".
const humanizeKey = (k: string): string =>
  k
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();

// Localize a date value into a readable "short" date, or `null` when the value
// is genuinely empty / not a real date. Accepts an ISO string, an epoch number,
// or a Date (defensive: a fact's `valueDate` can arrive as any of these), so
// callers get one localized date path instead of stringifying a raw ISO. It
// NEVER fabricates: an unparseable value returns null so the caller can show a
// calm placeholder rather than a raw ISO string or an invented date.
export const formatDateValue = (value: unknown, locale: string): string | null => {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value as string | number);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
};

// Table-cell date path: same localization, but an unparseable ISO-shaped string
// falls back to the raw value (the passthrough table would rather show the
// original text than a placeholder).
const formatDate = (value: string, locale: string): string => formatDateValue(value, locale) ?? value;

// Pull the most human-meaningful label out of a single object (an entity row, a
// fact row, or an arbitrary record). Guarantees it never returns "[object Object]".
const summarizeObject = (obj: Record<string, any>, locale: string): string | null => {
  if (!obj) return null;

  // documentEntities row: { role, entity: { aliases | displayName | canonicalName | name } }.
  // Prefer the human-readable name (aliases[0] / displayName) over the normalized
  // canonicalName matching key, so the search table matches the card/chip/queue.
  const entity = obj.entity;
  if (entity && typeof entity === 'object') {
    const name = entity.aliases?.[0] ?? entity.displayName ?? entity.canonicalName ?? entity.name;
    if (name != null && name !== '') {
      return obj.role ? `${String(name)} (${humanizeKey(String(obj.role))})` : String(name);
    }
  }

  // Direct name-like fields.
  for (const f of ['canonicalName', 'name', 'displayName', 'label', 'title']) {
    if (obj[f] != null && obj[f] !== '') return String(obj[f]);
  }

  // fact row: { key, valueString | valueNumber | valueDate, currency }.
  if (obj.key != null) {
    const raw =
      obj.valueString ?? (obj.valueNumber != null ? obj.valueNumber : undefined) ?? obj.valueDate;
    if (raw != null && raw !== '') {
      let v = typeof raw === 'string' && ISO_DATE.test(raw) ? formatDate(raw, locale) : String(raw);
      if (obj.currency && obj.valueNumber != null) v = `${v} ${obj.currency}`;
      return `${humanizeKey(String(obj.key))}: ${v}`;
    }
    return humanizeKey(String(obj.key));
  }

  // Last resort: the first primitive field as "key: value" (never [object Object]).
  for (const [k, v] of Object.entries(obj)) {
    if (v != null && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
      return `${humanizeKey(k)}: ${String(v)}`;
    }
  }

  return null;
};

/**
 * Format an arbitrary cell value into a readable string, or `null` when the
 * value is genuinely empty. `locale` drives date formatting.
 */
export const formatCellValue = (value: any, _key: string, locale: string): string | null => {
  if (value == null) return null;

  if (typeof value === 'string') {
    if (value.trim() === '') return null;
    return ISO_DATE.test(value) ? formatDate(value, locale) : value;
  }
  if (typeof value === 'number') return String(value); // 0 is a real value
  if (typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const parts = value
      .map((item) =>
        item != null && typeof item === 'object'
          ? summarizeObject(item, locale)
          : item == null || item === ''
            ? null
            : String(item)
      )
      .filter((p): p is string => !!p);
    return parts.length ? parts.join(', ') : null;
  }

  if (typeof value === 'object') return summarizeObject(value, locale);

  return String(value);
};
