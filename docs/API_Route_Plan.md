# API Route Plan

A REST or tRPC API will be exposed by the backend to communicate with the frontend.

## Document Management
- `POST /api/v1/documents`
  - **Content-Type**: `multipart/form-data`
  - **Action**: Uploads a scanned document, creates a DB record, and triggers the extraction job.
  - **Returns**: `{ documentId, status }`

- `GET /api/v1/documents/:id`
  - **Action**: Polls for processing status and returns extracted facts if completed.
  - **Returns**: `ScanDocument` with nested `ExtractedFact[]`.

## Search & Query
- `POST /api/v1/query`
  - **Body**: `{ queryText: string, targetLanguage: string }`
  - **Action**: 
    1. LLM parses `queryText` to `QueryIntent`.
    2. Engine executes DB query.
    3. LLM formats results into `targetLanguage`.
  - **Returns**: `{ answerText: string, rawData: object[], aggregations: object }`

## Smart Reports
- `GET /api/v1/reports`
  - **Action**: Retrieves a list of generated reports.
- `POST /api/v1/reports/generate`
  - **Body**: `{ topic: string, dateRange: ... }`
  - **Action**: Gathers deterministic facts, uses LLM to write a localized summary, saves the report.
  - **Returns**: `SmartReport`

## Review Queue
- `GET /api/v1/review-queue`
  - **Action**: Fetches facts with low confidence.
  - **Returns**: `ReviewQueueItem[]`
- `POST /api/v1/review-queue/:id/resolve`
  - **Body**: `{ canonicalCategory: string, canonicalEntity: string, numericValue: number }`
  - **Action**: Updates the base fact and marks `isReviewed = true`.

## Query Logs
- `GET /api/v1/logs/queries`
  - **Action**: Useful for admins to see how queries were parsed and executed.
  - **Returns**: `QueryLog[]`
