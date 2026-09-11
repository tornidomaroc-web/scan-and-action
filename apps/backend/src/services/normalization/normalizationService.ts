// Stubs/dictionaries for canonical mapping. In a real system, these might be 
// fetched from the DB or a dedicated mapping service.

// THE KEYS ARE THE EXTRACTION PROMPT'S OWN VOCABULARY, and nothing else may be
// added here without reading it first.
//
// `normalizeDocumentType` is reached by exactly one value: whatever the model
// put in `documentType`, passed through verbatim by geminiAdapter.ts:281. The
// prompt pins that to three literals (geminiAdapter.ts:203, :209):
//
//     "documentType": "invoice" | "receipt" | "business_card"
//
// 'receipt' was missing, so every receipt in a receipt-scanning product was
// stored as 'UNKNOWN_DOCUMENT_TYPE' — 323 of 385 rows on 2026-09-11, with
// RECEIPT at 0 — and intentParser.ts:77, which filters on 'RECEIPT', matched
// nothing for the life of the product.
//
// 'business_card' was the same defect one spelling over: the map held
// 'business card' with a SPACE while the prompt says 'business_card' with an
// UNDERSCORE, so the third prompt literal also fell through to
// UNKNOWN_DOCUMENT_TYPE. Measured on production 2026-09-11, all 386 rows:
// BUSINESS_CARD **0**, against INVOICE 40 through the identical equality
// filter — so that zero was a real zero and not a query that could not match.
// With all three literals now mapped, this function is a total function over
// the vocabulary the prompt defines.
//
// ⚠ THE REMAINING KEYS BELOW ARE DEAD, and are left only because removing them
// is a separate change. The prompt instructs English literals, so 'facture',
// 'فاتورة', 'carte de visite', 'بطاقة عمل', 'rendez-vous' and 'موعد' cannot be
// produced by anything that calls this. 'business card' with a space stays for
// the same reason, and for one more: deleting a key can only NARROW what maps,
// never widen it. A model told to emit 'business_card' that emits 'Business
// Card' anyway is caught by that key today, and this change is not the place to
// give that up. Do not add more of them: if a new spelling is wanted, change the
// PROMPT and add the key it then emits.
const DOCUMENT_TYPE_MAP: Record<string, string> = {
  'facture': 'INVOICE',
  'invoice': 'INVOICE',
  'فاتورة': 'INVOICE',
  'receipt': 'RECEIPT',
  'business_card': 'BUSINESS_CARD',
  'carte de visite': 'BUSINESS_CARD',
  'business card': 'BUSINESS_CARD',
  'بطاقة عمل': 'BUSINESS_CARD',
  'rendez-vous': 'APPOINTMENT',
  'appointment': 'APPOINTMENT',
  'موعد': 'APPOINTMENT'
};

const FACT_KEY_MAP: Record<string, string> = {
  'total': 'TOTAL_AMOUNT',
  'montant total': 'TOTAL_AMOUNT',
  'المبلغ الإجمالي': 'TOTAL_AMOUNT',
  'taxe': 'TAX_AMOUNT',
  'tax': 'TAX_AMOUNT',
  'ضريبة': 'TAX_AMOUNT',
  'date': 'TRANSACTION_DATE',
  'تاريخ': 'TRANSACTION_DATE',
  'name': 'PERSON_NAME',
  'nom': 'PERSON_NAME',
  'الاسم': 'PERSON_NAME'
};

const CURRENCY_MAP: Record<string, string> = {
  '€': 'EUR',
  'eur': 'EUR',
  '$': 'USD',
  'usd': 'USD',
  'د.إ': 'AED',
  'aed': 'AED'
};

export class NormalizationService {

  public normalizeDocumentType(rawType: string): string {
    const key = rawType.toLowerCase().trim();
    return DOCUMENT_TYPE_MAP[key] || 'UNKNOWN_DOCUMENT_TYPE';
  }

  public normalizeFactKey(rawKey: string): string {
    const key = rawKey.toLowerCase().trim();
    // If we recognize it, use canonical. Otherwise, we uppercase the raw string as a fallback literal.
    return FACT_KEY_MAP[key] || rawKey.toUpperCase().replace(/\s+/g, '_');
  }

  public normalizeCurrency(rawCurrency?: string): string | undefined {
    if (!rawCurrency) return undefined;
    const key = rawCurrency.toLowerCase().trim();
    return CURRENCY_MAP[key] || rawCurrency.toUpperCase().trim();
  }

  public normalizeTextToEnglish(rawText: string, detectedLanguage: string): string {
    if (detectedLanguage === 'en') return rawText;
    
    // In MVP, this might be a secondary lightweight LLM call specifically to translate the body
    // context into English to ensure the `normalizedText` column is searchable in English.
    // E.g., const translation = await translationService.translate(rawText, 'en');
    
    console.log(`[Normalization] Translating ${detectedLanguage} to English Canonical Text...`);
    // Return mock translated text
    return `[MOCK_TRANSLATED] ${rawText}`;
  }
}
