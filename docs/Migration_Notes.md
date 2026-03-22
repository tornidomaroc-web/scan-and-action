# Scan & Action - Migration Notes

These notes outline recent architectural adjustments to strengthen our data model, better differentiate components, and significantly enhance reporting capabilities.

## 1. Upgraded Document Model
- **Why**: Documents required deeper metadata. Simply having `fileUrl` and `status` isn't enough when users search across varied topics.
- **What Changed**: Added fields like `documentType`, `documentSubtype`, `detectedLanguage`, `rawText` (preserved OCR), `normalizedText` (for strict English indexing), and `overallConfidence`.

## 2. Replaced `ExtractedFact` with `DocumentFact`
- **Why**: The old fact model forced everything into a single entity/category mapping. We needed flexibility to store pure dates, pure numbers with currencies, or text constants.
- **What Changed**: Introduced `factType` & `key`. Added explicit typing fields: `valueString`, `valueNumber`, `valueDate`, `currency`. Preserved `sourceSpan` for auditing the exact line the LLM extracted it from.

## 3. Dedicated `Entity` & `DocumentEntity`
- **Why**: A Vendor or User shouldn't just be an isolated string value attached to a solitary document. It must be queryable across the application.
- **What Changed**: Created a global `Entity` table (e.g., entityType="VENDOR", canonicalName="HOME DEPOT", aliases=["The Home Depot"]). The new `DocumentEntity` join table attaches documents to recognized entities and defines the `role` (e.g., this document is an invoice WHERE role="ISSUER" AND entityId="HOME_DEPOT_ID").

## 4. Split Smart Reports
- **Why**: Recalculating smart reports on every view is dangerous, expensive, and not reproducible. A "Monthly summary" run on Aug 1st will change if viewed on Aug 5th unless data is snapshot.
- **What Changed**: Separated into `SavedReportDefinition` (the query intent rules, schedules) vs `GeneratedReport` (the actual executed data snapshot + LLM localized analysis).

## 5. Enhanced Query Logs
- **Why**: Troubleshooting LLM parsing behavior vs Database SQL execution is difficult without full transparency.
- **What Changed**: Added `queryPlanJson` (what we told the DB to run), and separated it from `parsedIntentJson` (what the LLM generated). Included `executionTimeMs`, `resultCount`, and `status`.
