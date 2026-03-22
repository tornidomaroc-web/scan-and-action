# Developer Notes: Ingestion Pipeline End-To-End

## Overview

The Scan & Action ingestion pipeline converts unstructured, multilingual pixels (image scans) into structured, canonical, globally-searchable database rows without sacrificing data integrity or auditability.

## Flow Order

### 1. Upload Controller
The controller (`uploadController.ts`) remains perfectly thin. It handles standard HTTP multipart parsing (via Multer), passes the file buffer immediately to the `IngestionService`, and returns the `documentId`. Logic belongs in services.

### 2. Ingestion Orchestrator
`IngestionService` manages the high-level steps. It calls the `GeminiExtractionAdapter` and passes the response to the `PersistenceService`.

### 3. Strict Schema Vision Extraction
The image is passed to the LLM. 
**CRITICAL:** The AI does *not* return loose text. We enforce `GeminiExtractionSchema` using `Zod`. The AI must label everything with a `factType`, exact numeric values in `valueNumber`, and must provide the `sourceSpan`. If the model hallucinates formatting, Zod rejects it. 

### 4. Persistence & Normalization
Inside `PersistenceService`, before inserting into PostgreSQL via Prisma:
- **Language Preservation**: We store `rawText` exactly as transcribed in French/Arabic. We then generate `normalizedText` via the `NormalizationService` (e.g. translating it to English for uniform keyword searching).
- **Facts**: We map strings like "montant total" deterministically to the canonical `TOTAL_AMOUNT`. We insert `DocumentFact` rows containing pure, queryable `Float` values.
- **Entities**: We map "Bureau en Gros" against our global `Entity` table through `EntityResolutionService`.

### 5. Review Flagging (Human in the Loop)
If extraction components returned an algorithm-provided `confidenceScore` of `< 0.80`, `isReviewed` defaults to false and `status` toggles to `NEEDS_REVIEW`. This enforces data integrity for the strict AI boundary rules on reporting. Reports calculate pure numbers; if a number is flagged, it might be excluded or bolded until a human reviews it in the UI. 
