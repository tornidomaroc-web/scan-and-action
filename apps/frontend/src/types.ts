export interface QueryResultDto {
  intent: string;
  outputFormat: string;
  requiresClarification: boolean;
  data: any;
  resultCount: number;
  executionTimeMs: number;
  sourceLanguage: string;
  /**
   * KNOWN DEAD PAYLOAD — arrives on every /api/search response, read by nothing.
   *
   * The backend still computes it (queryPlanner.ts:143 -> generateExplanation at
   * :147-172) and still ships it (queryExecutor.ts:202). Its only reader was the
   * intent strip on SearchScreen, deleted because the fragments are hardcoded
   * English and the information is already on screen twice.
   *
   * The field is KEPT here on purpose. It is genuinely in the wire response, and
   * a DTO that omits it would misdescribe the payload — the next person to add a
   * consumer would have no idea the field arrives. Declared, documented, unread.
   *
   * WHETHER THE BACKEND SHOULD STOP SENDING IT IS AN OPEN DECISION, and it belongs
   * to the held backend batch (alongside answerFormatter.ts's locale-less
   * toLocaleDateString and geminiAdapter.ts's English constants) — not to a
   * frontend PR, and not to whoever notices the silence first. Recorded here so it
   * is decided deliberately rather than discovered by someone who assumes an
   * unused field must have a reader somewhere.
   */
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
