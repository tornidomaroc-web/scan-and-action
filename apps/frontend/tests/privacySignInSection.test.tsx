import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { PrivacyPolicy } from '../src/screens/PrivacyPolicy';
import { strings } from '../src/i18n/strings';

// ============================================================================
// THE PRIVACY POLICY SAYS WHAT SIGN-IN WITH GOOGLE OR APPLE HANDS US.
// ============================================================================
// Google's brand verification requires the policy linked from the consent
// screen to disclose how the app uses Google user data; on 2026-10-08 /privacy
// never mentioned sign-in. Section 4 now does, in the visitor's language.
//
// The copy is a claim about the code, so the facts it rests on are pinned
// here too: if a scope or the User table changes, this file fails and the
// paragraph has to be re-read.
// ============================================================================

const CWD = process.cwd(); // apps/frontend
const LANGS = ['en', 'fr', 'ar'] as const;

let container: HTMLDivElement;
let root: Root;
afterEach(() => {
  root?.unmount();
  container?.remove();
  localStorage.clear();
});

const renderIn = (lang: (typeof LANGS)[number]) => {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root.render(<LanguageProvider><MemoryRouter><PrivacyPolicy /></MemoryRouter></LanguageProvider>));
};

describe('privacy policy: the sign-in section', () => {
  it.each(LANGS)('%s: section 4 renders the catalog title and body', (lang) => {
    renderIn(lang);
    const section = container.querySelector('[data-privacy-sign-in]');
    expect(section).not.toBeNull();
    expect(section!.querySelector('h2')!.textContent).toBe(`4. ${strings[lang].privacySignInTitle}`);
    expect(section!.querySelector('p')!.textContent).toBe(strings[lang].privacySignInBody);
  });

  it('every language names Google, Apple, Supabase and Paddle, and no dash creeps in', () => {
    for (const lang of LANGS) {
      const body = strings[lang].privacySignInBody;
      for (const name of ['Google', 'Apple', 'Supabase', 'Paddle']) expect(body, `${lang} ${name}`).toContain(name);
      expect(body, `${lang} points at the deletion section`).toContain('7');
      for (const v of [strings[lang].privacySignInTitle, body]) {
        expect(v).not.toMatch(/[–—]/);
      }
    }
    // Arabic parity: the Arabic body is Arabic, not a pasted English fallback.
    expect(strings.ar.privacySignInBody).toMatch(/[؀-ۿ]/);
    expect(strings.ar.privacySignInBody).not.toBe(strings.en.privacySignInBody);
  });

  it('section 7, which the paragraph cites, is the deletion section', () => {
    renderIn('en');
    const headings = [...container.querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings.find((h) => h!.startsWith('7.'))).toMatch(/Deletion/);
    expect(headings.map((h) => h!.split('.')[0])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('the facts the copy states still hold in the code', () => {
    const social = readFileSync(join(CWD, 'src', 'lib', 'socialAuth.ts'), 'utf8');
    expect(social).toContain("provider: 'google', options: { scopes: ['email', 'profile']");
    // Supabase receives Apple's ID token only, which carries no name.
    expect(social).toContain("signInWithIdToken({ provider, token: idToken, nonce: nonce.raw })");
    const schema = readFileSync(join(CWD, '..', 'backend', 'prisma', 'schema.prisma'), 'utf8');
    const user = schema.match(/model User \{([\s\S]*?)\n\}/)![1];
    const fields = user.split('\n').map((l) => l.trim()).filter((l) => /^[a-z]\w*\s/.test(l)).map((l) => l.split(/\s+/)[0]);
    expect(fields.filter((f) => /name|photo|avatar|picture/i.test(f))).toEqual([]);
    expect(fields).toContain('email');
  });
});
