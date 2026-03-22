# Backend Express API Routes

The REST API exposes the pure deterministic Query and Ingestion pipelines mapped to explicit frontend inputs. 

## Endpoints

### 1. Execute Search Query
`POST /api/search`
Translates NLP questions into rigidly formatted localized Data visualizations.
**Request Body**:
```json
{
  "query": "Total expenses this month",
  "language": "en"
}
```
**Response**: `QueryResultDto` 
 *(Output Formats: short_answer, table, chart_ready_data)*

### 2. Fetch Smart Report
`GET /api/reports/:id`
Triggers defined metric arrays bypassing the standard `IntentParser`.
**Params**: `id` (e.g., `monthly_expenses`, `recent_cards`)
**Query Map**: `?language=en`
**Response**: `QueryResultDto`

### 3. Fetch Document Details
`GET /api/documents/:id`
Returns a sanitized explicit DTO of a specific Document isolating DB relationships.
**Response**: `DocumentDetailDto` (mapped arrays, omitted IDs)

### 4. Fetch Review Queue
`GET /api/review`
Checks algorithm compliance tracking and fetches docs lacking >80% score or designated `NEEDS_REVIEW`.
**Response**: `DocumentDetailDto[]` 

### 5. Multi-part Injection
`POST /api/documents/upload`
Initiate Gemini processing.
**Form Data**: `file` (Multipart attachment)
**Response**: `{ documentId: string, status: string, confidence: number }`
