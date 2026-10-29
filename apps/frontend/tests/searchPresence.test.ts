import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyPageHead, SITE_ORIGIN } from '../src/lib/pageHead';

// ============================================================================
// THE PUBLIC WEB'S SEARCH PRESENCE: robots.txt, sitemap.xml, the landing head.
// ============================================================================
// Until 2026-10-29 www.scan-action.com/robots.txt and /sitemap.xml answered
// 200 with the SPA's HTML: no such files existed under public/, so Vercel's
// catch-all rewrite (vercel.json, `/(.*)` -> `/index.html`) served the app for
// both. A 200 with the wrong body is the quiet failure shape: nothing turned
// red. The two files now exist, and this file holds what they say, that the
// sitemap lists exactly the public routes the router declares, and that the
// landing head describes receipts and expenses with no model vendor named.
//
// The sitemap travels into the iOS web bundle like everything under public/.
// ios/ci/assemble.sh allows `.xml` since this change (iosPlatform.test.ts pins
// the allowlist); authLinksReturnToApp.test.tsx walks public/ against it.

const CWD = process.cwd();
const F = (rel: string) => readFileSync(join(CWD, rel), 'utf8');

const TITLE = 'Scan & Action: Receipt Scanner and Expense Log';
const DESCRIPTION =
  'Photograph a receipt or add a PDF. The merchant, total, date and category land in your ledger, one total per currency. In English, French and Arabic.';
const PUBLIC_ROUTES = ['/', '/login', '/terms', '/privacy', '/refund', '/delete-account', '/support'];

const attr = (html: string, re: RegExp) => {
  const m = html.match(re);
  expect(m, String(re)).not.toBeNull();
  return m![1].replace(/&amp;/g, '&');
};

describe('robots.txt', () => {
  const robots = F('public/robots.txt');
  it('allows every agent everything and names the sitemap by its absolute URL', () => {
    expect(robots).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
    expect(robots).not.toMatch(/Disallow/);
  });
});

describe('sitemap.xml', () => {
  const xml = F('public/sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  it('parses as XML in the sitemaps namespace', () => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.tagName).toBe('urlset');
    expect(doc.documentElement.getAttribute('xmlns')).toBe('http://www.sitemaps.org/schemas/sitemap/0.9');
    expect(doc.querySelectorAll('url > loc').length).toBe(locs.length);
  });

  it('lists exactly the public routes, each absolute on www.scan-action.com', () => {
    expect(locs).toEqual(PUBLIC_ROUTES.map((p) => SITE_ORIGIN + p));
  });

  it('every listed route is a public <Route> in App.tsx, declared before the signed-in block', () => {
    const app = F('src/App.tsx');
    const publicPart = app.slice(0, app.indexOf('{user ? ('));
    expect(publicPart.length).toBeGreaterThan(0);
    for (const p of PUBLIC_ROUTES) expect(publicPart, p).toContain(`path="${p}"`);
    // The routes a crawler must not be sent to are not listed: the confirm
    // landing (a token in its URL) and the recovery path (only reachable while
    // a password reset is pending), and nothing under the signed-in Layout.
    expect(locs.some((l) => l.includes('/auth/confirm'))).toBe(false);
    expect(locs.some((l) => l.includes('/reset-password'))).toBe(false);
    expect(locs.some((l) => /\/(dashboard|overview|activity|search|queue|documents|settings)/.test(l))).toBe(false);
    // Control: the same reading does find /auth/confirm in the router.
    expect(publicPart).toContain('path="/auth/confirm"');
  });
});

