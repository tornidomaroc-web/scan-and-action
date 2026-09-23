import { GoogleGenerativeAI } from '@google/generative-ai';
import { categoryPromptFragment, normalizeCategory, ExpenseCategory } from '../expenseCategories';
import { pinnedModelId } from './modelArm';

/**
 * Text-only classification, for the backfill and the measurement. It asks the
 * same model the extraction uses, with the same category fragment, but sends
 * stored text instead of an image: one small call per document, no scan
 * charged, nothing on the Document row touched by this module.
 *
 * Returns null when the model's answer is not on the list, exactly as the
 * extraction path does, so callers can fall back to the keyword matcher.
 */
export class CategoryClassifier {
  private genAI: GoogleGenerativeAI;
  constructor(apiKey = process.env.GEMINI_API_KEY || '') {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async classify(rawText: string, merchantName: string | null, injectedModelId?: string): Promise<ExpenseCategory | null> {
    const model = this.genAI.getGenerativeModel({
      model: injectedModelId ?? pinnedModelId(),
      generationConfig: { responseMimeType: 'application/json', temperature: 0.0 },
    });
    const prompt = `You sort expense documents into categories.
Return JSON only: { ${categoryPromptFragment()} }
Merchant: ${merchantName || 'unknown'}
Document text:
${rawText.slice(0, 4000)}`;
    const result = await model.generateContent([prompt]);
    let parsed: any;
    try { parsed = JSON.parse(result.response.text()); } catch { return null; }
    return normalizeCategory(parsed && parsed.category);
  }
}
