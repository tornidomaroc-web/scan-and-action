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
import { formatPercent } from './formatNumber';

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
  date: string | null;
  confidence: string | null;
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

/**
 * The DIRECTION of what formatFactValue just returned.
 *
 * Direction is DATA here, not a property of the container, because this one call
 * site is polymorphic: the same element renders an Arabic vendor string, a
 * localized Arabic date, a placeholder, AND an Intl currency string. A static
 * dir on that element is wrong for three of those four.
 *
 * Only the NUMERIC branch needs pinning, and it needs it because Intl's ar/USD
 * output is 200f 34 32 2e 30 37 a0 55 53 24 — it BEGINS with U+200F RLM (a
 * strong RTL character) and ENDS with `$` (a neutral). dir="auto" resolves from
 * the first strong character, finds the RLM, makes the box RTL, and the trailing
 * neutral lands left of the `US` run: `$US 42.07` instead of `42.07 US$`.
 *
 * The precedence below MIRRORS formatFactValue's exactly and must keep doing so.
 * If the two disagree, the direction is computed for a branch that did not
 * produce the string — which is a worse bug than the one this fixes, because it
 * would pin `ltr` onto Arabic prose.
 *
 * Measured in Chrome (PR #145, f18bd1e), by reading the on-screen x of every
 * character, with the defect reproduced first as the positive control:
 *
 *   dir="auto"                ->  "$US 42.07"  WRONG
 *   dir="ltr" + <bdi>         ->  "$US 42.07"  WRONG
 *   <bdi> alone               ->  "$US 42.07"  WRONG
 *   dir="ltr", no isolate     ->  "42.07 US$"  right
 *
 * <bdi> is BY DEFINITION an isolate whose direction is `auto`, so wrapping the
 * value re-runs the very detection the pin exists to override. That is why the
 * fix is `dir="ltr"` with NO isolate element, and why an added <bdi> is a
 * regression even though it looks like an improvement.
 */
export const factValueDir = (fact: any): 'ltr' | 'auto' => {
  // 1) A real string value wins in formatFactValue, so it wins here. It is
  //    arbitrary document data and may be Arabic: it must stay auto.
  if (fact?.valueString != null && String(fact.valueString) !== '') return 'auto';
  // 2) The numeric branch — the only one that produces an Intl currency string.
  if (fact?.valueNumber != null) return 'ltr';
  // 3) A localized date, or the placeholder. Both can be Arabic: auto.
  return 'auto';
};

const firstReadable = (row: any, language: string): string | null => {
  for (const [k, v] of Object.entries(row || {})) {
    if (k === 'id') continue;
    const f = formatCellValue(v, k, language);
    if (f) return f;
  }
  return null;
};

// The row's date is `uploadedAt`, not `processedAt`. Three candidates existed:
// `processedAt` is `DateTime?` (schema.prisma:128) and is null for every row
// still processing — it would blank on exactly the rows a user is most likely
// to be watching. A document-date fact is not reliably present. `uploadedAt` is
// non-null with @default(now()) (schema.prisma:127) and is what the query
// planner sorts by (queryPlanner.ts:73,129), so the column shows the value the
// rows are already ordered by. DocumentDetailScreen.tsx:209 independently pairs
// s.date with uploadedAt, so this matches an existing user-visible convention
// rather than inventing a second one.
export const getDate = (row: any, language: string): string | null =>
  formatDateValue(row?.uploadedAt, language);

// `overallConfidence` is a non-null Float in 0..1 (schema.prisma:125). Rendered
// through the SHARED formatPercent, which is what DashboardScreen.tsx:212
// already uses for a confidence ratio — so the two surfaces cannot drift on
// separator or percent-sign placement. Guarded against three real mistakes:
//   - a bare 0.42 (what formatCellValue would print),
//   - dropping a legitimate 0 (a `value || null` shape treats it as absent),
//   - a non-finite value, which formatPercent honestly renders as '' and which
//     is mapped back to null here so the caller shows its placeholder.
export const getConfidence = (row: any, language: string): string | null => {
  const raw = row?.overallConfidence;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return formatPercent(raw, language) || null;
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
    date: getDate(row, language),
    confidence: getConfidence(row, language),
  };
};

