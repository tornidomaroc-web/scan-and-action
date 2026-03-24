import { QueryIntentSchema, QueryIntent } from '../../types/querySchemas';

export class IntentParserService {

  /**
   * Translates a natural language question (Arabic, French, English) into a strict JSON Intent.
   * This is ONE OF THE ONLY places the LLM is used in the query pipeline.
   */
  public async parseUserQuery(userQueryText: string, sourceLanguage: string): Promise<QueryIntent> {
    const q = userQueryText.toLowerCase().trim();
    console.log(`[IntentParser] Parsing ${sourceLanguage} question: "${q}"`);

    const intent: QueryIntent = {
      intent: 'list_documents', // Default fallback
      outputFormat: 'table',
      confidence: 0.5,
      needsClarification: false
    };

    // 1. Detect Intent Type (Order matters: more specific first)
    
    // Aggregation: SUM
    const sumKeywords = ['total', 'sum', 'how much', 'spent', 'spending', 'total des dépenses', 'montant total', 'combien', 'إجمالي', 'مجموع', 'كم أنفقت'];
    if (sumKeywords.some(k => q.includes(k))) {
      intent.intent = 'sum_expenses';
      intent.outputFormat = 'short_answer';
      intent.aggregation = { operation: 'SUM' };
      intent.confidence = 0.8;
    }

    // Aggregation: COUNT
    const countKeywords = ['count', 'number of', 'how many', 'nombre de', 'combien de documents', 'عدد', 'كم عدد'];
    if (countKeywords.some(k => q.includes(k))) {
      intent.intent = 'count_documents';
      intent.outputFormat = 'short_answer';
      intent.aggregation = { operation: 'COUNT' };
      intent.confidence = 0.8;
    }

    // Grouping
    const groupKeywords = ['by category', 'per category', 'par catégorie', 'حسب الفئة', 'by vendor', 'per vendor', 'par fournisseur', 'حسب المورد'];
    if (groupKeywords.some(k => q.includes(k))) {
      intent.intent = 'group_expenses';
      intent.outputFormat = 'chart_ready_data';
      intent.confidence = 0.9;
    }

    // Latest document
    const latestKeywords = ['latest', 'recent', 'most recent', 'dernier', 'أحدث', 'أخير'];
    if (latestKeywords.some(k => q.includes(k)) && intent.intent === 'list_documents') {
      intent.intent = 'latest_document';
      intent.outputFormat = 'short_answer';
      intent.confidence = 0.8;
    }

    // 2. Detect Date Ranges
    const lastMonthKeywords = ['last month', 'le mois dernier', 'الشهر الماضي'];
    const thisMonthKeywords = ['this month', 'ce mois', 'هذا الشهر'];
    const thisYearKeywords = ['this year', 'cette année', 'هذا العام'];
    const todayKeywords = ['today', 'aujourd\'hui', 'اليوم'];

    if (lastMonthKeywords.some(k => q.includes(k))) {
      intent.dateRange = { relativeExpression: 'last_month' };
    } else if (thisMonthKeywords.some(k => q.includes(k))) {
      intent.dateRange = { relativeExpression: 'this_month' };
    } else if (thisYearKeywords.some(k => q.includes(k))) {
      intent.dateRange = { relativeExpression: 'this_year' };
    } else if (todayKeywords.some(k => q.includes(k))) {
      intent.dateRange = { relativeExpression: 'today' };
    }

    // 3. Detect Document Types
    const invoiceKeywords = ['invoice', 'facture', 'bill', 'فاتورة', 'فواتير'];
    const receiptKeywords = ['receipt', 'reçu', 'ticket', 'إيصال', 'وصل'];
    
    const detectedDocTypes: string[] = [];
    if (invoiceKeywords.some(k => q.includes(k))) detectedDocTypes.push('INVOICE');
    if (receiptKeywords.some(k => q.includes(k))) detectedDocTypes.push('RECEIPT');
    
    if (detectedDocTypes.length > 0) {
      intent.documentTypes = detectedDocTypes;
      intent.confidence += 0.1;
    }

    // 3. Detect Status Shortcuts
    const pendingKeywords = ['pending', 'review', 'needs review', 'en attente', 'à réviser', 'قيد الانتظار', 'للمراجعة'];
    if (pendingKeywords.some(k => q.includes(k))) {
       intent.categories = intent.categories || [];
       if (!intent.categories.includes('NEEDS_REVIEW')) {
         intent.categories.push('NEEDS_REVIEW');
       }
       intent.confidence += 0.1;
    }

    // 4. Ambiguity Check
    if (q.length < 3) {
      intent.needsClarification = true;
      intent.confidence = 0.1;
    }

    return QueryIntentSchema.parse(intent);
  }
}
