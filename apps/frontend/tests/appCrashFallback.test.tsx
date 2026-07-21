import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { AppCrashFallback, resolveCrashLanguage } from '../src/components/AppCrashFallback';

// ============================================================================
// APP-CRASH FALLBACK — a render throw must show localized copy, not a white page.
// ============================================================================
// Before this, main.tsx had NO error boundary: a throw during render unmounted
// the whole tree, leaving a blank white page with no copy, no reload affordance
// and no signal. This pins the replacement.
//
// jsdom, fully offline. VITE_SENTRY_DSN is unset here (as in CI), so no Sentry
// client exists — which is itself part of the assertion: the boundary's fallback
// must render whether or not Sentry is enabled.
// ============================================================================

type Locale = 'en' | 'fr' | 'ar';
const LOCALES: Locale[] = ['en', 'fr', 'ar'];
const CRASH_KEYS = ['appCrashTitle', 'appCrashBody', 'appCrashReload'] as const;

let container: HTMLDivElement;
let root: Root;
let consoleError: ReturnType<typeof vi.spyOn>;

/** A child that throws during render — the exact shape that used to white-screen. */
const Exploding: React.FC = () => {
  throw new Error('render exploded');
};

function mountCrashingApp(lang: Locale) {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      // Same nesting as main.tsx: the boundary sits INSIDE LanguageProvider.
      <LanguageProvider>
        <Sentry.ErrorBoundary fallback={<AppCrashFallback />}>
          <Exploding />
        </Sentry.ErrorBoundary>
      </LanguageProvider>
    );
  });
}

beforeEach(() => {
  localStorage.clear();
  // React logs the caught error to console.error by design; keep output clean.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  root?.unmount();
  container?.remove();
  document.body.innerHTML = '';
});

describe('Sentry.ErrorBoundary → AppCrashFallback', () => {
  it('no Sentry client is initialised in this environment (DSN unset)', () => {
    expect(Sentry.getClient()).toBeUndefined();
  });

  for (const lang of LOCALES) {
    it(`${lang}: a throwing child renders the localized fallback, not a blank page`, () => {
      mountCrashingApp(lang);

      const text = document.body.textContent ?? '';
      // NOT a white screen.
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).toContain(strings[lang].appCrashTitle);
      expect(text).toContain(strings[lang].appCrashBody);
      expect(text).toContain(strings[lang].appCrashReload);
      // The raw error never reaches the user.
      expect(text).not.toContain('render exploded');
      // And it is an announced alert, with a reload affordance.
      expect(document.querySelector('[role="alert"]')).not.toBeNull();
      expect(document.querySelector('button')).not.toBeNull();
    });
  }

  // THE ARABIC CASE — the RTL requirement, asserted on code points and on dir.
  it('AR: renders the Arabic copy in an explicitly RTL container', () => {
    mountCrashingApp('ar');

    const alert = document.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.getAttribute('dir')).toBe('rtl');
    expect(alert.getAttribute('lang')).toBe('ar');

    const text = alert.textContent ?? '';
    expect(text).toContain('حدث خطأ غير متوقع');
    expect(text).toContain('إعادة تحميل التطبيق');
    // No English leaked into the Arabic screen.
    expect(text).not.toContain('Something went wrong');
    expect(text).not.toContain('Reload');
  });

  it('EN/FR render an explicitly LTR container', () => {
    for (const lang of ['en', 'fr'] as Locale[]) {
      mountCrashingApp(lang);
      expect(document.querySelector('[role="alert"]')!.getAttribute('dir')).toBe('ltr');
      root.unmount();
      container.remove();
    }
  });
});

describe('resolveCrashLanguage — context-free by design', () => {
  it('reads the stored language, and falls back to en for missing/garbage values', () => {
    localStorage.setItem('lang', 'ar');
    expect(resolveCrashLanguage()).toBe('ar');
    localStorage.setItem('lang', 'de');
    expect(resolveCrashLanguage()).toBe('en');
    localStorage.removeItem('lang');
    expect(resolveCrashLanguage()).toBe('en');
  });

  it('does not throw when localStorage is unavailable (private mode / WebView)', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(resolveCrashLanguage()).toBe('en');
    spy.mockRestore();
  });

  // The fallback renders standalone — no LanguageProvider above it. If it ever
  // grew a context dependency, a crash inside that provider would white-screen
  // again, which is the failure mode this whole PR removes.
  it('the fallback renders with NO provider above it', () => {
    localStorage.setItem('lang', 'ar');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => root.render(<AppCrashFallback />));
    expect(document.body.textContent).toContain(strings.ar.appCrashTitle);
  });
});

describe('crash-copy i18n parity', () => {
  for (const lang of LOCALES) {
    it(`${lang}: every crash key is a non-empty string`, () => {
      const s = strings[lang] as Record<string, string>;
      for (const key of CRASH_KEYS) {
        expect(typeof s[key]).toBe('string');
        expect(s[key].trim().length).toBeGreaterThan(0);
      }
    });
  }

  it('FR and AR are really translated, not English left in place', () => {
    for (const key of CRASH_KEYS) {
      const en = (strings.en as Record<string, string>)[key];
      expect((strings.fr as Record<string, string>)[key]).not.toBe(en);
      expect((strings.ar as Record<string, string>)[key]).not.toBe(en);
    }
  });

  it('the Arabic copy is Arabic script (asserted on code points, not on rendering)', () => {
    for (const key of CRASH_KEYS) {
      // U+0600–U+06FF is the Arabic block.
      expect((strings.ar as Record<string, string>)[key]).toMatch(/[؀-ۿ]/);
      // No Latin letters mixed in, so no bidi isolation is required for dir-safety.
      expect((strings.ar as Record<string, string>)[key]).not.toMatch(/[A-Za-z]/);
    }
  });
});
