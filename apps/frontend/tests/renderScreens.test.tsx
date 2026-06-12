import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

// Auth and Supabase are network-backed; screens only need a resolved session.
vi.mock('../src/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'render-check@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider } from '../src/contexts/ProcessingContext';
import { DashboardScreen } from '../src/screens/DashboardScreen';
import { ActivityScreen } from '../src/screens/ActivityScreen';
import { SearchScreen } from '../src/screens/SearchScreen';
import { ReviewQueueScreen } from '../src/screens/ReviewQueueScreen';
import { DocumentDetailScreen } from '../src/screens/DocumentDetailScreen';
import { SettingsScreen } from '../src/screens/SettingsScreen';
import { AuthScreen } from '../src/screens/AuthScreen';
import { LandingScreen } from '../src/screens/LandingScreen';
import { Sidebar } from '../src/components/Sidebar';
import { UploadModal } from '../src/components/UploadModal';
import { PaywallModal } from '../src/components/PaywallModal';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];

// Screens normally render inside Layout's <Outlet context={...}>; this stub
// provides the same context shape without Layout's data fetching.
const OutletStub = () => (
  <Outlet context={{ refreshCount: 0, onNewScan: () => {}, onSuccess: () => {}, plan: 'FREE' as const }} />
);

// React escapes text content when serializing; expected strings must be
// escaped the same way before substring assertions (e.g. d'Attente → d&#x27;Attente).
const htmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

// Modals render through createPortal, which the server renderer rejects —
// render those for real into jsdom and read the resulting DOM instead.
function renderModalInDom(lang: Lang, element: React.ReactElement): string {
  localStorage.setItem('lang', lang);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          {/* UploadModal hands processing off to the app-level tray now */}
          <ProcessingProvider>{element}</ProcessingProvider>
        </ToastProvider>
      </LanguageProvider>
    );
  });
  const html = document.body.innerHTML;
  root.unmount();
  container.remove();
  return html;
}

function renderAt(lang: Lang, path: string, element: React.ReactElement, withParams = false) {
  localStorage.setItem('lang', lang);
  return renderToStaticMarkup(
    <LanguageProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<OutletStub />}>
              {withParams ? (
                <Route path="documents/:id" element={element} />
              ) : (
                <Route path={path} element={element} />
              )}
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </LanguageProvider>
  );
}

const SCREENS: Array<{ name: string; path: string; element: React.ReactElement; withParams?: boolean }> = [
  { name: 'DashboardScreen', path: '/dashboard', element: <DashboardScreen /> },
  { name: 'ActivityScreen', path: '/activity', element: <ActivityScreen /> },
  { name: 'SearchScreen', path: '/search', element: <SearchScreen /> },
  { name: 'ReviewQueueScreen', path: '/queue', element: <ReviewQueueScreen /> },
  { name: 'DocumentDetailScreen', path: '/documents/doc-1', element: <DocumentDetailScreen />, withParams: true },
  { name: 'SettingsScreen', path: '/settings', element: <SettingsScreen /> },
  { name: 'AuthScreen', path: '/login', element: <AuthScreen /> },
  { name: 'LandingScreen', path: '/', element: <LandingScreen /> },
  { name: 'Sidebar', path: '/dashboard', element: <Sidebar onNewScan={() => {}} plan="FREE" /> },
];

const MODALS: Array<{ name: string; element: React.ReactElement }> = [
  { name: 'UploadModal', element: <UploadModal isOpen onClose={() => {}} plan="FREE" /> },
  { name: 'PaywallModal', element: <PaywallModal isOpen onClose={() => {}} /> },
];

describe('per-screen render check (EN/FR/AR)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  for (const screen of SCREENS) {
    for (const lang of LANGS) {
      it(`${screen.name} renders without crashing in ${lang}`, () => {
        const html = renderAt(lang, screen.path, screen.element, screen.withParams);
        expect(html.length).toBeGreaterThan(0);
      });
    }
  }

  for (const modal of MODALS) {
    for (const lang of LANGS) {
      it(`${modal.name} renders without crashing in ${lang}`, () => {
        const html = renderModalInDom(lang, modal.element);
        expect(html.length).toBeGreaterThan(0);
      });
    }
  }

  it('language actually switches rendered strings (Settings: en vs fr vs ar differ)', () => {
    const outputs = LANGS.map((lang) => renderAt(lang, '/settings', <SettingsScreen />));
    expect(outputs[0]).not.toEqual(outputs[1]);
    expect(outputs[1]).not.toEqual(outputs[2]);
  });

  it('Sidebar nav labels follow the persisted language', () => {
    for (const lang of LANGS) {
      const html = renderAt(lang, '/dashboard', <Sidebar onNewScan={() => {}} plan="FREE" />);
      expect(html).toContain(htmlEscape(strings[lang].dashboard));
      expect(html).toContain(htmlEscape(strings[lang].queue));
    }
  });

  it('all three locales expose the same string keys (no missing translations)', () => {
    const enKeys = Object.keys(strings.en).sort();
    expect(Object.keys(strings.fr).sort()).toEqual(enKeys);
    expect(Object.keys(strings.ar).sort()).toEqual(enKeys);
  });
});
