import { QueryResultDto } from '../types';

export const mockReplies: Record<string, QueryResultDto> = {
  short_answer: {
     intent: 'sum_expenses',
     outputFormat: 'short_answer',
     requiresClarification: false,
     data: [{ sum: 1240.50, currency: 'USD' }],
     resultCount: 1,
     executionTimeMs: 42,
     sourceLanguage: 'en',
     answerText: 'You spent a total of 1240.50 USD.'
  },
  clarification: {
     intent: 'unknown',
     outputFormat: 'short_answer',
     requiresClarification: true,
     data: { message: 'CLARIFICATION_REQUIRED' },
     resultCount: 0,
     executionTimeMs: 12,
     sourceLanguage: 'en',
     answerText: 'Please clarify your filters.'
  },
  table: {
     intent: 'list_documents',
     outputFormat: 'table',
     requiresClarification: false,
     data: [
       { id: 'doc-1', documentType: 'INVOICE', uploadedAt: '2026-03-12T10:00:00Z', confidence: 0.95 },
       { id: 'doc-2', documentType: 'RECEIPT', uploadedAt: '2026-03-14T11:30:00Z', confidence: 0.88 }
     ],
     resultCount: 2,
     executionTimeMs: 84,
     sourceLanguage: 'en'
  },
  chart: {
     intent: 'group_expenses',
     outputFormat: 'chart_ready_data',
     requiresClarification: false,
     data: [
       { category: 'TRAVEL', sum: 800, currency: 'USD' },
       { category: 'MEALS', sum: 440.50, currency: 'USD' }
     ],
     resultCount: 2,
     executionTimeMs: 110,
     sourceLanguage: 'en',
     metadata: { groupingContext: 'EXPENSE_CATEGORY' }
  }
};

export const mockDocuments = [
  {
    id: 'doc-123',
    originalFileName: 'uber_receipt_mar.pdf',
    documentType: 'RECEIPT',
    detectedLanguage: 'en',
    overallConfidence: 0.95,
    status: 'PROCESSED',
    uploadedAt: '2026-03-15T08:00:00Z',
    summary: 'Uber ride from airport to hotel.',
    facts: [
      { key: 'TOTAL_AMOUNT', valueNumber: 45.50 },
      { key: 'EXPENSE_CATEGORY', valueString: 'TRAVEL' },
      { key: 'CURRENCY', valueString: 'USD' }
    ],
    entities: [
      { name: 'Uber Technologies', role: 'VENDOR' }
    ]
  },
  {
    id: 'doc-124',
    originalFileName: 'blurred_invoice.jpg',
    documentType: 'INVOICE',
    detectedLanguage: 'fr',
    overallConfidence: 0.65,
    status: 'NEEDS_REVIEW',
    uploadedAt: '2026-03-16T09:15:00Z',
    summary: 'Unclear vendor details.',
    facts: [
      { key: 'TOTAL_AMOUNT', valueNumber: 120.00 }
    ],
    entities: []
  }
];
