import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// THE iOS APP SHOWS NO PLAN, NO PRO, NOTHING TO BUY (App Store 3.1.1).
// ============================================================================
// App Review rejected 1.0 (35) on 2026-11-07 under 3.1.1: the app gave access
// to a plan bought elsewhere. The backend now serves the iOS app the free
// tier (apps/backend/src/services/entitlement/clientPlatform.ts); this file
// holds the client half:
//
//   1. every API request from the iOS app carries X-Client-Platform: ios, and
//      no request from Android or the web does;
//   2. the iOS screens this change touches, rendered in en, fr and ar, carry
//      no plan or purchase word: SCAN_WORDS finds zero hits;
//   3. the scan can fail: the same screens rendered as Android show the three
//      Settings strings it must catch (strings.ts freeTier, freeLimit,
//      proAutoUnlock), and a planted "Passez à PRO" inside an iOS render is
//      caught;
//   4. the delete sheet warns about billing on iOS only when the workspace
//      really has an ACTIVE billing source;
//   5. the two settings the platform signal stands on are pinned: no
//      CapacitorHttp (it would move requests off WKWebView and drop the
//      Origin) and no custom iosScheme (it would change the Origin).
// ============================================================================

const h = vi.hoisted(() => ({
  platform: 'ios' as 'ios' | 'android' | 'web',
  billing: false,
  calls: [] as Array<{ url: string; headers: Record<string, string> }>,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => h.platform,
    isNativePlatform: () => h.platform !== 'web',
  },
}));
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { setStyle: async () => {} }, Style: { Dark: 'DARK', Light: 'LIGHT' } }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: async () => {} } }));
vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1', email: 'reader@example.com' }, session: null, loading: false, signOut: vi.fn() }),
  AuthProvider: ({ children }: any) => children,
}));
vi.mock('../src/native/useBackDismiss', () => ({ useBackDismiss: () => {} }));
vi.mock('../src/services/uploadService', () => ({ uploadDocument: vi.fn(async () => { throw new Error('LIMIT_REACHED'); }) }));
vi.mock('../src/lib/imagePreprocess', () => ({ preprocessImage: vi.fn(async (f: File) => f) }));
vi.mock('../src/native/documentScanner', () => ({ hasScannerPlatform: () => false, scanDocument: vi.fn() }));
vi.mock('../src/native/camera', () => ({ ensureCameraPermission: async () => true }));

import { strings } from '../src/i18n/strings';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ProcessingProvider } from '../src/contexts/ProcessingContext';
import { SettingsScreen } from '../src/screens/SettingsScreen';
import { DeleteAccountModal } from '../src/components/DeleteAccountModal';
import { PaywallModal } from '../src/components/PaywallModal';
import { CaptureSheet } from '../src/components/CaptureSheet';
import { getAuthHeaders, CLIENT_PLATFORM_HEADER } from '../src/services/apiConfig';

type Lang = 'en' | 'fr' | 'ar';
const LANGS: Lang[] = ['en', 'fr', 'ar'];

// Plan and purchase words in the three languages. Broad on purpose: a hit is
// reviewed by a person, a miss ships. Kept in step with the inventory scan
// in the 2026-11-07 design report.
export const SCAN_WORDS =
  /\b(pro|premium|upgrade|unlock|subscri\w*|billing|paddle|checkout|price|pricing|paid|free|plan)\b|abonnement|gratuit|mise à niveau|passe[rz] à|forfait|payant|débloqu|factur|ترقي|اشترا?ك|مجان|مدفوع|خطة|الدفع|الفواتير|تفعيل/iu;

export function scanHits(text: string): string[] {
  const g = new RegExp(SCAN_WORDS.source, 'giu');
  return [...text.matchAll(g)].map((m) => m[0]);
}

let container: HTMLDivElement;
let root: Root;

