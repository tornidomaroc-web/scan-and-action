import { describe, it, expect } from 'vitest';
import { ExpenseCategorizationService } from './expenseCategorizationService';

const svc = new ExpenseCategorizationService();
const cat = (merchantName: string | null, rawText = '') =>
  svc.categorize({ merchantName, rawText, facts: [] });

describe('ExpenseCategorizationService — accent- and boundary-aware (item C)', () => {
  it('categorizes an accented food merchant as Food', () => {
    expect(cat('Café Central').category).toBe('Food');
  });

  it('folds accents in raw OCR text too', () => {
    expect(cat(null, 'Déjeuner au Café du coin').category).toBe('Food');
  });

  it('does NOT misclassify "Vegas Hotel" as Transport via the old gas-substring', () => {
    // Old naive .includes('gas') matched "veGAS"; whole-word matching sees only
    // the token 'hotel' -> Travel.
    expect(cat('Vegas Hotel').category).toBe('Travel');
  });

  it('still matches a genuine spaced keyword (gas station -> Transport)', () => {
    expect(cat('Downtown Gas Station').category).toBe('Transport');
  });

  it('returns Other for an unrelated merchant (unchanged default)', () => {
    const r = cat('Random XYZ Holdings');
    expect(r.category).toBe('Other');
    expect(r.confidence).toBe(0.5);
  });
});
