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
  documentTypes: z.array(z.string()).optional().describe("E.g., ['INVOICE', 'RECEIPT']"),
  categories: z.array(z.string()).optional().describe("Canonical categories like ['TRAVEL', 'MEALS']"),
  entityNames: z.array(z.string()).optional().describe("Canonical names like ['HOME DEPOT', 'UBER']"),
  
  // The LLM parses natural language "last month" into this structured object
  dateRange: z.object({
    startIso: z.string().optional().describe("YYYY-MM-DD or relative like 'now-30d'"),
    endIso: z.string().optional().describe("YYYY-MM-DD"),
    relativeExpression: z.string().optional().describe("e.g., 'this_month', 'last_year'")
  }).optional(),
  
  aggregation: z.object({
    operation: z.enum(['SUM', 'AVG', 'MIN', 'MAX', 'COUNT']).optional()
  }).optional(),
  
  outputFormat: OutputModes,
  confidence: z.number().describe("LLM's confidence that it understood the intent correctly"),
  needsClarification: z.boolean().describe("True if the query is too ambiguous to formulate a plan")
});

export type QueryIntent = z.infer<typeof QueryIntentSchema>;

export interface QueryPlan {
  sourceTables: string[]; // e.g. ['Document', 'DocumentFact', 'Entity']
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
}

export interface QueryResultDto {
  intent: string;
  outputFormat: string;
  requiresClarification: boolean;
  data: any; // e.g., numeric sum, arrays of documents, or aggregated group maps
  resultCount: number;
  executionTimeMs: number;
  sourceLanguage: string;
  metadata?: {
    currencies?: string[];
    isMixedCurrency?: boolean;
    groupingContext?: string;
  };
}
