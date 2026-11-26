import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// NO PLAN, PRICE OR UNLIMITED WORDING ON ANY iOS SCREEN, IN en, fr AND ar.
// ============================================================================
// The iOS app sells nothing and names no plan (App Review). This file
// renders the REAL <App/> (router, Layout, rail, tab bar, every screen) at
// every route App.tsx declares, as the iOS app, in the three languages, plus
// the paths a route only reaches by acting: the multi-file pick, the scan
// limit, the delete sheet with and without an ACTIVE billing source, the
// sign-up and forgot-password modes. It reads every text node and every
// aria-label, title, placeholder and alt, and fails on any word in IOS_BANNED,
// or on any word in IOS_HINTS: a fee, an arrangement or a charge outside the
// app (one ruled exemption: the delete sheet's ACTIVE-billing warning).
//
// The two store pages (/privacy/app, /support/app) are also scanned as the web
// and as Android, since a reviewer opens them in a browser: no word, no hint,
// no link in their header, and no link that leaves them.
//
// Controls, each of which fails if the scan stops working (D and E cover the
// hints and the store headers):
//   A. a planted screen holding "Unlimited" (and its fr and ar forms) is
//      caught, so the scan is not blind;
//   B. the routes scanned equal the routes App.tsx declares, so a route added
//      to the app and not to ROUTES below fails the suite;
//   C. the same legal pages rendered as the web still name Paddle where they
//      did before, and Android keeps its toast, so the iOS branch did not
//      strip the web or Android text.
// ============================================================================

const h = vi.hoisted(() => ({
  platform: 'ios' as 'ios' | 'android' | 'web',
  signedIn: true,
  recovering: false,
  billing: false,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => h.platform, isNativePlatform: () => h.platform !== 'web' },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async () => ({ remove: async () => {} }),
    getLaunchUrl: async () => undefined,
    minimizeApp: async () => {},
  },
}));
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { setStyle: async () => {} }, Style: { Dark: 'DARK', Light: 'LIGHT' } }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: async () => {} } }));
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: h.signedIn ? { id: 'u-1', email: 'reader@example.com', identities: [] } : null,
    session: null,
    loading: false,
    isRecovering: h.recovering,
    clearRecovery: () => {},
    signOut: async () => {},
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../src/native/documentScanner', () => ({ hasScannerPlatform: () => false, scanDocument: vi.fn() }));
vi.mock('../src/native/camera', () => ({ ensureCameraPermission: async () => true }));
vi.mock('../src/lib/imagePreprocess', () => ({ preprocessImage: async (f: File) => f }));
vi.mock('../src/services/uploadService', () => ({ uploadDocument: async () => { throw new Error('LIMIT_REACHED'); } }));

