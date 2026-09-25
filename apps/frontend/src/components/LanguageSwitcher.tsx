import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

// A segmented control on the tokens: the chosen language is the raised
// segment, the others sit on the muted track. Both sides flip together.
export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useLanguage();

  const langs: { code: 'en' | 'fr' | 'ar'; label: string }[] = [
    { code: 'en', label: 'EN' },
    { code: 'fr', label: 'FR' },
    { code: 'ar', label: 'AR' },
  ];

  return (
    <div className="flex w-fit gap-1 rounded-pill bg-surface-muted p-1" role="group">
      {langs.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => setLanguage(lang.code)}
          aria-pressed={language === lang.code}
          className={`min-h-[36px] rounded-pill px-3.5 text-xs font-bold transition-colors ${
            language === lang.code
              ? 'bg-surface-raised text-ink shadow-card ring-1 ring-line'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
};
