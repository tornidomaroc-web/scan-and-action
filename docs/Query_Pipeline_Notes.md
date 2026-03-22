# Developer Notes: Visual Search and Query Engine Pipeline

## Overview

The Scan & Action Query Pipeline allows users to ask questions in any language, guarantees perfectly deterministic mathematical responses, and replies in the user's requested language. 

The pipeline strictly isolates the LLM from database reasoning to prevent hallucinations in financial reporting.

## Step-By-Step Flow

### 1. Intent Parsing ([`intentParser.ts`](file:///d:/RAGHAD JAD/scan-and-action/apps/backend/src/services/query/intentParser.ts))
A raw multilingual string enters the system. 
**LLM USE:** The LLM is given a strict Zod schema (`QueryIntentSchema`). It is instructed to extract concepts, dates, and entities, mapping them to Canonical English. 
*Example:* "Quels sont mes frais Lyft pour l'année dernière?" -> Intent: `sum_expenses`, Entities: `['LYFT']`, relativeDate: `'last_year'`.

### 2. Normalization ([`queryNormalizer.ts`](file:///d:/RAGHAD JAD/scan-and-action/apps/backend/src/services/query/queryNormalizer.ts))
**CODE ONLY:** Temporal phrases like "last_year" are converted to strict JavaScript `Date` boundaries using the server's timezone. We do *not* rely on the LLM to understand what "last month" implies mathematically.

### 3. Query Planning ([`queryPlanner.ts`](file:///d:/RAGHAD JAD/scan-and-action/apps/backend/src/services/query/queryPlanner.ts))
**CODE ONLY:** Translates the parsed intent into a `QueryPlan` JSON tree specifying target database tables, JOIN clauses, grouping logic, and aggregation steps (`SUM`, `COUNT`).

### 4. Query Execution ([`queryExecutor.ts`](file:///d:/RAGHAD JAD/scan-and-action/apps/backend/src/services/query/queryExecutor.ts))
**CODE ONLY:** Translates the `QueryPlan` into raw SQL/Prisma calls. Pulls the deterministic data. Measures latency.
**Audit Trail:** The entire sequence (`rawText`, `parsedIntentJson`, `queryPlanJson`, `executionTimeMs`, `resultCount`) is logged to the `QueryLog` table so engineers can trace exactly *why* a query returned specific data.

### 5. Answer Composition ([`answerComposer.ts`](file:///d:/RAGHAD JAD/scan-and-action/apps/backend/src/services/query/answerComposer.ts))
**LLM USE:** The LLM receives the source question, the language code, and the **firm deterministic math results** provided as a locked payload. It is prompted to quickly format it as a sentence without altering the numbers.

## Important Planner Mechanics

### Category Filtering for Expenses
When a user asks `"How much did I spend on electricity?"`:
The intent parser classifies `ELECTRICITY` as a Canonical Category. Inside the planner, we specifically map `categories` to the `DocumentFact.key` field while ensuring `DocumentFact.factType = 'AMOUNT'`. This guarantees we only sum numerical values tied to the literal target concept, isolating the aggregation strictly from irrelevant totals like arbitrary document dates or tax IDs.

### Ambiguity Blocking & Clarification Safety
If a user asks an impossibly vague question (e.g., `"find the thing"`), the LLM intent parser is instructed to refuse guessing filters and instead set `needsClarification = true`. 
The `QueryPlanner` immediately halts, generating a "Safe Clarification Plan" (`requiresClarification: true`) containing empty execution targets (`sourceTables: []`). The executor/UI uses this flag to pivot into a conversational loop asking the user for more details instead of throwing 500 errors or returning wildly wrong aggregations.