// ============================================================================
// ONE extractor, TWO display sets
// ============================================================================
// getPrimaryFields above is the single answer to "what does a search row mean".
// Both layouts call it. What each layout DISPLAYS stays separate, and
// deliberately so:
//
// The tempting version — one flat list of columns consumed by both layouts —
// is not available here, and not because of taste. The mobile card is
// progressive disclosure, and tests/searchRestyle.test.tsx:221 asserts by name
// that confidence must NOT reach it. A single shared list would either push
// confidence onto the card and break that guard, or would not be a single list.
//
// So the invariant that IS true gets pinned instead: DESKTOP is a SUPERSET of
// MOBILE. A field the card shows must be a column the table shows; a column the
// table shows need not appear on the card. That catches a field added to one
// layout and forgotten in the other, in the one direction where forgetting is a
// bug, without manufacturing a coupling that contradicts a passing test.
// Asserted in tests/searchTableColumns.test.tsx (guard 10), both directions.

export type PrimaryFieldName = 'title' | 'vendor' | 'amount' | 'status' | 'date' | 'confidence';

export const MOBILE_FIELDS: PrimaryFieldName[] = ['title', 'vendor', 'amount', 'status'];

// `labelKey` is a catalog key, never a literal. Four of the six are pre-existing
// shipped copy, reused unchanged rather than duplicated under a new name:
//   entityRoleVendor  strings.ts:271  ('Vendor' / 'Fournisseur' / Arabic)
//   amountLabel       strings.ts:264  already a <th> in ReviewQueueScreen.tsx:252
//   status            strings.ts:57   already a field label in DocumentDetail
//   date              strings.ts:59   already labels uploadedAt in DocumentDetail
// Only nameLabel and confidenceLabel are new in this PR.
// `maxCh` BOUNDS A COLUMN (defect D1). A bounded cell renders inside a box that
// clips with an ellipsis at `maxCh` characters; an unbounded one renders as it
// always did and sets its own width from its content.
//
// WHICH TWO, AND WHY NOT THE OTHER FOUR. Only `title` and `vendor` are free
// text of unbounded length arriving from a document. The other four are
// formatted by this file into values with a ceiling: `amount` and `confidence`
// through Intl, `date` through the shared date path, `status` to a member of a
// fixed label set. None of them can widen a table, so bounding them would buy
// nothing and would put an ellipsis where a reader would read it as data loss.
//
// The bound lives HERE, as a number in the column definition, rather than as a
// `max-w-[24ch]` class at the render site. Two reasons, and the first is not
// stylistic: Tailwind cannot generate an arbitrary value it cannot see as a
// literal, so a per-column width can only reach the DOM as an inline style.
// Given that, the number belongs next to the column it bounds, where it is
// reviewable alongside the header key — and where a test can read the declared
// bound and assert the DOM carries that exact value.
//
// THE NUMBERS ARE ARITHMETIC, NOT A MEASUREMENT. At the 1280px viewport of
// screenshot check 9a the table has 872px. Six cells at `px-5` spend 240px on
// padding and the chevron column ~40px, leaving ~592px of text. The four
// bounded-by-format columns want roughly 10ch + 12ch + 11ch + 4ch; 24ch + 16ch
// for these two fits the remainder with a little slack at a 14px UI font. That
// is a calculation from the source lines cited in the PR doc, and nothing in
// this repo can confirm it — 9a is the measurement. If 9a still reports a
// horizontal scrollbar, these two numbers are what to change.
// `dir` PINS A COLUMN'S TEXT DIRECTION (defect F2). Declared here for the same
// reason `maxCh` is: it is per-column data, reviewable beside the header key,
// and a test can assert the DOM carries the declared value. A column with no
// `dir` renders `dir="auto"`, which is what every column did before F2 and what
// `title` and `vendor` must keep — screenshot 9c confirmed `auto` is correct on
// the bounded cells, where it is the only value that keeps the head of both a
// Latin and an Arabic name.
//
// ONLY `amount` IS PINNED, AND ONLY BECAUSE Intl HANDS US A TRAP. For Arabic,
// `Intl.NumberFormat('ar', {style:'currency', currency:'USD'})` returns:
//
//     200f 34 32 2e 30 37 a0 55 53 24   =   RLM "42.07" NBSP "U" "S" "$"
//
// That string BEGINS with U+200F, a RIGHT-TO-LEFT MARK, which is a *strong*
// RTL character — and it ENDS with `$`, which is not strong at all. `dir="auto"`
// resolves from the first strong character, finds the RLM, and makes the box
// RTL; the trailing neutral `$` then resolves RTL with it and is placed to the
// LEFT of the `US` run. The reader sees `$US 42.07`. `auto` does not merely fail
// to help here — the RLM guarantees it picks the wrong answer.
//
// NOT A `<bdi>`. MEASURED, NOT ASSUMED. `<bdi>` is defined as an isolate whose
// direction is `auto`, so it re-runs exactly the detection above and lands on
// the same wrong answer. Measured in Chrome against the real Intl string, in an
// RTL Arabic container, by reading the on-screen x of every character:
//
//     <span dir="auto">…</span>              ->  "$US 42.07"   WRONG
//     <span dir="ltr"><bdi>…</bdi></span>    ->  "$US 42.07"   WRONG  (!)
//     <span dir="ltr">…</span>               ->  "42.07 US$"   right
//     <bdi>…</bdi>                           ->  "$US 42.07"   WRONG
//
// The second line is the idiom used at ReviewQueueScreen.tsx:204 and :292; the
// `<bdi>` there is not protecting anything and those sites are believed to carry
// this same defect. See the F2 census in the PR doc — they are NOT fixed here.
//
// An explicit `dir="ltr"` is also self-isolating: the UA stylesheet gives
// `[dir=ltr]` `unicode-bidi: isolate` (confirmed via getComputedStyle), so no
// wrapper is needed to keep the amount from disturbing Arabic neighbours, and
// measuring it with Arabic text on both sides confirms it does not.
//
// ELEVEN CURRENCIES CAN SHOW THIS, not one. The trap needs a symbol mixing
// strong Latin LETTERS with a neutral: USD "US$", GBP "UK£", CAD "CA$", AUD
// "AU$", NZD "NZ$", HKD "HK$", MXN "MX$", TWD "NT$", JPY "JP¥", CNY "CN¥",
// BRL "R$". Enumerated against Intl, not guessed. A bare three-letter code
// (CHF) is all-strong and safe; a lone sign (€, ₹) has no letters to reorder
// around. GBP is in the extractor's own symbol map, so this is not exotic.
//
// WHY NOT THE OTHER THREE UNBOUNDED COLUMNS. `status` MUST stay `auto`: it is an
// Arabic label and `ltr` would be actively wrong. `date` and `confidence` are
// digits with at most a neutral adjacent to them, which resolves as part of the
// number run either way — both rendered correctly in the 9a/9c round, and
// pinning them would claim a fix for a defect they cannot have.
export const DESKTOP_COLUMNS: {
  field: PrimaryFieldName;
  labelKey: string;
  maxCh?: number;
  dir?: 'ltr';
}[] = [
  { field: 'title', labelKey: 'nameLabel', maxCh: 24 },
  { field: 'vendor', labelKey: 'entityRoleVendor', maxCh: 16 },
  { field: 'amount', labelKey: 'amountLabel', dir: 'ltr' },
  { field: 'status', labelKey: 'status' },
  { field: 'date', labelKey: 'date' },
  { field: 'confidence', labelKey: 'confidenceLabel' },
];
