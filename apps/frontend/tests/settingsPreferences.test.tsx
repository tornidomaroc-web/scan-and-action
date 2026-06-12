import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const authMocks = vi.hoisted(() => ({ signOut: vi.fn(async () => {}) }));

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '7f1e2d3c-4b5a-4678-9abc-def012345678', email: 'prefs-check@example.com' },
    session: null,
    loading: false,
    signOut: authMocks.signOut,
  }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {} } }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { SettingsScreen } from '../src/screens/SettingsScreen';

// Mobile users have no sidebar, so Settings is the only place language and
// theme can be changed. These tests drive the real controls in jsdom.
let container: HTMLDivElement;
let root: Root;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/settings']}>
            <Routes>
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="/login" element={<div>LOGIN-STUB</div>} />
            </Routes>
          </MemoryRouter>
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

function buttonByText(text: string): HTMLButtonElement {
  const btn = [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text
  );
  if (!btn) throw new Error(`button "${text}" not found`);
  return btn;
}

describe('Settings — Preferences section (mobile home for language & theme)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.dir = 'ltr';
    mount();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('renders the Preferences section with language and appearance rows', () => {
    expect(container.textContent).toContain(strings.en.preferences);
    expect(container.textContent).toContain(strings.en.language);
    expect(container.textContent).toContain(strings.en.appearance);
    for (const label of ['EN', 'FR', 'AR']) {
      expect(buttonByText(label)).toBeTruthy();
    }
  });

  it('theme toggle switches dark mode on <html> and persists to localStorage', () => {
    click(buttonByText(strings.en.switchDark));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');

    click(buttonByText(strings.en.switchLight));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('language buttons switch the UI language and persist it', () => {
    click(buttonByText('FR'));
    expect(localStorage.getItem('lang')).toBe('fr');
    expect(container.textContent).toContain(strings.fr.preferences);
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('shows a sign-out button that calls signOut and returns to login', async () => {
    const btn = buttonByText(strings.en.signOut);
    expect(btn.className).toContain('min-h-[44px]');
    click(btn);
    expect(authMocks.signOut).toHaveBeenCalled();
    await vi.waitFor(() => expect(container.textContent).toContain('LOGIN-STUB'));
  });

  it('email truncates with ellipsis instead of breaking mid-word', () => {
    const email = [...container.querySelectorAll('p')].find(
      (p) => p.textContent === 'prefs-check@example.com'
    )!;
    expect(email).toBeTruthy();
    expect(email.className).toContain('truncate');
    expect(email.className).not.toContain('break-all');
  });

  it('switching to Arabic flips the document to RTL', () => {
    click(buttonByText('AR'));
    expect(localStorage.getItem('lang')).toBe('ar');
    expect(container.textContent).toContain(strings.ar.preferences);
    expect(document.documentElement.dir).toBe('rtl');
  });
});
