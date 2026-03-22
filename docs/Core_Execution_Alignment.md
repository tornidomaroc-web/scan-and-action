# Developer Notes: Core Execution Alignment

During architectural reviews, several execution assumptions were hardened to guarantee strict normalization adherence.

## 1. Fact Isolation for Expenses
We no longer query `DocumentFact.key IN ("ELECTRICITY", "UBER")` and sum randomly.
- **Rule**: Category is assigned to `DocumentFact` where `key = 'EXPENSE_CATEGORY'`. Total numerical values are assigned to `DocumentFact` where `key = 'TOTAL_AMOUNT'`.
- **Implementation**: `queryExecutor` enforces a document-level join. We filter outer documents by the presence of a target `EXPENSE_CATEGORY` fact, and ONLY sum the matching inner documents' `TOTAL_AMOUNT` rows.

## 2. Multi-Currency Protections
Prisma groupings (`_sum`) implicitly aggregate indiscriminately unless split by a logical delimiter. Memory safety and mathematical safety require strict multi-currency adherence.
- `sum_expenses` groups natively via Prisma by `currency`.
- `group_expenses` evaluates a complex Postgres raw SQL string to efficiently join sibling facts internally (`DocumentFact cat JOIN DocumentFact amt`) producing arrays split strictly by category + currency.

## 3. Contact Entities
Entities are extracted by the ingestion pipeline as vendors, attendees, or people. We rely strictly on `Entity.entityType in ['PERSON', 'CONTACT', 'VENDOR']` joined through the intermediate `DocumentEntity` context map, guaranteeing accurate timeline contact surfacing regardless of initial raw string discrepancies.

## 4. UI Alignment & Formatter Safeties
The DTO passes down robust metadata (`isMixedCurrency`, `currencies`). The native `AnswerFormatter` checks this flag first, constructing dynamically polite string structures ("You have expenses across multiple currencies: 15.00 USD, 34.00 EUR") totally sidestepping LLM latency and hallucination risks!
