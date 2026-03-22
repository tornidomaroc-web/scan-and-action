# Developer Notes: AI Boundaries & Determinism

**CRITICAL ARCHITECTURE CONSTRAINT:**
This application explicitly defines strict boundaries for Artificial Intelligence usage to prevent hallucinations in mathematical operations and data retrieval.

## When IS AI Allowed?
1. **Structured Extraction**: Reading an image/PDF (`rawText`) and outputting a strict JSON format identifying `DocumentFact` and `Entity` objects.
2. **Intent Parsing**: Converting unstructured questions ("What did I spend at Home Depot last Monday?") into a `QueryIntent` identifying the entities, keys, and operations.
3. **Localization / Synthesis**: Synthesizing the final human-readable `Answer` or `summaryText` in a `GeneratedReport` ONLY AFTER receiving the strict deterministic `dataSnapshotJson`.
4. **General Text Translation**: Populating the `summary` or `normalizedText` of the `Document` object for broad searchability.

## When is AI STRICTLY FORBIDDEN?
1. **Calculations**: NEVER ask the LLM to sum `valueNumber` fields, or do any form of average, multiplication, or mathematical reasoning.
2. **Data Aggregations**: NEVER pass raw arrays to the LLM and ask it to "group these by Entity". Grouping falls entirely on PostgreSQL / the application code.
3. **Filtering / Business Logic**: Deciding if a `DocumentFact` meets a threshold or checking if a `SavedReportDefinition` should automatically trigger a workflow must be pure code.

## The Canonical Normalization Rule
- **Input and Storage Separation**: All original content (like `rawText` or source language) MUST be preserved to ensure auditing.
- **Internal Storage**: `key`, `role`, `factType`, `entityType`, and `canonicalName` MUST be strictly English values (`canonicalCategory = 'EXPENSE'`).
- **Translation Pipeline**: The system translates "Gasto de comida" -> mapping it to `Entity (canonicalName: MEAL_SERVICE)` and `DocumentFact (key: TOTAL_AMOUNT)`.
- **Query Resolution**: When requesting "How much for food?", the query intent maps "food" back to `MEAL_SERVICE`, issues the query predictably on the canonical IDs, executes code aggregations, and THEN returns to the Spanish UI localized nicely via LLM rewriting.
