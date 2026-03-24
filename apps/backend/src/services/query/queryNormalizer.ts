import { QueryIntent } from '../../types/querySchemas';

export class QueryNormalizer {
  
  /**
   * Deterministically resolves relative dates into strict ISO DB boundaries.
   * This MUST be run in code, never by the LLM, to ensure timezone and logical accuracy.
   */
  public resolveDateRange(relativeExpression?: string): { start?: Date, end?: Date } {
    if (!relativeExpression) return {};
    
    // In production, use date-fns or moment
    const now = new Date();
    if (relativeExpression === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start, end };
    }
    
    if (relativeExpression === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: now };
    }

    if (relativeExpression === 'this_year') {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end: now };
    }

    return {};
  }
}