const DOC = {
  id: 'd1', originalFileName: 'bim-maroc.jpg', documentType: 'RECEIPT', overallConfidence: 0.83, status: 'NEEDS_REVIEW',
  uploadedAt: '2026-09-22T09:14:00Z', signedFileUrl: 'https://storage.example/signed/bim.jpg', reextractable: false, reprocessed: false,
  entities: [{ name: 'BIM MAROC', displayName: 'BIM MAROC', role: 'VENDOR', aliases: [] }],
  documentEntities: [{ role: 'VENDOR', entity: { displayName: 'BIM MAROC' } }],
  facts: [
    { key: 'category', factType: 'CATEGORY', valueString: 'Food', confidence: 0.99 },
    { key: 'TOTAL_AMOUNT', factType: 'AMOUNT', valueNumber: 467.85, currency: 'MAD', confidence: 0.99 },
    { key: 'TRANSACTION_DATE', factType: 'DATE', valueDate: '2026-09-21T00:00:00.000Z', confidence: 0.99 },
    { key: 'decision', valueString: 'FLAGGED' }, { key: 'decision_reason', valueString: 'High food expense' },
  ],
};
const RECEIPT = { documentId: 'd1', date: '2026-09-21', dateSource: 'document', amount: 467.85, amountSource: 'extracted', category: 'Food', merchant: 'BIM MAROC', status: 'COMPLETED' };
const CATS = ['Food', 'Transport', 'Travel', 'Shopping', 'Health', 'Bills', 'Office', 'Other'];
const MONTH = {
  month: '2026-09', timeZone: 'UTC', excluded: { status: 0, duplicate: 0, noAmount: 0 },
  currencies: [{ currency: 'MAD', total: 467.85, receiptCount: 1, uncategorizedCount: 0, receipts: [RECEIPT],
    categories: CATS.map((c) => ({ category: c, total: c === 'Food' ? 467.85 : 0, receiptCount: c === 'Food' ? 1 : 0 })) }],
};
vi.mock('../src/services/documentService', () => ({
  documentService: {
    getStats: async () => ({ totalCount: 1, pendingCount: 1, averageConfidence: 0.83, plan: 'FREE' }),
    getRecentActivity: async () => [DOC],
    getAllActivity: async () => [DOC],
    getReviewQueue: async () => [DOC],
    getDocumentDetail: async () => DOC,
    updateStatus: async () => ({}),
    reextract: async () => ({}),
    applyFixAction: async () => ({}),
    exportCsv: async () => {},
  },
}));
vi.mock('../src/services/ledgerService', () => ({ ledgerService: { getMonth: async () => MONTH } }));
vi.mock('../src/services/searchService', () => ({
  searchService: {
    searchReceipts: async () => ({ mode: 'recent', q: '', category: null, month: null, timeZone: 'UTC',
      receipts: [{ ...RECEIPT, currency: 'MAD' }], currencies: [], notCounted: [] }),
  },
}));
vi.mock('../src/services/accountService', () => ({
  accountService: { hasActiveBilling: async () => h.billing, deleteAccount: async () => ({}) },
}));

import App, { RESET_PASSWORD_PATH } from '../src/App';
import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];

// The owner's list (plan, Pro, premium, subscription, upgrade, price, paid,
// purchase, billing, Paddle, unlimited) in en, fr and ar. Deliberately NOT
// banned: French "facture" and Arabic "فاتورة" (invoice, a document type
// this app reads), and amounts (the receipts' own totals).
export const IOS_BANNED = new RegExp(
  [
    // Word edges are Unicode letters, not \b: in JavaScript \b knows only
    // ASCII, so it never fires beside "é" or "à" (payé, Passez à).
    // en
    String.raw`(?<!\p{L})(?:plans?|pro|premium|subscri\p{L}*|upgrad\p{L}*|pric(?:e|es|ing)|paid|purchas\p{L}*|billing|billed|paddle|unlimited)(?!\p{L})`,
    // fr. "Achats" alone is the Shopping category and "facture(s)" is an
    // invoice, so neither is banned; the purchase and billing forms are.
    String.raw`(?<!\p{L})(?:forfaits?|formules?|abonn\p{L}*|tarif\p{L}*|prix|payant\p{L}*|payée?s?|achat|achet\p{L}*|facturation|facturée?s?|illimit\p{L}*|mise à niveau|passe[rz] (?:au|à))(?!\p{L})`,
    // ar. Stems, since Arabic attaches و ال ب to the word; "مشترك" (shared)
    // and "ترقيم" (numbering) are ordinary words, so they are not stems here.
    String.raw`خط[ةط]|باق[ةا]|(?<!\p{L})برو(?!\p{L})|بريميوم|اشترا?ك|ترقي[ةت]|سعر|أسعار|مدفوع|شراء|فوترة|بادل|غير محدود|بلا حدود|لا محدود`,
  ].join('|'),
  'iu',
);

export function iosHits(text: string): string[] {
  const g = new RegExp(IOS_BANNED.source, 'giu');
  return [...text.matchAll(g)].map((m) => m[0]);
}

