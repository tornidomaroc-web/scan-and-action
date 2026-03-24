export interface QueryResultDto {
  intent: string;
  outputFormat: string;
  requiresClarification: boolean;
  data: any;
  resultCount: number;
  executionTimeMs: number;
  sourceLanguage: string;
  explanation?: string;
  metadata?: any;
  answerText?: string;
}
export interface DocumentDto {
  id: string;
  originalFileName: string;
  fileUrl: string;
  documentType: string;
  detectedLanguage: string;
  summary?: string;
  overallConfidence: number;
  status: string;
  uploadedAt: string;
  facts: Array<{
    key: string;
    valueString?: string;
    valueNumber?: number;
    valueDate?: string;
    currency?: string;
    confidence: number;
  }>;
  entities: Array<{
    name: string;
    role: string;
    aliases: string[];
  }>;
}
