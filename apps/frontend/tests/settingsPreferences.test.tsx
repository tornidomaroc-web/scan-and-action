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

// ============================================================================
// Class-B RTL hazard: the identity card's two truncating boxes.
// ============================================================================
// Settings is where the app shows a user their OWN address, so a leading-end
// clip here is uniquely bad: "…@gmail.com" is identical for every Gmail user.
//
// The two boxes take DIFFERENT instruments even though both derive from the same
// string (userName = email.split('@')[0], SettingsScreen.tsx:43):
//
//   <h3>{userName}</h3>   dir="auto" — the "@domain" is stripped, so this is pure
//                         content of unknown direction; auto is exactly its case.
//   <p>{user.email}</p>   dir="ltr"  — this one still HAS the "@domain" structure.
//                         Under auto, an Arabic local part is the first strong
//                         character, the box resolves RTL, and the domain lands on
//                         the wrong side of the address.
//
// HONEST LIMIT: green here means nobody dropped the attributes. It does NOT mean
// the ellipsis lands on the correct end — jsdom has no layout engine and no bidi
// resolution, so which end truncates cannot be asserted anywhere in this suite.
// The instrument was proven by hand in Chrome; see tests/rtlTruncation.test.ts.
describe('Settings identity card — direction is stated, not inherited (Class B)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('lang', 'ar');
    document.documentElement.dir = 'rtl';
    mount();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    document.documentElement.dir = 'ltr';
  });

  it('AR: the truncating display-name <h3> carries dir="auto"', () => {
    const h3 = [...container.querySelectorAll('h3')].find(
      (el) => el.textContent?.trim() === 'prefs-check'
    );
    expect(h3, 'the identity card should render the display name').toBeTruthy();
    expect(h3!.className).toContain('truncate');
    expect(h3!.getAttribute('dir')).toBe('auto');
  });

  it('AR: the truncating email <p> carries dir="ltr" — NOT "auto"', () => {
    const email = [...container.querySelectorAll('p')].find(
      (p) => p.textContent === 'prefs-check@example.com'
    );
    expect(email, 'the identity card should render the email').toBeTruthy();
    expect(email!.className).toContain('truncate');
    // Asserted as an exact value on purpose: "auto" here is a real defect, not a
    // near-miss, so the test must fail if someone "corrects" it to match the
    // filename precedent.
    expect(email!.getAttribute('dir')).toBe('ltr');
    expect(email!.getAttribute('dir')).not.toBe('auto');
  });

  it('AR: the document really is RTL, so these boxes are in the hazard context', () => {
    expect(document.documentElement.dir).toBe('rtl');
  });
});