// The HINT words: no iOS text may say that a fee, an arrangement or a charge
// exists somewhere outside the app (App Review). The owner's list:
// outside this app, arranged, charged, fee, agreed; in en, fr and ar. Exact
// forms, not stems, where a stem is an ordinary word on these screens:
// "agree" and "agreement" are the Terms' acceptance ("you agree to be bound"),
// and "accordance" is its governing-law clause, so neither is a hint.
export const IOS_HINTS = new RegExp(
  [
    // en
    String.raw`outside (?:this|the) app\p{L}*`,
    String.raw`(?<!\p{L})(?:arrang(?:e|ed|es|ing|ements?)|charg(?:e|es|ed|ing)|fees?|agreed)(?!\p{L})`,
    // fr
    String.raw`(?:en )?dehors de (?:cette |l['’] ?)app\p{L}*|hors de l['’] ?app\p{L}*`,
    String.raw`(?<!\p{L})(?:convenue?s?|arrangements?|débitée?s?|prélev\p{L}*|frais)(?!\p{L})`,
    // ar. Stems, as in IOS_BANNED: the language attaches و ال ب to the word.
    String.raw`خارج (?:هذا )?التطبيق|اتفق|متفق|اتفاق|خصم|رسوم|تحصيل`,
  ].join('|'),
  'iu',
);

export function iosHintHits(text: string): string[] {
  const g = new RegExp(IOS_HINTS.source, 'giu');
  return [...text.matchAll(g)].map((m) => m[0]);
}

/** Every link-like thing inside an element: an anchor, anything with an href, a role="link". */
export const linksIn = (el: Element | null): Element[] =>
  el ? [...el.querySelectorAll('a, [href], [role="link"]')] : [];

/** Everything a person sees or VoiceOver reads on the current document. */
function visibleText(): string {
  const attrs = [...document.body.querySelectorAll('[aria-label],[title],[placeholder],[alt]')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder', 'alt'].map((a) => el.getAttribute(a) ?? ''),
  );
  // One line per text node. body.textContent glues neighbours together
  // ("…scan-action.com" + "Unlimited" read "comUnlimited"), and the word-edge
  // guard then skips the word: control A caught exactly that.
  const nodes: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n.nodeValue ?? '');
  return [...nodes, ...attrs].join('\n');
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

async function renderApp(url: string, lang: Lang, auth: 'in' | 'out' | 'recovering'): Promise<void> {
  h.signedIn = auth !== 'out';
  h.recovering = auth === 'recovering';
  localStorage.setItem('lang', lang);
  window.history.replaceState({}, '', url);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root!.render(<LanguageProvider><App /></LanguageProvider>));
  // Let the mocked services resolve and the screens paint their data.
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

const click = (el: Element | null | undefined) => {
  expect(el, 'the control to click exists').toBeTruthy();
  flushSync(() => (el as HTMLElement).click());
};
const byText = (sel: string, text: string) =>
  [...document.body.querySelectorAll(sel)].find((el) => (el.textContent ?? '').trim() === text.trim());

interface Case {
  name: string;
  url: string;
  auth: 'in' | 'out' | 'recovering';
  /** Proof the intended screen rendered, not a blank page or a redirect elsewhere. */
  marker: (lang: Lang) => string;
  /** Optional steps that reach a state only an action shows. */
  act?: (lang: Lang) => Promise<void>;
  /**
   * The ONE text the hint scan may skip on this screen, by the owner's ruling:
   * the delete sheet's warning to a workspace with an ACTIVE billing source.
   * It must be on the screen (asserted), and only it is skipped.
   */
  hintExempt?: (lang: Lang) => string;
}

