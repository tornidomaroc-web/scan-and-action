import { QueryResultDto } from '../../types/querySchemas';

export class AnswerFormatter {
  /**
   * Core templating dictionary mapping canonical intents to localized human strings.
   * Hardened against empty payloads.
   */
  private templates: Record<string, Record<string, (data: any, meta: any) => string>> = {
    en: {
      clarification: () => "I couldn't quite understand the specific filters for that query. Could you clarify?",
      sum_expenses: (data, meta) => {
         if (!data || data.length === 0) return 'You have zero expenses matching that criteria.';
         if (meta?.isMixedCurrency) {
            return `You have expenses across multiple currencies: ${data.map((d: any) => `${d.sum.toFixed(2)} ${d.currency}`).join(', ')}.`;
         }
         return `You have spent a total of ${data[0].sum.toFixed(2)} ${data[0].currency}.`;
      },
      count_documents: (d) => `You have ${d?.count || 0} documents matching those criteria.`,
      latest_document: (d) => (d && d.length) ? `The latest document was uploaded on ${new Date(d[0].uploadedAt).toLocaleDateString()}.` : 'No documents found.',
      list_documents: (data) => `I found ${data?.length || 0} documents matching your filters.`,
      group_expenses: (data) => data.length ? "Here's the breakdown of your expenses." : "No expense groups found.",
      find_upcoming_appointments: (d) => (d && d.length) ? `You have ${d.length} upcoming appointments booked.` : 'You have no upcoming appointments.',
    },
    fr: {
      clarification: () => "Je n'ai pas tout à fait compris les filtres spécifiques de cette requête. Pourriez-vous clarifier ?",
      sum_expenses: (data, meta) => {
         if (!data || data.length === 0) return 'Vous n\'avez aucune dépense correspondant à ces critères.';
         if (meta?.isMixedCurrency) {
            return `Vous avez des dépenses dans plusieurs devises : ${data.map((d: any) => `${d.sum.toFixed(2)} ${d.currency}`).join(', ')}.`;
         }
         return `Vous avez dépensé un total de ${data[0].sum.toFixed(2)} ${data[0].currency}.`;
      },
      count_documents: (d) => `Vous avez ${d?.count || 0} documents correspondant à ces critères.`,
      latest_document: (d) => (d && d.length) ? `Le dernier document a été téléchargé le ${new Date(d[0].uploadedAt).toLocaleDateString()}.` : 'Aucun document trouvé.',
      list_documents: (data) => `J'ai trouvé ${data?.length || 0} documents correspondant à vos filtres.`,
      group_expenses: (data) => data.length ? "Voici la répartition de vos dépenses." : "Aucun groupe de dépenses trouvé.",
      find_upcoming_appointments: (d) => (d && d.length) ? `Vous avez ${d.length} rendez-vous à venir.` : 'Vous n\'avez aucun rendez-vous à venir.',
    },
    ar: {
      clarification: () => "لم أستطع فهم عوامل التصفية المحددة لهذا الاستعلام بشكل كامل. هل يمكنك التوضيح؟",
      sum_expenses: (data, meta) => {
         if (!data || data.length === 0) return 'ليس لديك نفقات تطابق هذه المعايير.';
         if (meta?.isMixedCurrency) {
            return `لديك نفقات بعملات متعددة: ${data.map((d: any) => `${d.sum.toFixed(2)} ${d.currency}`).join('، ')}.`;
         }
         return `لقد أنفقت ما مجموعه ${data[0].sum.toFixed(2)} ${data[0].currency}.`;
      },
      count_documents: (d) => `لديك ${d?.count || 0} مستندات تطابق هذه المعايير.`,
      latest_document: (d) => (d && d.length) ? `تم رفع أحدث مستند في ${new Date(d[0].uploadedAt).toLocaleDateString()}.` : 'لم يتم العثور على مستندات.',
      list_documents: (data) => `عثرت على ${data?.length || 0} مستندات تناسب اختياراتك.`,
      group_expenses: (data) => data.length ? "إليك تفاصيل نفقاتك." : "لم يتم العثور على مجموعات نفقات.",
      find_upcoming_appointments: (d) => (d && d.length) ? `لديك ${d.length} مواعيد قادمة.` : 'ليس لديك مواعيد قادمة.',
    }
  };

  /**
   * Safely formats the deterministic DTO back to the user context.
   */
  public async formatAnswer(result: QueryResultDto): Promise<any> {
    
    // 1. Safe Halt fallback
    if (result.requiresClarification) {
       const lang = this.templates[result.sourceLanguage] ? result.sourceLanguage : 'en';
       return { answerText: this.templates[lang].clarification(null, null), payload: result.data, metadata: result.metadata };
    }

    // 2. Pure Data Passthrough for Grids / UI Components
    if (result.outputFormat === 'table' || result.outputFormat === 'chart_ready_data') {
       return { payload: result.data, outputFormat: result.outputFormat, metadata: result.metadata };
    }

    // 3. Fallback Localized Templating
    let answerText = "";
    const lang = this.templates[result.sourceLanguage] ? result.sourceLanguage : 'en';

    if (this.templates[lang][result.intent]) {
       answerText = this.templates[lang][result.intent](result.data, result.metadata);
    } else {
       // Optional LLM fallback for deeply complex structures bypassing MVP templates
       answerText = await this.composeViaLLM(result);
    }

    return { answerText, payload: result.data, outputFormat: result.outputFormat, metadata: result.metadata };
  }

  private async composeViaLLM(result: QueryResultDto): Promise<string> {
    return `[LLM-Generated Prose in ${result.sourceLanguage}] The results returned ${result.resultCount} items based on your query.`;
  }
}
