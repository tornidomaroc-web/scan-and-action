export type LanguageCode = string; // e.g., 'en', 'es', 'fr', 'ar'
export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NEEDS_REVIEW';
export type QueryStatus = 'SUCCESS' | 'PARSE_ERROR' | 'EXECUTION_ERROR';

export interface ScanDocument {
  id: string;
  userId: string;
  originalFileName: string;
  fileUrl: string;
  documentType: string;
  documentSubtype: string;
  detectedLanguage: LanguageCode;
  rawText: string;
  normalizedText: string;
  summary: string;
  overallConfidence: number;
  status: DocumentStatus;
  uploadedAt: Date;
  processedAt?: Date;
}

export interface DocumentFact {
  id: string;
  documentId: string;
  factType: string;         // e.g., 'AMOUNT', 'DATE'
  key: string;              // Canonical English key
  valueString?: string;
  valueNumber?: number;
  valueDate?: Date;
  currency?: string;
  confidence: number;
  sourceSpan: string;       // Text span indicating location in raw text
  isReviewed: boolean;
}

export interface Entity {
  id: string;
  userId: string;
  entityType: string;       // e.g., 'VENDOR', 'PROJECT'
  canonicalName: string;    // Always English canonical
  aliases: string[];
  metadataJson: Record<string, any>;
  createdAt: Date;
}

export interface DocumentEntity {
  id: string;
  documentId: string;
  entityId: string;
  role: string;             // e.g., 'PAYEE', 'ISSUER'
  confidence: number;
}

export interface QueryIntent {
  filters: Array<{ field: string; operator: string; value: any }>;
  aggregations: Array<{ type: string; field: string }>;
}

export interface QueryPlan {
  sqlOrOrmQueries: string[];
  expectedColumns: string[];
}

export interface QueryLog {
  id: string;
  userId: string;
  rawQueryText: string;
  sourceLanguage: LanguageCode;
  parsedIntentJson: QueryIntent;
  queryPlanJson: QueryPlan;
  executionTimeMs: number;
  resultCount: number;
  status: QueryStatus;
  errorMessage?: string;
  createdAt: Date;
}

export interface SavedReportDefinition {
  id: string;
  userId: string;
  title: string;
  description: string;
  queryTemplateJson: QueryIntent;
  schedule?: string;
  createdAt: Date;
}

export interface GeneratedReport {
  id: string;
  definitionId?: string;
  userId: string;
  title: string;
  summaryText: string;
  dataSnapshotJson: any;    // Snapshot of deterministic data results
  locale: LanguageCode;
  createdAt: Date;
}
