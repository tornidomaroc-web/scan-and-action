import { z } from 'zod';

// Zod schemas defining exactly what Gemini should output when analyzing an image.
// This enforces strict adherence to our architecture.

export const RawExtractedFactSchema = z.object({
  key: z.string().describe("The name of the field found (e.g., 'Total Amount', 'Sale Date', 'Client Name')"),
  factType: z.enum(['AMOUNT', 'DATE', 'TEXT']).describe("The type of data this fact represents"),
  valueString: z.string().optional().describe("The string value if type is TEXT"),
  valueNumber: z.number().optional().describe("The numeric value if type is AMOUNT"),
  valueDate: z.string().optional().describe("ISO8601 Date string if type is DATE"),
  currency: z.string().optional().describe("The currency code if type is AMOUNT, e.g., 'USD', 'EUR'"),
  sourceSpan: z.string().describe("The exact snippet of text from the document where this fact was found"),
  confidence: z.number().min(0).max(1).describe("Estimated confidence in this extraction between 0.0 and 1.0")
});

export const RawExtractedEntitySchema = z.object({
  name: z.string().describe("The raw name of the entity found in the document"),
  entityType: z.enum(['VENDOR', 'CLIENT', 'PERSON', 'OTHER']).describe("The type of entity"),
  role: z.string().describe("The role this entity plays in the document (e.g., 'Issuer', 'Billed To', 'Attendee')"),
  sourceSpan: z.string().describe("The exact snippet of text from the document where this entity was found"),
  confidence: z.number().min(0).max(1).describe("Estimated confidence in this extraction between 0.0 and 1.0")
});

export const GeminiExtractionSchema = z.object({
  detectedLanguage: z.string().describe("ISO 639-1 language code of the primary language in the document (e.g., 'en', 'fr', 'ar')"),
  documentType: z.string().describe("The type of document (e.g., 'Invoice', 'Business Card', 'Appointment', 'Receipt')"),
  documentSubtype: z.string().optional().describe("Further classification (e.g., 'Utility Bill', 'Dental Appointment')"),
  rawText: z.string().describe("The full raw text transcribed from the document"),
  summary: z.string().describe("A brief 1-2 sentence summary of what this document is"),
  facts: z.array(RawExtractedFactSchema).describe("List of deterministic facts extracted from the document"),
  entities: z.array(RawExtractedEntitySchema).describe("List of entities (people/companies) extracted from the document"),
  overallConfidence: z.number().min(0).max(1).describe("Overall confidence in the quality of the scan and extraction")
});

export type GeminiExtractionResult = z.infer<typeof GeminiExtractionSchema>;
