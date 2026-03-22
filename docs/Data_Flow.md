# Data Flow

## 1. Ingestion & Extraction Flow
1. **User Uploads**: User uploads an image receipt in French via the Frontend.
2. **Ingestion Service**: Saves the file, creates a `Document(status: PENDING)`.
3. **Extraction Service**: Sends the image to a Vision LLM with strict JSON schema instructions: "Extract items, amounts, categories".
4. **Normalization Service**: The LLM outputs French text but is prompted (or post-processed by code) to map categories to English Canonical values: Category="EXPENSE", Entity="MEAL".
5. **Database Insert**: Creates `ExtractedFact` records. Sets `status: COMPLETED` (or `NEEDS_REVIEW` if confidence is low).

## 2. Review Flow
1. **Queue Retrieval**: Reviewer queries `ExtractedFact` where `confidenceScore < 0.85` AND `isReviewed == false`.
2. **Validation**: Reviewer sees the original snippet and the mapped fact, modifies it if necessary, and submits.
3. **Save**: Fact is updated, `isReviewed` is true.

## 3. Search & Query Flow
1. **User Asks**: "¿Cuánto gasté en comida este mes?" (How much did I spend on food this month?)
2. **Intent Parsing (LLM)**: LLM takes the raw query and strict schema, outputs:
   ```json
   {
     "intent": "sum",
     "field": "numericValue",
     "filters": [
       { "field": "canonicalCategory", "operator": "eq", "value": "EXPENSE" },
       { "field": "canonicalEntity", "operator": "eq", "value": "MEAL" },
       { "field": "date", "operator": "current_month" }
     ]
   }
   ```
3. **Query Plan & Execution (Code)**: The Search Engine code translates this JSON into standard SQL/Prisma:
   `SELECT SUM(numericValue) FROM ExtractedFact WHERE canonicalCategory = 'EXPENSE' ...`
4. **Database Execution (DB)**: PostgreSQL runs the aggregation deterministically (e.g., Result = 150.50).
5. **Localization & Answer Generation (LLM)**: The code provides the LLM with the user's query and the deterministic result: `{ answer: 150.50, language: 'es' }`. The LLM generates: "Has gastado $150.50 en comida este mes."
6. **Delivery**: The synthesized answer is sent back to the frontend.
