import { z } from 'zod';

export const SupportedIntents = z.enum([
  'sum_expenses',
  'list_documents',
  'count_documents',
  'latest_document',
  'extract_contacts',
  'group_expenses',
  'find_upcoming_appointments',
  'timeline'
]);

export const OutputModes = z.enum([
  'short_answer',
  'table',
  'report',
  'chart_ready_data'
]);

export const QueryIntentSchema = z.object({
  intent: SupportedIntents,
  documentTypes: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  entityNames: z.array(z.string()).optional(),
  
  dateRange: z.object({
    startIso: z.string().optional(),
    endIso: z.string().optional(),
    relativeExpression: z.string().optional()
  }).optional(),
  
  aggregation: z.object({
    operation: z.enum(['SUM', 'AVG', 'MIN', 'MAX', 'COUNT']).optional()
  }).optional(),
  
  outputFormat: OutputModes,
  confidence: z.number(),
  needsClarification: z.boolean()
});

export type QueryIntent = z.infer<typeof QueryIntentSchema>;

export interface QueryPlan {
  sourceTables: string[];
  joins: Array<{
    targetTable: string;
    onLeft: string;
    onRight: string;
  }>;
  filters: Array<{
    field: string;
    operator: 'eq' | 'in' | 'gte' | 'lte' | 'contains';
    value: any;
  }>;
  aggregations?: {
    operation: 'SUM' | 'COUNT' | 'AVG';
    field: string;
  };
  groupBy?: string[];
  sort?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  outputMode: z.infer<typeof OutputModes>;
  requiresClarification?: boolean;
  explanation?: string;
}

export interface QueryResultDto {
  intent: string;
  outputFormat: string;
  requiresClarification: boolean;
  data: any;
  resultCount: number;
  executionTimeMs: number;
  sourceLanguage: string;
  explanation?: string;
  metadata?: {
    currencies?: string[];
    isMixedCurrency?: boolean;
    groupingContext?: string;
  };
}
