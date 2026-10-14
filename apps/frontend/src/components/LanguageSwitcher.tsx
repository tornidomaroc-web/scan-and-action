import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

// A segmented control on the tokens: the chosen language is the raised
// segment, the others sit on the track pressed into the surface. Both sides
// flip together. The others are ink-secondary: muted on the track measured
// 3.97:1 in light (softSurfaces.test.ts).
export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useLanguage();

  const langs: { code: 'en' | 'fr' | 'ar'; label: string }[] = [
    { code: 'en', label: 'EN' },
    { code: 'fr', label: 'FR' },
    { code: 'ar', label: 'AR' },
  ];

  return (
    <div className="flex w-fit gap-1 rounded-pill bg-surface-muted p-1 shadow-pressed" role="group">
      {langs.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => setLanguage(lang.code)}
          aria-pressed={language === lang.code}
          className={`min-h-[36px] rounded-pill px-3.5 text-xs font-bold transition-colors ${
            language === lang.code
              ? 'bg-surface-raised text-ink shadow-card ring-1 ring-line'
              : 'text-ink-secondary hover:text-ink'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
};
