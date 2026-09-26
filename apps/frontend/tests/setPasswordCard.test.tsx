import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ============================================================================
// Settings, "Sign in on other devices" (SetPasswordCard, 2026-09-26): the way
// out of a provider-only account. Through the real SettingsScreen with the
// auth context and the Supabase client mocked.
//
// WHO SEES IT: only a session whose identities carry no `email` provider.
// The control is a password account and a user object with no identities
// list, for whom nothing new may appear.
// ============================================================================

const h = vi.hoisted(() => ({
  user: null as any,
  updateUser: vi.fn(),
}));

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: h.user, session: null, loading: false, signOut: async () => {} }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { updateUser: h.updateUser } } }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { SettingsScreen } from '../src/screens/SettingsScreen';
import { hasPasswordIdentity } from '../src/components/SetPasswordCard';
import { MIN_PASSWORD_LENGTH } from '../src/lib/passwordPolicy';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];
const RELAY = 'k7q2m9xdz3@privaterelay.appleid.com';
const ID = '7f1e2d3c-4b5a-4678-9abc-def012345678';

const appleOnly = () => ({ id: ID, email: RELAY, identities: [{ provider: 'apple', id: 'x', user_id: ID }] });
const passwordUser = () => ({ id: ID, email: 'p@example.com', identities: [{ provider: 'email', id: 'y', user_id: ID }] });
const linked = () => ({ id: ID, email: 'p@example.com', identities: [{ provider: 'email' }, { provider: 'google' }] });

let container: HTMLDivElement;
let root: Root;

function mount(lang: Lang = 'en') {
  localStorage.setItem('lang', lang);
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
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>,
    );
  });
}

const q = (sel: string) => container.querySelector(sel);
const card = () => q('[data-set-password-card]');

function type(id: string, value: string) {
  const input = q(`#${id}`) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  flushSync(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function submit() {
  flushSync(() => {
    q('[data-set-password-form]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.updateUser.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => {
  root?.unmount();
  container?.remove();
  localStorage.clear();
});

describe('hasPasswordIdentity', () => {
  it('reads the identities list, and treats an absent list as "has a password"', () => {
    expect(hasPasswordIdentity(appleOnly() as any)).toBe(false);
    expect(hasPasswordIdentity(passwordUser() as any)).toBe(true);
    expect(hasPasswordIdentity(linked() as any)).toBe(true);
    expect(hasPasswordIdentity({ identities: undefined } as any)).toBe(true);
    expect(hasPasswordIdentity(null)).toBe(true);
  });
});

describe('who sees the card', () => {
  it('an Apple-only account: the card, with the relay address shown LTR', () => {
    h.user = appleOnly();
    mount();
    expect(card()).not.toBeNull();
    const address = card()!.querySelector('bdi')!;
    expect(address.textContent).toBe(RELAY);
    expect(address.parentElement!.getAttribute('dir')).toBe('ltr');
  });
  it('control: a password account sees nothing new', () => {
    h.user = passwordUser();
    mount();
    expect(card()).toBeNull();
    expect(container.textContent).not.toContain(strings.en.setPasswordTitle);
  });
  it('control: a user with no identities list sees nothing new', () => {
    h.user = { id: ID, email: 'old@example.com' };
    mount();
    expect(card()).toBeNull();
  });
});

describe('setting the password', () => {
  for (const lang of LANGS) {
    it(`${lang}: the copy is the catalog's, and the vendor name for Android stays Latin`, () => {
      h.user = appleOnly();
      mount(lang);
      const t = card()!.textContent!;
      expect(t).toContain(strings[lang].setPasswordTitle);
      expect(t).toContain(strings[lang].setPasswordBody);
      expect(t).toContain(strings[lang].setPasswordSubmit);
      expect(strings[lang].setPasswordBody).toContain('Android');
      expect(t).not.toMatch(/[٠-٩]/);
    });
  }

  it('too short: refused with the shared sentence, Supabase never called', () => {
    h.user = appleOnly();
    mount();
    type('set-password', 'a'.repeat(MIN_PASSWORD_LENGTH - 1));
    submit();
    expect(q('[role="alert"]')!.textContent).toBe(strings.en.passwordTooShort);
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('long enough: updateUser({ password }) once, then the done notice', async () => {
    h.user = appleOnly();
    mount();
    const pw = 'x'.repeat(MIN_PASSWORD_LENGTH);
    type('set-password', pw);
    submit();
    await vi.waitFor(() => expect(q('[data-set-password-done]')).not.toBeNull());
    expect(h.updateUser).toHaveBeenCalledTimes(1);
    expect(h.updateUser.mock.calls[0][0]).toEqual({ password: pw });
    expect(q('[data-set-password-done]')!.textContent).toBe(strings.en.setPasswordDone);
    expect(q('[data-set-password-form]')).toBeNull();
  });

  it('a Supabase refusal shows the generic sentence, never the raw message', async () => {
    h.user = appleOnly();
    h.updateUser.mockResolvedValue({ data: {}, error: new Error('Password update requires reauthentication') });
    mount();
    type('set-password', 'x'.repeat(MIN_PASSWORD_LENGTH));
    submit();
    await vi.waitFor(() => expect(q('[role="alert"]')).not.toBeNull());
    expect(q('[role="alert"]')!.textContent).toBe(strings.en.resetPasswordGenericError);
    expect(container.textContent).not.toContain('reauthentication');
  });
});
