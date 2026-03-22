# Database Schema Plan

We will use a relational database (PostgreSQL) managed by Prisma ORM for strong typing, and to strictly enforce deterministic aggregations across documents, facts, and entities.

## Core Models

### `User`
- `id`: UUID
- `email`: String (Unique)
- `preferredLanguage`: String (e.g., 'es')
- `createdAt`: DateTime

### `Document`
Houses metadata and global extracted text for a single uploaded file.
- `id`: UUID
- `userId`: UUID (FK to User)
- `originalFileName`: String
- `fileUrl`: String
- `documentType`: String (e.g., 'INVOICE', 'RECEIPT', 'CONTRACT')
- `documentSubtype`: String (e.g., 'UTILITY_BILL', 'TAX_FORM')
- `detectedLanguage`: String
- `rawText`: Text (Original OCR output)
- `normalizedText`: Text (Canonical English translation of raw content)
- `summary`: Text (LLM-generated brief summary of the document)
- `overallConfidence`: Float (0.0 - 1.0)
- `status`: Enum (PENDING, PROCESSING, COMPLETED, FAILED, NEEDS_REVIEW)
- `uploadedAt`: DateTime
- `processedAt`: DateTime (Nullable)

### `DocumentFact`
Represents a specific, deterministic key-value pair extracted from a document.
- `id`: UUID
- `documentId`: UUID (FK to Document)
- `factType`: String (e.g., 'AMOUNT', 'DATE', 'LINE_ITEM')
- `key`: String (Canonical English key, e.g., 'TOTAL_TAX')
- `valueString`: String (Nullable, for text facts)
- `valueNumber`: Float (Nullable, for numeric amounts)
- `valueDate`: DateTime (Nullable, for exact dates)
- `currency`: String (Nullable, e.g., 'USD', 'EUR')
- `confidence`: Float (0.0 - 1.0)
- `sourceSpan`: String (A pointer to where in the raw text this fact was found)
- `isReviewed`: Boolean (Default: false)

### `Entity`
A central directory of people, companies, or concepts known to the user.
- `id`: UUID
- `userId`: UUID (FK to User)
- `entityType`: String (e.g., 'VENDOR', 'CLIENT', 'PROJECT')
- `canonicalName`: String (Standardized English name, e.g., 'HOME DEPOT')
- `aliases`: String[] (Alternative names found in documents, e.g., ['The Home Depot', 'HomeDepot Inc.'])
- `metadataJson`: JSONB (Flexible attributes, e.g., tax IDs, standard category mappings)
- `createdAt`: DateTime

### `DocumentEntity` (Join Model)
Links a document to a globally recognized entity, noting the entity's role in the document.
- `id`: UUID
- `documentId`: UUID (FK to Document)
- `entityId`: UUID (FK to Entity)
- `role`: String (Canonical English role, e.g., 'ISSUER', 'PAYEE', 'BUYER')
- `confidence`: Float (0.0 - 1.0)

## System & Reporting Models

### `QueryLog`
Tracks system usage, LLM parsing accuracy, and debugging metrics.
- `id`: UUID
- `userId`: UUID (FK to User)
- `rawQueryText`: String
- `sourceLanguage`: String
- `parsedIntentJson`: JSONB (The intent extracted by the LLM)
- `queryPlanJson`: JSONB (The internal plan generated to fetch data)
- `executionTimeMs`: Int
- `resultCount`: Int
- `status`: Enum (SUCCESS, PARSE_ERROR, EXECUTION_ERROR)
- `errorMessage`: Text (Nullable)
- `createdAt`: DateTime

### `SavedReportDefinition`
Defines a reusable template for a report.
- `id`: UUID
- `userId`: UUID (FK to User)
- `title`: String
- `description`: Text
- `queryTemplateJson`: JSONB (Filters, aggregations, and layout parameters)
- `schedule`: String (Nullable, cron expression for automated reports)
- `createdAt`: DateTime

### `GeneratedReport`
A single generated snapshot of a report.
- `id`: UUID
- `definitionId`: UUID (Nullable, FK to SavedReportDefinition)
- `userId`: UUID (FK to User)
- `title`: String
- `summaryText`: Text (LLM-generated localized summary from the data)
- `dataSnapshotJson`: JSONB (Deterministic data retrieved at execution time)
- `locale`: String (The language the summary was generated in)
- `createdAt`: DateTime