// One entry per route App.tsx declares (control B compares the keys).
export const ROUTES: Record<string, Case[]> = {
  '/': [{ name: 'home, signed out (goes to sign-in)', url: '/', auth: 'out', marker: (l) => strings[l].authSignInTitle }],
  '/login': [
    { name: 'sign-in', url: '/login', auth: 'out', marker: (l) => strings[l].authSignInTitle },
    {
      name: 'sign-up mode', url: '/login', auth: 'out', marker: (l) => strings[l].authSignUpTitle,
      act: async () => click(document.body.querySelectorAll('[role="radio"]')[1]),
    },
    {
      name: 'forgot password, no email typed', url: '/login', auth: 'out', marker: (l) => strings[l].forgotPasswordEmailRequired,
      act: async (l) => {
        click(byText('button', strings[l].authForgotPassword));
        await vi.waitFor(() => expect(visibleText()).toContain(strings[l].forgotPasswordEmailRequired));
      },
    },
  ],
  '/terms': [{ name: 'Terms', url: '/terms', auth: 'out', marker: () => '4. Payment' }],
  '/privacy': [{ name: 'Privacy', url: '/privacy', auth: 'out', marker: () => 'collects no payment details' }],
  '/privacy/app': [{ name: 'Privacy, the store page', url: '/privacy/app', auth: 'out', marker: () => 'This policy covers the Scan & Action app for iPhone and iPad.' }],
  '/refund': [{ name: 'Refund', url: '/refund', auth: 'out', marker: () => 'Nothing Is Sold in This App' }],
  '/delete-account': [{ name: 'Delete-account page', url: '/delete-account', auth: 'out', marker: () => 'What gets deleted' }],
  '/support': [{ name: 'Support', url: '/support', auth: 'out', marker: () => 'support@scan-action.com' }],
  '/support/app': [{ name: 'Support, the store page', url: '/support/app', auth: 'out', marker: () => 'or by writing to support@scan-action.com from the address you sign in with' }],
  '/auth/confirm': [{ name: 'email link landing, no token', url: '/auth/confirm', auth: 'out', marker: (l) => strings[l].authConfirmInvalidTitle }],
  [RESET_PASSWORD_PATH]: [{ name: 'password reset', url: RESET_PASSWORD_PATH, auth: 'recovering', marker: (l) => strings[l].resetPasswordTitle }],
  dashboard: [
    { name: 'ledger home', url: '/dashboard', auth: 'in', marker: () => 'BIM MAROC' },
    {
      name: 'multi-file pick (UploadModal, opened by ?intent=upload)', url: '/dashboard?intent=upload', auth: 'in',
      marker: (l) => strings[l].appOneDocumentAtATime,
      act: async () => {
        const input = document.body.querySelector('input[type="file"][multiple]') as HTMLInputElement;
        expect(input, 'the multi-file input').toBeTruthy();
        Object.defineProperty(input, 'files', {
          value: [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })],
          configurable: true,
        });
        flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true })));
        await vi.waitFor(() => expect(document.body.querySelector('[data-toast]')).not.toBeNull());
      },
    },
    {
      name: 'scan limit reached (CaptureSheet)', url: '/dashboard', auth: 'in', marker: (l) => strings[l].appScanLimitReached,
      act: async () => {
        const input = document.body.querySelector('[data-testid="file-input"]') as HTMLInputElement;
        Object.defineProperty(input, 'files', { value: [new File(['img'], 'r.jpg', { type: 'image/jpeg' })], configurable: true });
        flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true })));
        await vi.waitFor(() => expect(document.body.querySelector('[data-testid="capture-sheet"]')).not.toBeNull());
        const buttons = document.body.querySelectorAll('[data-testid="capture-sheet"] button');
        click(buttons[buttons.length - 1]);
        await vi.waitFor(() => expect(document.body.querySelector('[data-toast]')).not.toBeNull());
      },
    },
  ],
  overview: [{ name: 'overview', url: '/overview', auth: 'in', marker: () => 'bim-maroc.jpg' }],
  activity: [{ name: 'activity', url: '/activity', auth: 'in', marker: () => 'bim-maroc.jpg' }],
  search: [{ name: 'search', url: '/search', auth: 'in', marker: () => 'BIM MAROC' }],
  queue: [{ name: 'review queue', url: '/queue', auth: 'in', marker: () => 'BIM MAROC' }],
  'documents/:id': [{ name: 'document detail', url: '/documents/d1', auth: 'in', marker: () => 'BIM MAROC' }],
  settings: [
    { name: 'settings', url: '/settings', auth: 'in', marker: (l) => strings[l].manageAccountApp },
    ...([false, true] as const).map((billing): Case => ({
      name: `delete sheet, ${billing ? 'ACTIVE' : 'no'} billing source`, url: '/settings', auth: 'in',
      marker: (l) => (billing ? strings[l].deleteAccountOutsideAppWarning : strings[l].deleteAccountWarningTitle),
      hintExempt: billing ? (l) => strings[l].deleteAccountOutsideAppWarning : undefined,
      act: async (l) => {
        h.billing = billing;
        click(byText('button', strings[l].deleteAccount) ?? document.body.querySelector('[data-danger-zone] button'));
        await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')).not.toBeNull());
        for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
      },
    })),
  ],
  '*': [
    { name: 'unknown path, signed in (goes to the ledger)', url: '/nowhere', auth: 'in', marker: () => 'BIM MAROC' },
    { name: 'unknown path, signed out (goes to sign-in)', url: '/nowhere', auth: 'out', marker: (l) => strings[l].authSignInTitle },
  ],
};

