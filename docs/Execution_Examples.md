# Execution and Answer Examples

## 1. Safely Handling Ambiguity
**Input Plan:** `requiresClarification: true`, `sourceLanguage: "ar"`
**Executor Output (DTO):**
```json
{
  "intent": "latest_document",
  "outputFormat": "short_answer",
  "requiresClarification": true,
  "data": { "message": "CLARIFICATION_REQUIRED" },
  "resultCount": 0,
  "executionTimeMs": 2,
  "sourceLanguage": "ar"
}
```
**Answer Formatter (Template-based Arab fallback):**
> "لم أستطع فهم عوامل التصفية المحددة لهذا الاستعلام بشكل كامل. هل يمكنك التوضيح؟"

---

## 2. Deterministic Expense Grouping (table/chart_ready)
**Input Plan:** `intent: "group_expenses"`, `outputMode: "chart_ready_data"`
**Executor Output (DTO from Prisma `groupBy`):**
```json
{
  "intent": "group_expenses",
  "outputFormat": "chart_ready_data",
  "requiresClarification": false,
  "data": [
    { "key": "MEALS", "_sum": { "valueNumber": 450.00 } },
    { "key": "TRAVEL", "_sum": { "valueNumber": 1200.50 } }
  ],
  "resultCount": 2,
  "executionTimeMs": 45,
  "sourceLanguage": "en"
}
```
**Answer Formatter Output:**
*(Bypasses text completely due to output Format, returning exact payload to frontend)*
```json
{
  "payload": [
    { "key": "MEALS", "_sum": { "valueNumber": 450.00 } },
    { "key": "TRAVEL", "_sum": { "valueNumber": 1200.50 } }
  ],
  "outputFormat": "chart_ready_data"
}
```

---

## 3. Counting Uploads (French)
**Input Plan:** `intent: "count_documents"`, `sourceLanguage: "fr"`, Filters applied
**Executor Output (DTO via Prisma `count`):**
```json
{
  "intent": "count_documents",
  "outputFormat": "short_answer",
  "requiresClarification": false,
  "data": { "count": 14 },
  "resultCount": 1,
  "executionTimeMs": 12,
  "sourceLanguage": "fr"
}
```
**Answer Formatter Output (Zero-AI Template):**
> "Vous avez 14 documents correspondant à ces critères."