describe('index.html: the landing head', () => {
  const html = F('index.html');

  it('title and description are about receipts and expenses, and name no model vendor', () => {
    expect(attr(html, /<title>([^<]*)<\/title>/)).toBe(TITLE);
    expect(attr(html, /<meta name="description" content="([^"]*)"/)).toBe(DESCRIPTION);
    expect(TITLE.length).toBeLessThanOrEqual(60);
    expect(DESCRIPTION.length).toBeLessThanOrEqual(155);
    expect(html).not.toMatch(/Gemini|OpenAI|GPT|Claude|Vision AI|Industrial Document Intelligence/);
    // Control: the pattern does catch the old copy.
    expect('Production-ready document extraction powered by Gemini Vision AI.').toMatch(/Gemini/);
  });

  it('declares the canonical landing URL and the og:/twitter: copies of the head', () => {
    expect(attr(html, /<link rel="canonical" href="([^"]*)"/)).toBe(`${SITE_ORIGIN}/`);
    expect(attr(html, /<meta property="og:title" content="([^"]*)"/)).toBe(TITLE);
    expect(attr(html, /<meta property="og:description" content="([^"]*)"/)).toBe(DESCRIPTION);
    expect(attr(html, /<meta property="og:url" content="([^"]*)"/)).toBe(`${SITE_ORIGIN}/`);
    expect(attr(html, /<meta property="og:type" content="([^"]*)"/)).toBe('website');
    expect(attr(html, /<meta property="og:image" content="([^"]*)"/)).toBe(`${SITE_ORIGIN}/icons/icon-512.png`);
    expect(attr(html, /<meta name="twitter:card" content="([^"]*)"/)).toBe('summary');
    expect(attr(html, /<meta name="twitter:title" content="([^"]*)"/)).toBe(TITLE);
    expect(attr(html, /<meta name="twitter:description" content="([^"]*)"/)).toBe(DESCRIPTION);
    // The og:image is a file that ships (iconAssets.test.ts measures it at 512).
    expect(() => readFileSync(join(CWD, 'public/icons/icon-512.png'))).not.toThrow();
  });

  it('the copy carries no dash (the landing rule of 2026-09-26)', () => {
    for (const s of [TITLE, DESCRIPTION]) expect(s).not.toMatch(/[‒–—―⸺⸻]| - /);
  });
});

describe('applyPageHead: a public page takes the head, and gives it back', () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  const seed = () => {
    document.head.innerHTML =
      `<title>${TITLE.replace('&', '&amp;')}</title>` +
      `<meta name="description" content="${DESCRIPTION}">` +
      `<link rel="canonical" href="${SITE_ORIGIN}/">` +
      `<meta property="og:title" content="${TITLE.replace('&', '&amp;')}">` +
      `<meta property="og:url" content="${SITE_ORIGIN}/">`;
  };
  const read = () => ({
    title: document.title,
    description: document.head.querySelector('meta[name="description"]')!.getAttribute('content'),
    canonical: document.head.querySelector('link[rel="canonical"]')!.getAttribute('href'),
    ogTitle: document.head.querySelector('meta[property="og:title"]')!.getAttribute('content'),
    ogUrl: document.head.querySelector('meta[property="og:url"]')!.getAttribute('content'),
    twitterTitle: document.head.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ?? null,
  });

  it('sets title, description, canonical, og and twitter for the page, then restores the landing values', () => {
    seed();
    const before = read();
    restore = applyPageHead({ title: 'Support | Scan & Action', description: 'Reach us.', path: '/support' });
    expect(read()).toEqual({
      title: 'Support | Scan & Action',
      description: 'Reach us.',
      canonical: `${SITE_ORIGIN}/support`,
      ogTitle: 'Support | Scan & Action',
      ogUrl: `${SITE_ORIGIN}/support`,
      twitterTitle: 'Support | Scan & Action',
    });
    restore();
    restore = undefined;
    expect(read()).toEqual(before);
    expect(before.canonical).toBe(`${SITE_ORIGIN}/`);
    // A tag the page created (twitter:title was not seeded) is removed again,
    // not left behind with the landing's values missing.
    expect(document.head.querySelector('meta[name="twitter:title"]')).toBeNull();
  });

  it('the hook is a no-op inside the native shells (the WebView keeps the shell exactly as it was)', () => {
    // Read from the source: the guard is the first statement of the effect.
    const src = F('src/lib/pageHead.ts');
    expect(src).toMatch(/useEffect\(\(\) => \{\n\s*if \(isNativePlatform\(\)\) return undefined;/);
    expect(src).toContain("import { isNativePlatform } from '../native/shell'");
  });

  it('every public page but the landing calls usePageHead with its own route', () => {
    const pages: Record<string, string> = {
      'src/screens/AuthScreen.tsx': '/login',
      'src/screens/TermsOfService.tsx': '/terms',
      'src/screens/PrivacyPolicy.tsx': '/privacy',
      'src/screens/RefundPolicy.tsx': '/refund',
      'src/screens/DeleteAccountInfo.tsx': '/delete-account',
      'src/screens/SupportPage.tsx': '/support',
    };
    for (const [file, path] of Object.entries(pages)) {
      const src = F(file);
      const m = src.match(/usePageHead\(\{ title: '([^']*)', description: (?:'[^']*'|"[^"]*"), path: '([^']*)' \}\)/);
      expect(m, file).not.toBeNull();
      expect(m![2], file).toBe(path);
      expect(m![1], file).toMatch(/ \| Scan & Action$/);
    }
    // The landing keeps the static head of index.html.
    expect(F('src/screens/LandingScreen.tsx')).not.toContain('usePageHead');
  });
});
