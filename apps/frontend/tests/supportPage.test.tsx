import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { SupportPage } from '../src/screens/SupportPage';

// ============================================================================
// /support is the App Store Connect Support URL. Apple's field reference, read
// 2026-09-29: it "must lead to actual contact information". It is metadata, so
// it names no price, no plan and no way to pay (Apple 2.3.7, 3.1.1).
// ============================================================================

const CWD = process.cwd();
let container: HTMLDivElement;
let root: Root;
const render = () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root.render(<LanguageProvider><MemoryRouter><SupportPage /></MemoryRouter></LanguageProvider>));
};
afterEach(() => {
  root?.unmount();
  container?.remove();
});

const pageText = () => (container.querySelector('[data-support-page]') as HTMLElement).textContent ?? '';

describe('SupportPage', () => {
  it('gives the support address as a mailto link and as text', () => {
    render();
    const a = container.querySelector('[data-support-email]') as HTMLAnchorElement | null;
    expect(a).not.toBeNull();
    expect(a!.getAttribute('href')).toBe('mailto:support@scan-action.com');
    expect(a!.textContent).toBe('support@scan-action.com');
  });

  it('links the privacy policy and the deletion steps', () => {
    render();
    expect(container.querySelector('[data-support-page] a[href="/privacy"]')).not.toBeNull();
    expect(container.querySelector('[data-support-page] a[href="/delete-account"]')).not.toBeNull();
  });

  it('names no price, plan or way to pay', () => {
    render();
    const text = pageText();
    expect(text.length).toBeGreaterThan(300); // positive control: the page rendered its copy
    for (const word of [/\$/, /€/, /\bpro\b/i, /\bplan\b/i, /upgrade/i, /subscri/i, /price/i, /paddle/i, /checkout/i]) {
      expect(text, `found ${word}`).not.toMatch(word);
    }
    // The page's own content links nowhere that sells: only mailto, /privacy, /delete-account.
    const hrefs = [...container.querySelectorAll('[data-support-page] a')].map((a) => a.getAttribute('href'));
    expect(hrefs.sort()).toEqual(['/delete-account', '/privacy', 'mailto:support@scan-action.com']);
  });

  it('has no dash in its copy, the address aside', () => {
    render();
    const text = pageText().split('support@scan-action.com').join('');
    expect(text).not.toMatch(/[-‐-―−]/);
    // Control: the same test sees a dash when one is there.
    expect('a — b').toMatch(/[-‐-―−]/);
  });

  it('is routed at /support, outside the signed-in Layout', () => {
    const app = readFileSync(join(CWD, 'src', 'App.tsx'), 'utf8');
    const route = app.indexOf('<Route path="/support"');
    const guard = app.indexOf('{user ? (');
    expect(route, '/support is not routed').toBeGreaterThan(-1);
    expect(route, '/support must be reachable logged out, before the user guard').toBeLessThan(guard);
  });
});
