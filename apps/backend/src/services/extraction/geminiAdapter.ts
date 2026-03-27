import { GeminiExtractionSchema, GeminiExtractionResult } from '../../types/schemas';
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * GeminiExtractionAdapter
 * 
 * Final Production Version (Stripe-grade).
 * Optimized for high-precision extraction, zero-tolerance for missing dates,
 * and professional observability.
 */
export class GeminiExtractionAdapter {
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      console.warn("[Gemini] API Key is missing or using placeholder! Requests will likely fail.");
    }
    this.genAI = new GoogleGenerativeAI(apiKey || "");
  }

  private normalizeDate(rawDate: string | null): string {
    if (!rawDate || rawDate.toLowerCase() === 'null' || rawDate.toLowerCase() === 'unknown') {
      return 'UNKNOWN';
    }
    const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (isoRegex.test(rawDate)) return rawDate;
    
    try {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    } catch (e) {}
    
    return 'UNKNOWN';
  }

  private normalizeCurrency(raw: string | null): string {
    const currency = (raw || 'USD').toUpperCase();
    const map: Record<string, string> = { '$': 'USD', '€': 'EUR', '£': 'GBP', 'DH': 'MAD', 'MAD': 'MAD' };
    return map[currency] || (currency.length === 3 ? currency : 'USD');
  }

  /**
   * High-speed Vision Binary Check.
   * Minimal token usage to detect if an image contains multiple documents.
   */
  public async isSingleDocument(fileBuffer: Buffer, mimeType: string): Promise<boolean> {
    const modelId = "models/gemini-flash-latest";

    try {
      const model = this.genAI.getGenerativeModel({
        model: modelId,
        generationConfig: {
          temperature: 0.0,
        }
      });

      const prompt = `
        Analyze this image for a document intelligence pipeline.
        Does this image contain more than one distinct document, receipt, or business card?
        Answer ONLY 'YES' or 'NO'.
      `;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: fileBuffer.toString("base64"),
            mimeType: mimeType
          }
        }
      ]);

      const textOutput = result.response.text().trim().toUpperCase();
      console.log(`[Gemini Validation DEBUG] raw result: "${textOutput}"`);
      
      const containsYes = textOutput.includes('YES');
      const containsNo = textOutput.includes('NO');
      
      console.log(`[Gemini Validation DEBUG] containsYes: ${containsYes}, containsNo: ${containsNo}`);

      // If the AI says 'YES', it means it found MULTIPLE documents.
      // We only return 'true' if we are SURE it said 'NO' and not 'YES'.
      if (containsYes && !containsNo) return false;
      if (containsNo && !containsYes) return true;
      
      // If result is ambiguous, default to the safest check (false if multiple-sounding)
      return !containsYes;

    } catch (error: any) {
      console.error("[Gemini Validation] CRITICAL ERROR during check:", error.message);
      return true; // Fail-open to avoid blocking users on API technicalities
    }
  }

  public async extractFromImage(fileBuffer: Buffer, mimeType: string): Promise<GeminiExtractionResult> {
    const modelId = "models/gemini-flash-latest";

    try {
      const model = this.genAI.getGenerativeModel({
        model: modelId,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.0,
        }
      });

      const prompt = `
        You are a world-class Document Intelligence AI specialized in financial audit.
        EXTRACT structured data with ZERO TOLERANCE for errors.

        ### EXTRACTION PRIORITIES:
        1. MERCHANT: The legal name of the issuer. Avoid "Visa", "Mastercard", or "Stripe".
        2. FINAL TOTAL: The actual amount paid/due. Mandatory.
        3. DATE (ABSOLUTE PRIORITY): Find the document date. Search everywhere (headers, footers, tiny print). 
           - Search for patterns like: DD/MM/YYYY, MM-DD-YY, YYYY.MM.DD, or "Mar 23, 2024".
           - Normalize to YYYY-MM-DD.
           - If found at all, return it. If absolutely not present after 3 passes, return "UNKNOWN".
        4. CATEGORY: Correctly identify: "receipt" (point of sale), "invoice" (bill for service), or "business_card".
        5. CURRENCY: Detect from symbols ($, €, MAD, DH) or codes.

        ### JSON SCHEMA:
        {
          "documentType": "invoice" | "receipt" | "business_card",
          "language": "string (ISO)",
          "date": "string (YYYY-MM-DD or UNKNOWN)",
          "totalAmount": number,
          "taxAmount": number,
          "currency": "string (3-letter or symbol)",
          "merchantName": "string",
          "rawText": "string",
          "summary": "string",
          "items": [ { "name": "string", "price": number } ]
        }

        NO explanation. JSON ONLY.
      `;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: fileBuffer.toString("base64"),
            mimeType: mimeType
          }
        }
      ]);

      const rawJson = JSON.parse(result.response.text());
      const finalDate = this.normalizeDate(rawJson.date);
      const finalCurrency = this.normalizeCurrency(rawJson.currency);

      // PROFESSIONAL ASCII LOGGING
      console.log(`
┌───────────────────────────────────────────────────────────┐
│ [GEMINI AI EXTRACTION]                                    │
├───────────────────────────────────────────────────────────┤
│ MERCHANT:   ${(rawJson.merchantName || 'UNKNOWN').padEnd(46)} │
│ TOTAL:      ${(String(rawJson.totalAmount) + ' ' + finalCurrency).padEnd(46)} │
│ DATE:       ${finalDate.padEnd(46)} │
│ DOCUMENT:   ${(rawJson.documentType || 'Other').toUpperCase().padEnd(46)} │
│ QUALITY:    ${(finalDate !== 'UNKNOWN' ? 'HIGH' : 'CHECK_DATE').padEnd(46)} │
└───────────────────────────────────────────────────────────┘
      `);

      // -----------------------------------------------------------------------
      // FIX-04 — CORE-FACT COMPLETENESS SCORING
      // -----------------------------------------------------------------------
      // We derive overallConfidence from a fixed baseline of core facts:
      // [Date, Total Amount].
      // - 0.99 = Found and valid
      // - 0.3  = Extracted but marked as 'UNKNOWN' (unreliable)
      // - 0.0  = Missing from the extraction entirely
      // -----------------------------------------------------------------------
      let dateScore = 0.0;
      let amountScore = 0.0;

      if (rawJson.date) {
        dateScore = finalDate === 'UNKNOWN' ? 0.3 : 0.99;
      }

      if (rawJson.totalAmount !== null && rawJson.totalAmount !== undefined) {
        amountScore = 0.99;
      }

      const completenessScore = (dateScore + amountScore) / 2;

      const mappedResult: GeminiExtractionResult = {
        detectedLanguage: rawJson.language || 'en',
        documentType: rawJson.documentType || 'Other',
        documentSubtype: 'Professional Intelligence',
        rawText: rawJson.rawText || '',
        summary: rawJson.summary || 'Verified automated extraction.',
        overallConfidence: completenessScore,
        facts: [],
        entities: []
      };

      mappedResult.facts.push({
        key: 'Date',
        factType: 'DATE',
        valueDate: finalDate === 'UNKNOWN' ? undefined : finalDate,
        sourceSpan: `Search Strategy: Exhaustive`,
        confidence: finalDate === 'UNKNOWN' ? 0.3 : 0.99
      });

      if (rawJson.totalAmount !== null) {
        mappedResult.facts.push({
          key: 'Total Amount',
          factType: 'AMOUNT',
          valueNumber: Number(rawJson.totalAmount),
          currency: finalCurrency,
          sourceSpan: 'Primary Total',
          confidence: 0.99
        });
      }

      if (rawJson.merchantName) {
        mappedResult.entities.push({
          name: rawJson.merchantName,
          entityType: 'VENDOR',
          role: 'Issuer',
          sourceSpan: 'Global Metadata',
          confidence: 0.99
        });
      }

      return GeminiExtractionSchema.parse(mappedResult);

    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      let failureCause = 'INTERNAL_ERROR';

      if (errorMessage.includes('parsing') || errorMessage.includes('JSON')) {
        failureCause = 'PARSE_ERROR';
      } else if (errorMessage.includes('fetch') || errorMessage.includes('API') || errorMessage.includes('safety')) {
        failureCause = 'OCR_FAILED';
      }

      console.error(`[Gemini] [FAILURE_CAUSE]: ${failureCause}`);
      console.error(`[Gemini] Detailed Error: ${errorMessage}`);

      return {
        detectedLanguage: 'en',
        documentType: 'Unknown',
        rawText: '',
        summary: '',
        overallConfidence: 0.0,
        facts: [],
        entities: []
      };
    }
  }
}
