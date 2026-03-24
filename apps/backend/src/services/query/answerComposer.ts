import { QueryIntent } from '../../types/querySchemas';

export class AnswerComposer {

  /**
   * Final step in pipeline: Takes the hardened, deterministic math from the Executor,
   * reads the User's original request, and asks the LLM to format it politely 
   * back into the User's native language.
   * 
   * No math is allowed in this step!
   */
  public async formatLocalizedAnswer(rawQueryText: string, sourceLanguage: string, intent: QueryIntent, dataSnapshot: any): Promise<string> {
    
    // If output is table or chart, bypass LLM completely. Let UI render the dataSnapshot.
    if (intent.outputFormat === 'table' || intent.outputFormat === 'chart_ready_data') {
       return JSON.stringify(dataSnapshot);
    }

    const dataPayload = JSON.stringify(dataSnapshot);

    const prompt = `
      You are generating the final text response for a user based on their query: "${rawQueryText}".
      They asked this in language: ${sourceLanguage}.
      
      Here is the exact data retrieved from the database to answer them:
      ${dataPayload}
      
      RULES:
      1. DO NOT perform ANY calculations. Use the exact numbers provided in the data payload.
      2. If the data says the sum is 150.50, you must say 150.50.
      3. Reply entirely in ${sourceLanguage}.
      4. Be extremely brief, concise, and professional. One sentence if possible.
    `;

    // MOCK LLM CALL
    // In production: return (await gemini.generateContent(prompt)).response.text();
    
    // Simulating a French summary of deterministic data { sum: 145.50 }
    if (sourceLanguage.startsWith('fr') && intent.intent === 'sum_expenses') {
       return "Vous avez dépensé un total de 145,50 € chez Uber le mois dernier.";
    }

    return `Answer generated based on: ${dataPayload}`;
  }
}