beforeEach(() => {
  localStorage.clear();
  h.platform = 'ios';
  h.billing = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  root?.unmount();
  container?.remove();
  root = undefined;
  container = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('the iOS app: no plan, price or unlimited word on any screen, in en, fr and ar', () => {
  for (const [route, cases] of Object.entries(ROUTES)) {
    for (const c of cases) {
      for (const lang of LANGS) {
        it(`${route} · ${c.name} · ${lang}`, async () => {
          await renderApp(c.url, lang, c.auth);
          // The screen first (a redirect and the mocked data take a few ticks,
          // more under the full parallel suite), then the action, then the
          // intended state, all before the scan reads anything.
          if (c.act) {
            await vi.waitFor(() => expect(visibleText().trim().length).toBeGreaterThan(0), { timeout: 3000 });
            await c.act(lang);
          }
          await vi.waitFor(() => expect(visibleText(), 'the intended screen rendered').toContain(c.marker(lang)), { timeout: 3000 });
          const text = visibleText();
          expect(text.trim().length, 'something rendered').toBeGreaterThan(0);
          expect(text, 'the intended screen rendered').toContain(c.marker(lang));
          expect(iosHits(text)).toEqual([]);
          let hintText = text;
          if (c.hintExempt) {
            const exempt = c.hintExempt(lang);
            expect(text, 'the exempt warning is on this screen').toContain(exempt);
            hintText = text.split(exempt).join('');
          }
          expect(iosHintHits(hintText), 'a fee, arrangement or charge outside the app').toEqual([]);
        });
      }
    }
  }
});

describe('CONTROL A: the scan is not blind', () => {
  const PLANTED: Record<Lang, string> = { en: 'Unlimited scans', fr: 'Scans illimités', ar: 'مسحات بلا حدود' };
  for (const lang of LANGS) {
    it(`${lang}: a planted screen holding "${PLANTED[lang]}" inside a clean iOS render is caught`, async () => {
      await renderApp('/support', lang, 'out');
      expect(iosHits(visibleText())).toEqual([]);
      const planted = document.createElement('section');
      planted.textContent = PLANTED[lang];
      document.body.appendChild(planted); // outside React's root, which can rewrite its own children
      expect(iosHits(visibleText()).length).toBeGreaterThan(0);
    });
  }
  it('every word on the owner\'s list is caught in English, and the fr and ar forms in use', () => {
    for (const w of ['plan', 'Pro', 'premium', 'subscription', 'upgrade', 'price', 'paid', 'purchase', 'billing', 'Paddle', 'unlimited',
      'forfait', 'abonnement', 'prix', 'payant', 'achat', 'facturation', 'illimités', 'Passez à',
      'الخطة', 'اشتراك', 'الترقية', 'سعر', 'مدفوع', 'شراء', 'الفوترة', 'غير محدود', 'بلا حدود']) {
      expect(iosHits(w), w).not.toEqual([]);
    }
  });
  it('and it does not fire on the invoice words this app needs', () => {
    expect(iosHits('Reçus et factures · فاتورة · invoice · Processing · prompt')).toEqual([]);
  });
  it('the strings the iOS app stopped showing are still caught (they would fail the scan if shown)', () => {
    for (const lang of LANGS) {
      for (const key of ['freePlanSingleDoc', 'deleteAccountSubscriptionWarning'] as const) {
        expect(iosHits(strings[lang][key]).length, `${lang}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});

// ── THE STORE PAGES ──────────────────────────────────────────────────────────
// /privacy/app and /support/app are the addresses App Store Connect gives a
// reviewer, who opens them in a BROWSER: so they are scanned as the web and as
// Android too, not only as the iOS app. Their header holds no link, and every
// link on them stays inside these two pages plus the support address, so no
// chain of taps from them reaches the priced landing.
const STORE_PAGES = ['/privacy/app', '/support/app'] as const;
const STORE_LINKS = ['/privacy/app', '/support/app', 'mailto:support@scan-action.com'];

describe('THE STORE PAGES: every platform, no plan word, no hint, no header link, no link out', () => {
  for (const platform of ['web', 'ios', 'android'] as const) {
    for (const url of STORE_PAGES) {
      for (const lang of LANGS) {
        it(`${platform} ${url} · ${lang}`, async () => {
          h.platform = platform;
          await renderApp(url, lang, 'out');
          const marker = ROUTES[url][0].marker(lang);
          await vi.waitFor(() => expect(visibleText()).toContain(marker), { timeout: 3000 });
          expect(window.location.pathname, 'no redirect').toBe(url);
          const text = visibleText();
          expect(iosHits(text)).toEqual([]);
          expect(iosHintHits(text)).toEqual([]);
          const header = document.body.querySelector('[data-store-header]');
          expect(header, 'the store header').not.toBeNull();
          expect(document.body.querySelectorAll('header')).toHaveLength(1);
          expect(linksIn(header), 'a link in the store header').toEqual([]);
          for (const el of linksIn(document.body)) {
            const href = el.getAttribute('href') ?? `role=${el.getAttribute('role')}`;
            expect(STORE_LINKS, `${url} links to ${href}`).toContain(href);
          }
        });
      }
    }
  }
});

describe('CONTROL D: the hint scan is not blind', () => {
  const PLANTED_HINT: Record<Lang, string> = {
    en: ' Any fee agreed with us outside this app is governed by the terms under which it was agreed.',
    fr: ' Tout frais convenu avec nous en dehors de cette app reste dû.',
    ar: ' الرسوم المتفق عليها خارج هذا التطبيق تبقى مستحقة.',
  };
  for (const lang of LANGS) {
    it(`${lang}: a hint sentence planted in an iOS string is caught on the store page, and the page is clean once it is removed`, async () => {
      const table = strings[lang] as Record<string, string>;
      const original = table.privacySignInBodyApp;
      try {
        table.privacySignInBodyApp = original + PLANTED_HINT[lang];
        await renderApp('/privacy/app', lang, 'out');
        await vi.waitFor(() => expect(visibleText()).toContain(PLANTED_HINT[lang].trim()));
        expect(iosHintHits(visibleText()).length).toBeGreaterThan(0);
      } finally {
        table.privacySignInBodyApp = original;
      }
      root!.unmount(); container!.remove();
      await renderApp('/privacy/app', lang, 'out');
      await vi.waitFor(() => expect(visibleText()).toContain(ROUTES['/privacy/app'][0].marker(lang)));
      expect(iosHintHits(visibleText())).toEqual([]);
    });
  }
  it('the sentences taken off the iOS pages on 2026-11-25 are each caught', () => {
    for (const s of [
      'Any fee agreed with us outside this app is governed by the terms under which it was agreed.',
      'Deleting your account does not end anything arranged with us outside this app; if you have such an arrangement, write to support@scan-action.com.',
      'Otherwise you may continue to be charged.',
      'If you have a question about any charge connected with your Scan & Action account',
      'Questions about fees go to support@scan-action.com.',
    ]) expect(iosHintHits(s), s).not.toEqual([]);
  });
  it('the kept delete-sheet warning is caught in every language, so its exemption is a real one', () => {
    for (const lang of LANGS) expect(iosHintHits(strings[lang].deleteAccountOutsideAppWarning).length, lang).toBeGreaterThan(0);
  });
  it('and it does not fire on the Terms acceptance words', () => {
    expect(iosHintHits('you agree to be bound · an agreement between you · in accordance with the laws · in the app · Chargement')).toEqual([]);
  });
});

describe('CONTROL E: a link in a store header is caught', () => {
  for (const url of STORE_PAGES) {
    it(`${url}: a planted <a href="/"> and a planted role="link" are each reported`, async () => {
      h.platform = 'web';
      await renderApp(url, 'en', 'out');
      const header = document.body.querySelector('[data-store-header]')!;
      expect(linksIn(header)).toEqual([]);
      const a = document.createElement('a');
      a.setAttribute('href', '/');
      header.appendChild(a);
      expect(linksIn(header)).toHaveLength(1);
      a.remove();
      const span = document.createElement('span');
      span.setAttribute('role', 'link');
      header.appendChild(span);
      expect(linksIn(header)).toHaveLength(1);
    });
  }
  it('the landing header the store pages replace links to "/", and the check reports it', async () => {
    h.platform = 'web';
    await renderApp('/support', 'en', 'out');
    expect(linksIn(document.body.querySelector('[data-landing-header]')).map((el) => el.getAttribute('href'))).toContain('/');
  });
});

describe('CONTROL B: every route App.tsx declares is scanned', () => {
  it('the scanned routes equal the declared routes', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    const declared = new Set<string>();
    for (const m of src.matchAll(/<Route\s+[^>]*?path=(?:"([^"]+)"|\{(\w+)\})/g)) {
      if (m[1]) declared.add(m[1]);
      else if (m[2] === 'RESET_PASSWORD_PATH') declared.add(RESET_PASSWORD_PATH);
      else declared.add(`{${m[2]}}`); // an unknown constant: fails below
    }
    expect(declared.size).toBeGreaterThan(10); // the parse read the real file
    expect([...declared].sort()).toEqual(Object.keys(ROUTES).sort());
  });
});

describe('CONTROL C: the web and Android keep their text', () => {
  const WEB_PADDLE: Array<[string, string]> = [
    ['/terms', 'Paddle is the Merchant of Record for all our orders'],
    ['/refund', 'Paddle is the Merchant of Record for all our orders'],
    ['/privacy', 'Payments are processed by Paddle.com, our Merchant of Record'],
  ];
  for (const [url, sentence] of WEB_PADDLE) {
    it(`web ${url}: still names Paddle, as before`, async () => {
      h.platform = 'web';
      await renderApp(url, 'en', 'out');
      expect(visibleText()).toContain(sentence);
    });
  }
  it('web /privacy: the scanner reports its five words there, as on main before this change', async () => {
    // Paddle in sections 4 and 5, "subscribe" in section 4 (en), and
    // "subscription" in sections 2 and 7.
    h.platform = 'web';
    await renderApp('/privacy', 'en', 'out');
    const hits = iosHits(visibleText()).map((w) => w.toLowerCase()).sort();
    expect(hits).toEqual(['paddle', 'paddle', 'subscribe', 'subscription', 'subscription']);
  });
  it('web /privacy and /delete-account keep their subscription sentences', async () => {
    h.platform = 'web';
    await renderApp('/privacy', 'en', 'out');
    expect(visibleText()).toContain('Deleting your account does not cancel an active subscription; if you have one, cancel it by writing to support@scan-action.com.');
    expect(visibleText()).toContain('manage your subscription');
    root!.unmount(); container!.remove();
    await renderApp('/delete-account', 'en', 'out');
    expect(visibleText()).toContain('Subscriptions');
  });
  it('Android /terms, /refund and /privacy keep the web text too', async () => {
    h.platform = 'android';
    for (const [url, sentence] of WEB_PADDLE) {
      await renderApp(url, 'en', 'out');
      expect(visibleText(), url).toContain(sentence);
      root!.unmount(); container!.remove();
    }
  });
  for (const lang of LANGS) {
    it(`${lang}: Android's multi-file toast is the one it had`, async () => {
      h.platform = 'android';
      await renderApp('/dashboard?intent=upload', lang, 'in');
      await ROUTES.dashboard[1].act!(lang);
      expect(document.body.querySelector('[data-toast]')!.textContent).toBe(strings[lang].freePlanSingleDoc);
    });
    it(`${lang}: Android's delete sheet keeps the subscription warning`, async () => {
      h.platform = 'android';
      await renderApp('/settings', lang, 'in');
      click(byText('button', strings[lang].deleteAccount) ?? document.body.querySelector('[data-danger-zone] button'));
      await vi.waitFor(() => expect(visibleText()).toContain(strings[lang].deleteAccountSubscriptionWarning));
    });
  }
});