function render(node: React.ReactNode, lang: Lang, plan: 'FREE' | 'PRO' = 'PRO') {
  localStorage.setItem('lang', lang);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/settings']}>
            <ProcessingProvider>
              <Routes>
                <Route element={<Outlet context={{ onSuccess: () => {}, refreshCount: 0, plan }} />}>
                  <Route path="/settings" element={node} />
                </Route>
              </Routes>
            </ProcessingProvider>
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>,
    );
  });
}

const bodyText = () => document.body.textContent ?? '';

async function hitTheLimit(plan: 'FREE' | 'PRO' = 'FREE'): Promise<string> {
  render(<CaptureSheet plan={plan} />, (localStorage.getItem('lang') as Lang) || 'en', plan);
  const input = document.body.querySelector('[data-testid="file-input"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [new File(['img'], 'r.jpg', { type: 'image/jpeg' })], configurable: true });
  flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true })));
  await vi.waitFor(() => expect(document.body.querySelector('[data-testid="capture-sheet"]')).not.toBeNull());
  const buttons = document.body.querySelectorAll('[data-testid="capture-sheet"] button');
  flushSync(() => (buttons[buttons.length - 1] as HTMLButtonElement).click());
  await vi.waitFor(() => expect(document.body.querySelector('[data-toast]')).not.toBeNull());
  return document.body.querySelector('[data-toast]')!.textContent ?? '';
}

