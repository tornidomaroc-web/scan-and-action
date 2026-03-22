# Example Multilingual End-To-End Queries

These examples illustrate the translation boundary across our `User Input -> Internal Pipeline -> User Output` layers.

## 1. Summing Expenses (French)

**User Input (French):**
> "Combien ai-je dépensé chez Uber le mois dernier?"

**Intent Parser Output (LLM via Zod):**
```json
{
  "intent": "sum_expenses",
  "entityNames": ["UBER"],
  "dateRange": { "relativeExpression": "last_month" },
  "aggregation": { "operation": "SUM", "targetField": "valueNumber" },
  "outputFormat": "short_answer",
  "confidence": 0.98
}
```

**Query Executor Result (Prisma/PostgreSQL):**
```json
{
  "sum": 145.50
}
```

**Answer Composer Output (LLM localized):**
> "Vous avez dépensé un total de 145,50 € chez Uber le mois dernier."

---

## 2. Listing Documents (Arabic)

**User Input (Arabic):**
> "أرني كل الفواتير الطبية من هذا العام"
(Show me all medical invoices from this year)

**Intent Parser Output (LLM via Zod):**
```json
{
  "intent": "list_documents",
  "documentTypes": ["INVOICE"],
  "categories": ["MEDICAL"],
  "dateRange": { "relativeExpression": "this_year" },
  "outputFormat": "table",
  "confidence": 0.96
}
```

**Query Executor Result (Prisma/PostgreSQL):**
```json
[
  { "id": "uuid-1", "detectedLanguage": "ar", "normalizedText": "...MEDICAL...", "uploadedAt": "2026-02-15" }
]
```

**Answer Composer Output:**
*(Skipped LLM generation since intent requested `table` view. UI renders the datagrids.)*
```json
[
  { "id": "uuid-1", "detectedLanguage": "ar", "normalizedText": "...MEDICAL...", "uploadedAt": "2026-02-15" }
]
```

---

## 3. Counting Appointments (English)

**User Input (English):**
> "How many dental appointments did I upload yesterday?"

**Intent Parser Output (LLM via Zod):**
```json
{
  "intent": "count_documents",
  "documentTypes": ["APPOINTMENT"],
  "categories": ["DENTAL"],
  "dateRange": { "relativeExpression": "yesterday" },
  "aggregation": { "operation": "COUNT" },
  "outputFormat": "short_answer",
  "confidence": 0.99
}
```

**Query Executor Result (Prisma/PostgreSQL):**
`3`

**Answer Composer Output (LLM localized):**
> "You uploaded 3 dental appointments yesterday."
