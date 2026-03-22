# Service Boundaries

The backend application is divided into well-defined modules orchestrating the core pipeline:
`Image -> Structured Extraction -> Normalization -> Facts + Entities -> Query Intent -> Query Plan -> DB Execution -> Answer/Report`

## 1. Document Ingestion Service
- **Role**: Receives scanned images and text documents from the user.
- **Responsibilities**: File storage, format validation, OCR extraction mapping generic unstructured content into `rawText`, and caching.

## 2. Fact/Entity Extraction Service
- **Role**: Pushes `rawText` or images into the Vision/Text LLM to output structured JSON representing `DocumentFact` properties and potential `Entity` candidates.
- **Responsibilities**: LLM communication and schema enforcement constraint handling.

## 3. Multilingual Normalization Service
- **Role**: Transforms disparate multilingual concepts into globally uniform Canonical English terminology.
- **Responsibilities**:
  - Translates `rawText` to `normalizedText`.
  - Maps detected vendors/people into existing `Entity` records or creates new ones using `canonicalName`.
  - Maps `factType`, `key`, and `role` properties to pre-approved canonical English strings.

## 4. Search/Query Engine
- **Role**: Interprets intent and executes code-controlled deterministic metrics generation.
- **Responsibilities**: 
  - **Intent Parsing**: LLM translates raw user query to `QueryIntent` (JSON).
  - **Query Planning**: Service generates deterministic `QueryPlan` (SQL/Prisma) from the intent.
  - **Execution**: Runs the query predictably and fetches `resultCount`.
  - Logs execution to `QueryLog`.

## 5. Smart Reports Service
- **Role**: Orchestrates definitions, template evaluation, and report snapshots.
- **Responsibilities**: Evaluates standard `SavedReportDefinition` queries against the `Search/Query Engine` on a schedule or on-demand, gathers static snapshots, and feeds them into the LLM to generate `summaryText` in the designated `locale`. Saves to `GeneratedReport`.

## 6. Review Queue Service
- **Role**: Human-in-the-loop oversight.
- **Responsibilities**: Flags `Document`, `DocumentFact`, and `DocumentEntity` records where `confidence < THRESHOLD`. Allows human correction.
