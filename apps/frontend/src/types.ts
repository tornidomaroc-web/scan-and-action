export interface QueryResultDto {
  intent: string;
  outputFormat: string;
  requiresClarification: boolean;
  data: any;
  resultCount: number;
  executionTimeMs: number;
  sourceLanguage: string;
  metadata?: any;
  answerText?: string;
}
