import { QueryIntentSchema, QueryIntent } from '../../../../../packages/shared/src/querySchemas';

export class IntentParserService {

  /**
   * Translates a natural language question (Arabic, French, English) into a strict JSON Intent.
   * This is ONE OF THE ONLY places the LLM is used in the query pipeline.
   */
  public async parseUserQuery(userQueryText: string, sourceLanguage: string): Promise<QueryIntent> {
    console.log(`[IntentParser] Parsing ${sourceLanguage} question: "${userQueryText}"`);

    const prompt = `
      You are an expert intent parsing engine for a document management database.
      The user is asking a question in ${sourceLanguage}.
      Map their question into the provided JSON schema.
      
      CRITICAL RULES:
      - Translate all concepts, categories, and entities to Canonical English internal values (e.g., 'factures' -> 'INVOICE').
      - DO NOT invent unsupported filters or guess missing constraints.
      - If the question is ambiguous or lacks necessary context, set \`needsClarification = true\`.
      - Use ONLY the supported intents listed in the schema.
      - Never infer data that isn't explicitly implied by the user.
    `;

    // MOCK LLM CALL
    // In production: const result = await gemini.generateContent({ prompt, schema: QueryIntentSchema });
    
    // Simulate detecting a French query summing expenses for Uber
    // Query: "Combien ai-je dépensé chez Uber le mois dernier?"
    const mockIntent: QueryIntent = {
      intent: 'sum_expenses',
      documentTypes: ['INVOICE', 'RECEIPT'],
      entityNames: ['UBER'],
      dateRange: {
        relativeExpression: 'last_month'
      },
      aggregation: {
        operation: 'SUM'
      },
      outputFormat: 'short_answer',
      confidence: 0.98,
      needsClarification: false
    };

    return QueryIntentSchema.parse(mockIntent); 
  }
}
