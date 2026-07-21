import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { strings } from '../i18n/strings';

type Language = 'en' | 'fr' | 'ar';
const SUPPORTED: Language[] = ['en', 'fr', 'ar'];

/**
 * Resolve the UI language WITHOUT React context.
 *
 * This is deliberate. The fallback renders only when the tree below it has
 * already thrown; it must not add a second failure mode of its own. Calling
 * `useStrings()` would make the crash screen depend on LanguageContext still
 * being healthy — and if that hook threw, React would unwind past the boundary
 * and we'd be back to the white screen this component exists to remove.
 *
 * Reading localStorage directly is exactly how LanguageProvider seeds its own
 * state (i18n/LanguageContext.tsx:13-15), so the two agree; the strings table is
 * still the single source of translation copy. localStorage access is wrapped
 * because it throws in some WebView / private-mode configurations.
 */
export function resolveCrashLanguage(): Language {
  try {
    const stored = localStorage.getItem('lang');
    if (stored && (SUPPORTED as string[]).includes(stored)) return stored as Language;
  } catch {
    /* localStorage unavailable — fall through to the default */
  }
  return 'en';
}

/**
 * The crash screen shown by Sentry.ErrorBoundary in main.tsx when a render
 * throws. Before this existed, a render throw unmounted the tree to a blank
 * white page with no copy and no way out.
 *
 * Localised in all three locales, and `dir` is set on this element explicitly
 * rather than relying on <html dir> — LanguageProvider's effect sets that, and
 * a crash during the very first render can beat it.
 */
export const AppCrashFallback: React.FC = () => {
  const lang = resolveCrashLanguage();
  const s = strings[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  return (
    <div
      dir={dir}
      lang={lang}
      role="alert"
      className="min-h-screen w-full flex items-center justify-center bg-surface px-6 py-10"
    >
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 bg-danger/15 text-danger rounded-btn flex items-center justify-center mx-auto mb-5">
          <AlertTriangle size={28} />
        </div>

        <h1 className="text-title-lg font-bold text-ink mb-3">{s.appCrashTitle}</h1>

        <p className="text-sm leading-relaxed text-ink-secondary mb-7">{s.appCrashBody}</p>

        {/* A full reload, not resetError(): the tree that just threw is of
            unknown state, and re-rendering it usually throws straight back. */}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full min-h-[44px] bg-accent hover:bg-accent-hover text-white py-3 rounded-btn font-semibold shadow-card active:scale-[0.98] transition-all"
        >
          {s.appCrashReload}
        </button>
      </div>
    </div>
  );
};

export default AppCrashFallback;