beforeEach(() => {
  localStorage.clear();
  h.platform = 'ios';
  h.billing = false;
  h.calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    h.calls.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) } });
    return new Response(JSON.stringify({ plan: 'FREE', hasActiveBilling: h.billing }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
});
afterEach(() => {
  root?.unmount();
  container?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('1. every API request from the iOS app says so; Android and the web do not', () => {
  it('iOS: X-Client-Platform: ios, next to the token', async () => {
    h.platform = 'ios';
    expect(await getAuthHeaders()).toEqual({ Authorization: 'Bearer tok', [CLIENT_PLATFORM_HEADER]: 'ios' });
  });
  for (const platform of ['android', 'web'] as const) {
    it(`CONTROL ${platform}: no platform header, exactly as before`, async () => {
      h.platform = platform;
      expect(await getAuthHeaders()).toEqual({ Authorization: 'Bearer tok' });
    });
  }
  it('the header name is the one the backend reads', () => {
    const backend = readFileSync(join(process.cwd(), '..', 'backend', 'src', 'services', 'entitlement', 'clientPlatform.ts'), 'utf8');
    expect(backend).toContain(`CLIENT_PLATFORM_HEADER = '${CLIENT_PLATFORM_HEADER.toLowerCase()}'`);
  });
});

describe('2. the iOS screens carry no plan or purchase word, in en, fr and ar', () => {
  for (const lang of LANGS) {
    for (const plan of ['PRO', 'FREE'] as const) {
      it(`${lang}: Settings for a ${plan} workspace`, () => {
        render(<SettingsScreen />, lang, plan);
        expect(scanHits(bodyText())).toEqual([]);
        expect(bodyText()).toContain(strings[lang].manageAccountApp);
        expect(document.body.querySelector('[data-legal-panel]')).not.toBeNull(); // the screen did render
      });
    }
    it(`${lang}: the scan limit message`, async () => {
      localStorage.setItem('lang', lang);
      const toast = await hitTheLimit();
      expect(toast).toBe(strings[lang].appScanLimitReached);
      expect(scanHits(bodyText())).toEqual([]);
    });
    it(`${lang}: the scan limit message, even when a backend from before the clamp says PRO`, async () => {
      localStorage.setItem('lang', lang);
      const toast = await hitTheLimit('PRO');
      expect(toast).toBe(strings[lang].appScanLimitReached);
      expect(scanHits(bodyText())).toEqual([]);
    });
    it(`${lang}: the delete sheet of a workspace with no billing`, async () => {
      h.billing = false;
      render(<DeleteAccountModal isOpen onClose={() => {}} onDeleted={() => {}} />, lang);
      await vi.waitFor(() => expect(h.calls.some((c) => c.url.endsWith('/user/me'))).toBe(true));
      await new Promise((r) => setTimeout(r, 0));
      expect(bodyText()).not.toContain(strings[lang].deleteAccountSubscriptionWarning);
      expect(scanHits(bodyText())).toEqual([]);
    });
    it(`${lang}: the plan sheet does not render at all`, () => {
      render(<PaywallModal isOpen onClose={() => {}} />, lang);
      expect(bodyText()).toBe('');
    });
  }
});

describe('3. CONTROLS: the scan catches what it must', () => {
  for (const lang of LANGS) {
    it(`${lang}: Settings rendered as Android carries freeTier, freeLimit and proAutoUnlock, and the scan finds them`, () => {
      h.platform = 'android';
      render(<SettingsScreen />, lang, 'FREE');
      const text = bodyText();
      for (const key of ['freeTier', 'freeLimit', 'proAutoUnlock'] as const) expect(text).toContain(strings[lang][key]);
      for (const key of ['freeTier', 'freeLimit', 'proAutoUnlock'] as const) expect(scanHits(strings[lang][key]).length, key).toBeGreaterThan(0);
    });
    it(`${lang}: a planted "Passez à PRO" inside an iOS render is caught`, () => {
      render(<SettingsScreen />, lang, 'PRO');
      expect(scanHits(bodyText())).toEqual([]);
      const planted = document.createElement('p');
      planted.textContent = 'Passez à PRO';
      container.querySelector('[data-legal-panel]')!.appendChild(planted);
      expect(scanHits(bodyText()).length).toBeGreaterThan(0);
    });
  }
  it('the Android limit message is unchanged', async () => {
    h.platform = 'android';
    localStorage.setItem('lang', 'en');
    expect(await hitTheLimit()).toBe(strings.en.freePlanLimitReached);
  });
});

describe('4. the delete sheet warns about billing on iOS only when billing is ACTIVE', () => {
  it('iOS with an ACTIVE billing source: the warning shows', async () => {
    h.billing = true;
    render(<DeleteAccountModal isOpen onClose={() => {}} onDeleted={() => {}} />, 'en');
    await vi.waitFor(() => expect(bodyText()).toContain(strings.en.deleteAccountSubscriptionWarning));
    expect(bodyText()).toContain(strings.en.deleteAccountSubscriptionWarning);
    const me = h.calls.find((c) => c.url.endsWith('/user/me'))!;
    expect(me.headers[CLIENT_PLATFORM_HEADER]).toBe('ios');
  });
  for (const platform of ['android', 'web'] as const) {
    it(`CONTROL ${platform}: the warning shows as before, and no billing request is made`, () => {
      h.platform = platform;
      render(<DeleteAccountModal isOpen onClose={() => {}} onDeleted={() => {}} />, 'en');
      expect(bodyText()).toContain(strings.en.deleteAccountSubscriptionWarning);
      expect(h.calls.filter((c) => c.url.endsWith('/user/me'))).toEqual([]);
    });
  }
});

describe('5. the platform signal: the settings it stands on are pinned', () => {
  const config = readFileSync(join(process.cwd(), 'capacitor.config.ts'), 'utf8');
  const cors = readFileSync(join(process.cwd(), '..', 'backend', 'src', 'corsOrigin.ts'), 'utf8');
  const platform = readFileSync(join(process.cwd(), '..', 'backend', 'src', 'services', 'entitlement', 'clientPlatform.ts'), 'utf8');
  it('no CapacitorHttp: requests stay in WKWebView, which sends Origin', () => {
    expect(config).not.toMatch(/CapacitorHttp/);
  });
  it('no custom iosScheme: the iOS origin stays capacitor://localhost', () => {
    expect(config).not.toMatch(/iosScheme/);
    expect(cors).toContain("'capacitor://localhost'");
    expect(platform).toContain("IOS_APP_ORIGIN = 'capacitor://localhost'");
  });
  it('CONTROL: the pins read the real files', () => {
    expect(config).toContain("appId: 'com.scanaction.app'");
  });
});
