import type { PlanType } from '@prisma/client';

// ============================================================================
// THE iOS APP IS HELD TO THE FREE TIER.
// ============================================================================
// The iOS app offers nothing to buy, so it must not give access to a plan
// bought elsewhere (App Store Review Guideline 3.1.1, rejection of 1.0 (35)
// on 2026-11-07). The web and the Android app keep the stored plan exactly as
// before.
//
// This is a READ-TIME VIEW. The stored Organization.plan and planOverride are
// never written here: billing, webhooks and every other platform read the
// stored value unchanged.
//
// HOW A REQUEST IS KNOWN TO COME FROM THE iOS APP. Either signal is enough:
//
//   1. `Origin: capacitor://localhost`. WKWebView sends it on every
//      cross-origin request the bundled page makes, and page script cannot
//      set Origin (a forbidden header). The Android app's origin is
//      https://localhost and the web's is its own https host (corsOrigin.ts).
//   2. `X-Client-Platform: ios`, set by the frontend's getAuthHeaders() when
//      Capacitor reports the iOS platform. It covers a request that reaches
//      us without an Origin.
//
// A request carrying neither signal is read with the stored plan, which is
// today's behaviour for the web and Android. A caller that claims to be the
// iOS app only lowers its own limits.
// ============================================================================

export const IOS_APP_ORIGIN = 'capacitor://localhost';
export const CLIENT_PLATFORM_HEADER = 'x-client-platform';

// Node lowercases incoming header names on req.headers, so a lowercase key
// reads whatever case the client sent.
type HeaderSource = { headers?: Record<string, string | string[] | undefined> };

function header(req: HeaderSource, name: string): string {
  const value = req.headers?.[name];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

export function isIOSAppRequest(req: HeaderSource): boolean {
  if (header(req, 'origin') === IOS_APP_ORIGIN) return true;
  return header(req, CLIENT_PLATFORM_HEADER).trim().toLowerCase() === 'ios';
}

/** The plan this request is served under. Never written back. */
export function effectivePlan(stored: PlanType | null | undefined, req: HeaderSource): PlanType {
  const plan: PlanType = stored ?? 'FREE';
  return isIOSAppRequest(req) ? 'FREE' : plan;
}
