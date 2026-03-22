// Stubs/dictionaries for canonical mapping. In a real system, these might be 
// fetched from the DB or a dedicated mapping service.

const DOCUMENT_TYPE_MAP: Record<string, string> = {
  'facture': 'INVOICE',
  'invoice': 'INVOICE',
  'فاتورة': 'INVOICE',
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
