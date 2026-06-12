import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { BottomTabBar } from '../src/components/BottomTabBar';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];

const htmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

function render(lang: Lang, pendingCount?: number, path = '/dashboard') {
  localStorage.setItem('lang', lang);
  return renderToStaticMarkup(
    <LanguageProvider>
      <MemoryRouter initialEntries={[path]}>
        <BottomTabBar pendingCount={pendingCount} />
      </MemoryRouter>
    </LanguageProvider>
  );
}

describe('BottomTabBar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  for (const lang of LANGS) {
    it(`renders Home, Search, Queue and Settings tabs with ${lang} labels`, () => {
      const html = render(lang);
      for (const key of ['home', 'searchTab', 'queueTab', 'settings'] as const) {
        expect(html).toContain(htmlEscape(strings[lang][key]));
      }
      expect(html).toContain('href="/dashboard"');
      expect(html).toContain('href="/search"');
      expect(html).toContain('href="/queue"');
      expect(html).toContain('href="/settings"');
    });
  }

  it('has no Activity tab (Activity is merged into Home on mobile)', () => {
    const html = render('en');
    expect(html).not.toContain('href="/activity"');
  });

  it('is mobile-only: hidden at the md breakpoint and above', () => {
    const html = render('en');
    expect(html).toMatch(/<nav[^>]*class="[^"]*md:hidden/);
  });

  it('shows the pending count on the Queue tab', () => {
    const html = render('en', 3);
    expect(html).toContain('data-testid="queue-badge"');
    expect(html).toMatch(/queue-badge[^>]*>3</);
  });

  it('hides the badge when nothing is pending', () => {
    expect(render('en', 0)).not.toContain('queue-badge');
    expect(render('en')).not.toContain('queue-badge');
  });

  it('caps the badge at 9+', () => {
    const html = render('en', 12);
    expect(html).toMatch(/queue-badge[^>]*>9\+</);
  });

  it('marks the active tab', () => {
    const html = render('en', 0, '/queue');
    // react-router adds aria-current="page" to the active NavLink
    const active = html.match(/<a[^>]*aria-current="page"[^>]*href="([^"]+)"/) ||
      html.match(/<a[^>]*href="([^"]+)"[^>]*aria-current="page"/);
    expect(active?.[1]).toBe('/queue');
  });
});
