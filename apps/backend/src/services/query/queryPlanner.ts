import { QueryIntent, QueryPlan } from '../../../../../packages/shared/src/querySchemas';
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
      const dates = this.normalizer.resolveDateRange(intent.dateRange.relativeExpression);
      const start = intent.dateRange.startIso ? new Date(intent.dateRange.startIso) : dates.start;
      const end = intent.dateRange.endIso ? new Date(intent.dateRange.endIso) : dates.end;

      if (start) plan.filters.push({ field: 'Document.uploadedAt', operator: 'gte', value: start });
      if (end) plan.filters.push({ field: 'Document.uploadedAt', operator: 'lte', value: end });
    }

    // Category-aware expense planning & fully qualified lists
    switch (intent.intent) {
      case 'sum_expenses':
      case 'group_expenses':
        plan.sourceTables.push('DocumentFact');
        plan.filters.push({ field: 'DocumentFact.factType', operator: 'eq', value: 'AMOUNT' });
        
        if (intent.categories && intent.categories.length > 0) {
           // We use the explicit logical field mapping instead of arbitrary keys
           plan.filters.push({ field: 'ExpenseCategory', operator: 'in', value: intent.categories });
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
           plan.filters.push({ field: 'ExpenseCategory', operator: 'in', value: intent.categories });
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

    return plan;
  }
}
