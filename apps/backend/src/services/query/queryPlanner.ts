import { QueryIntent, QueryPlan } from '../../types/querySchemas';
import { QueryNormalizer } from './queryNormalizer';

export class QueryPlanner {
  private normalizer = new QueryNormalizer();

  /**
   * Deterministically maps a fuzzy intent block into a strict execution graph.
   */
  public generatePlan(intent: QueryIntent): QueryPlan {
    const plan: QueryPlan = {
      sourceTables: ['Document'],
      joins: [],
      filters: [],
      outputMode: intent.outputFormat
    };

    // 1. Clarification-safe planning
    if (intent.needsClarification) {
      plan.requiresClarification = true;
      plan.filters = [];
      plan.joins = [];
      plan.sourceTables = [];
      return plan;
    }

    // Safely resolve temporal phrasing to strict date objects (Consistent field naming)
    if (intent.dateRange) {
      // Phase B: Handle Date Ranges
      if (intent.dateRange?.relativeExpression) {
        const now = new Date();
        let start: Date | null = null;
        let end: Date | null = null;

        switch (intent.dateRange.relativeExpression) {
          case 'today':
            start = new Date(now.setHours(0, 0, 0, 0));
            break;
          case 'this_month':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'last_month':
            start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            end = new Date(now.getFullYear(), now.getMonth(), 0);
            break;
          case 'this_year':
            start = new Date(now.getFullYear(), 0, 1);
            break;
        }

        if (start) plan.filters.push({ field: 'Document.uploadedAt', operator: 'gte', value: start });
        if (end) plan.filters.push({ field: 'Document.uploadedAt', operator: 'lte', value: end });
      }

      // Handle explicit ISO dates if present, overriding or complementing relative dates
      const dates = this.normalizer.resolveDateRange(intent.dateRange.relativeExpression); // Still use normalizer for non-relative expressions or fallback
      const start = intent.dateRange.startIso ? new Date(intent.dateRange.startIso) : dates.start;
      const end = intent.dateRange.endIso ? new Date(intent.dateRange.endIso) : dates.end;

      // Only add if not already set by relative expression or if explicit ISO date is provided
      if (start && !plan.filters.some(f => f.field === 'Document.uploadedAt' && f.operator === 'gte')) {
        plan.filters.push({ field: 'Document.uploadedAt', operator: 'gte', value: start });
      }
      if (end && !plan.filters.some(f => f.field === 'Document.uploadedAt' && f.operator === 'lte')) {
        plan.filters.push({ field: 'Document.uploadedAt', operator: 'lte', value: end });
      }
    }

    // Phase B: Handle Latest Document
    if (intent.intent === 'latest_document') {
      plan.outputMode = 'short_answer';
      plan.limit = 1;
      plan.sort = { field: 'Document.uploadedAt', direction: 'desc' };
      return plan; // This intent is self-contained, no further planning needed
    }

    // Category-aware expense planning & fully qualified lists
    switch (intent.intent) {
      case 'sum_expenses':
      case 'group_expenses':
        plan.sourceTables.push('DocumentFact');
        plan.filters.push({ field: 'DocumentFact.factType', operator: 'eq', value: 'AMOUNT' });
        plan.filters.push({ field: 'DocumentFact.key', operator: 'eq', value: 'TOTAL_AMOUNT' });
        
        if (intent.categories && intent.categories.length > 0) {
           const statusFilters = (intent.categories || []).filter((c: string) => ['NEEDS_REVIEW', 'COMPLETED', 'PENDING'].includes(c));
           if (statusFilters.length > 0) {
             plan.filters.push({ field: 'Document.status', operator: 'in', value: statusFilters });
           } else {
             plan.filters.push({ field: 'ExpenseCategory', operator: 'in', value: intent.categories });
           }
        }

        if (intent.entityNames && intent.entityNames.length > 0) {
           plan.filters.push({ field: 'Entity.canonicalName', operator: 'in', value: intent.entityNames });
        }
        
        if (intent.intent === 'sum_expenses') {
          plan.aggregations = {
            operation: 'SUM',
            field: 'DocumentFact.valueNumber'
          };
        }
        break;

      case 'list_documents':
      case 'count_documents':
        if (intent.documentTypes) {
          plan.filters.push({ field: 'Document.documentType', operator: 'in', value: intent.documentTypes });
        }
        
        if (intent.categories && intent.categories.length > 0) {
           const statusFilters = (intent.categories || []).filter((c: string) => ['NEEDS_REVIEW', 'COMPLETED', 'PENDING'].includes(c));
           if (statusFilters.length > 0) {
             plan.filters.push({ field: 'Document.status', operator: 'in', value: statusFilters });
           } else {
             plan.filters.push({ field: 'ExpenseCategory', operator: 'in', value: intent.categories });
           }
        }

        if (intent.entityNames && intent.entityNames.length > 0) {
           plan.filters.push({ field: 'Entity.canonicalName', operator: 'in', value: intent.entityNames });
        }

        if (intent.intent === 'count_documents') {
          plan.aggregations = { operation: 'COUNT', field: 'Document.id' };
        } else {
          plan.limit = 50;
          plan.sort = { field: 'Document.uploadedAt', direction: 'desc' };
        }
        break;
        
      case 'find_upcoming_appointments':
        plan.filters.push({ field: 'Document.documentType', operator: 'eq', value: 'APPOINTMENT' });
        plan.limit = 20;
        break;

      default:
        // Scaffolding default
        plan.limit = 10;
    }

    plan.explanation = this.generateExplanation(intent);
    return plan;
  }

  private generateExplanation(intent: QueryIntent): string {
    const parts: string[] = [];
    
    switch (intent.intent) {
      case 'sum_expenses': parts.push('Calculating total spend'); break;
      case 'group_expenses': parts.push('Grouping expenses'); break;
      case 'list_documents': parts.push('Listing documents'); break;
      case 'count_documents': parts.push('Counting documents'); break;
      case 'latest_document': parts.push('Finding the latest document'); break;
      default: parts.push('Searching workspace');
    }

    if (intent.entityNames && intent.entityNames.length > 0) {
      parts.push(`for ${intent.entityNames.join(', ')}`);
    }

    if (intent.categories && intent.categories.length > 0) {
      parts.push(`under ${intent.categories.join(', ')}`);
    }

    if (intent.dateRange?.relativeExpression) {
      parts.push(`from ${intent.dateRange.relativeExpression.replace(/_/g, ' ')}`);
    }

    return parts.join(' ') + '.';
  }
}
