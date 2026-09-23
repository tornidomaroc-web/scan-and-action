/**
 * The expense categories: the closed list a receipt is sorted into. This is a
 * PRODUCT decision, ruled 2026-09-23 with the ledger-first home screen, where
 * these eight words are what the owner sees every day.
 *
 * Chosen for how spending is looked at, not for what a keyword table happens
 * to match:
 *   Food       eating and drinking of any kind: groceries, restaurants, cafés,
 *              bakeries, food delivery. One category on purpose; see below.
 *   Transport  getting around locally: fuel, taxi and ride-hailing, parking,
 *              tolls, public transport, vehicle service.
 *   Travel     being away: hotels, flights, trains between cities, travel
 *              agencies.
 *   Shopping   goods for personal or household use: clothing, electronics,
 *              furniture, general retail.
 *   Health     pharmacy, doctor, dentist, lab, optician.
 *   Bills      recurring services: phone, internet, electricity, water,
 *              subscriptions, insurance, rent.
 *   Office     things bought for work: supplies, software and cloud services,
 *              printing, professional services.
 *   Other      nothing above fits, or the receipt does not say.
 *
 * Deliberately left out:
 *   - Groceries as its own category. With one user and small volumes it would
 *     halve Food into two small numbers; the enum can split it later, and the
 *     extractor already sees the difference.
 *   - Entertainment, Education, Gifts, Personal care. Rare on the receipts this
 *     product has seen; each folds into Shopping, Bills or Other without loss
 *     until there is evidence it deserves a line of its own.
 *   - Software as a separate category (the old table had it). For a person or
 *     a small business it is a work cost, so it lives under Office.
 *
 * The model is asked for the UPPERCASE code; `normalizeCategory` maps what it
 * returns onto the stored label and answers null for anything else, which is
 * what makes the keyword fallback run.
 */
export const EXPENSE_CATEGORIES = ['Food', 'Transport', 'Travel', 'Shopping', 'Health', 'Bills', 'Office', 'Other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** One line per category, in the words the extraction prompt uses. */
export const CATEGORY_DEFINITIONS: Record<ExpenseCategory, string> = {
  Food: 'groceries, restaurants, cafés, bakeries, food delivery: anything eaten or drunk',
  Transport: 'fuel, taxi or ride-hailing, parking, tolls, public transport, vehicle service',
  Travel: 'hotels, flights, intercity trains, travel agencies',
  Shopping: 'clothing, electronics, furniture, general retail goods',
  Health: 'pharmacy, doctor, dentist, laboratory, optician',
  Bills: 'phone, internet, electricity, water, insurance, rent, subscriptions',
  Office: 'work supplies, software and cloud services, printing, professional services',
  Other: 'nothing above fits, or the document does not say',
};

/** The prompt fragment, shared by the image extraction and the text backfill. */
export function categoryPromptFragment(): string {
  const lines = EXPENSE_CATEGORIES.map(c => `${c.toUpperCase()}: ${CATEGORY_DEFINITIONS[c]}`).join('\n           ');
  return `"category": one of ${EXPENSE_CATEGORIES.map(c => `"${c.toUpperCase()}"`).join(' | ')}, meaning:
           ${lines}
           Choose by what was bought, not by who sold it. Use OTHER when unsure.`;
}

const BY_CODE: Record<string, ExpenseCategory> = Object.fromEntries(
  EXPENSE_CATEGORIES.map(c => [c.toUpperCase(), c])
) as Record<string, ExpenseCategory>;

/**
 * Maps whatever the model returned onto a stored label. Case-insensitive, and
 * tolerant of surrounding whitespace or quotes. Null for anything that is not
 * on the list, including an empty answer: the caller treats null as "the model
 * did not say" and falls back to the keyword matcher.
 */
export function normalizeCategory(raw: unknown): ExpenseCategory | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().replace(/^["']+|["']+$/g, '').toUpperCase();
  return BY_CODE[code] ?? null;
}
