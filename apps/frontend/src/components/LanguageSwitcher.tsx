import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useLanguage();

  const langs: { code: 'en' | 'fr' | 'ar'; label: string }[] = [
    { code: 'en', label: 'EN' },
    { code: 'fr', label: 'FR' },
    { code: 'ar', label: 'AR' },
  ];

  return (
    <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit border border-slate-200 dark:border-slate-700">
      {langs.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLanguage(lang.code)}
          className={`px-3 py-1.5 rounded-md text-xs font-black transition-all ${
            language === lang.code
              ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
};
