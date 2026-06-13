import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'pro-check@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../src/services/documentService', () => ({
  documentService: {
    getStats: vi.fn().mockResolvedValue({ totalCount: 0, pendingCount: 0, averageConfidence: 0, plan: 'PRO' }),
    getDocumentDetail: vi.fn(),
  },
}));
vi.mock('../src/services/uploadService', () => ({ uploadDocument: vi.fn() }));

import { documentService } from '../src/services/documentService';
import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { Layout } from '../src/components/Layout';
import { LandingRoute } from '../src/App';

const LocationProbe: React.FC = () => {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
};

let container: HTMLDivElement;
let root: Root;

function mount(initialPath: string, element: React.ReactNode) {
  localStorage.setItem('lang', 'en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[initialPath]}>{element}</MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    );
  });
}

function click(el: Element) {
  flushSync(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('post-payment confirmation (?checkout=success)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  function mountDashboard(path: string) {
    mount(
      path,
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<LocationProbe />} />
        </Route>
      </Routes>
    );
  }

  it('shows the PRO welcome, refetches the plan, and cleans the param from the URL', async () => {
    mountDashboard('/dashboard?checkout=success');

    // celebration overlay is up, localized
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(strings.en.proWelcomeTitle)
    );
    // plan/stats refetched so the UI flips to PRO
    await vi.waitFor(() => expect(documentService.getStats).toHaveBeenCalled());
    // param cleaned: a refresh of this URL won't re-trigger the celebration
    const probe = container.querySelector('[data-testid="location-probe"]')!;
    expect(probe.textContent).toBe('/dashboard');

    // explicit dismiss closes it
    const cta = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.includes(strings.en.proWelcomeCta)
    )!;
    click(cta);
    expect(document.body.querySelector('[data-testid="pro-welcome"]')).toBeNull();
  });

  it('does not show the celebration on a normal dashboard visit', async () => {
    mountDashboard('/dashboard');
    await vi.waitFor(() => expect(documentService.getStats).toHaveBeenCalled());
    expect(document.body.querySelector('[data-testid="pro-welcome"]')).toBeNull();
  });

  it('safety net: a signed-in user landing on / with the param is forwarded to the dashboard', async () => {
    mount(
      '/?checkout=success',
      <Routes>
        <Route path="/" element={<LandingRoute authenticated />} />
        <Route path="/dashboard" element={<LocationProbe />} />
      </Routes>
    );

    await vi.waitFor(() => {
      const probe = container.querySelector('[data-testid="location-probe"]');
      expect(probe?.textContent).toBe('/dashboard?checkout=success');
    });
  });
});
