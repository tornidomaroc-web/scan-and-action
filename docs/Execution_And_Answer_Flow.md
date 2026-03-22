# Developer Notes: Execution and Answer Pipeline Flow

## The QueryExecutor
The `QueryExecutor` operates entirely independently of any Artificial Intelligence. It translates the internal application `QueryPlan` into strict Prisma / PostgreSQL queries. 
- Math operations (`SUM`, `COUNT`, `GROUP BY`) are locked beneath the SQL transaction.
- Filters enforce canonical English matching strictly (`WHERE DocumentFact.key IN ("ELECTRICITY")`).
- Output limits and sorts (e.g. `orderBy: { uploadedAt: 'desc' }`) prevent memory leaks.

## Query Audit Log 
Every single query, regardless of `SUCCESS`, `PARSE_ERROR`, or `CLARIFICATION_REQUIRED`, pushes its execution span to `QueryLog` alongside the raw string and translated intent. If a user complains "the numbers are wrong", the engineer retrieves the exact `QueryPlan` from the log, perfectly isolating whether the LLM hallucinated the filter parsing, or the SQL query grouped incorrectly.

## The Answer Formatting Layer
The `AnswerFormatter` acts as the final buffer. 
1. If the plan mandates returning a `table` or `chart_ready_data`, the formatter strips text composition and immediately pushes the raw JSON DTO to the frontend UI components.
2. If `short_answer` is required, the system uses **pre-compiled localization templates (en/fr/ar)** covering the core intents (`sum_expenses`, `count_documents`). This is significantly faster and mathematically safer than spinning up an LLM context token stream.
3. If LLM templating is executed (e.g., summarizing), the DTO values are immutable inputs.
