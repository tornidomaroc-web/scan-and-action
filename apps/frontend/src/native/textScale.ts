import { Capacitor } from '@capacitor/core';

// The phone's text size setting (Dynamic Type on iOS, Font size on Android, the
// browser's font size on the web) reaches the app through ONE number: the root
// font size. Every font size in the app is in rem (textScale.test.ts holds the
// source to that), so the root moves all text together, and Tailwind's rem
// spacing moves with it, which keeps a grown label inside its own box.
//
// Each platform arrives differently, measured 2026-10-13:
// - Web: the browser's default font size already sets the root (index.css
//   writes `min(100%, cap)`), so nothing here runs.
// - Android: the WebView applies the system font scale to every computed font
//   size on its own (root 16px at 1.0, 32px at 2.0 on API 36, WebView 133),
//   with no upper bound. We measure what it applied and, above the cap, pull
//   the root down so the product of the two lands on the cap.
// - iOS: WKWebView ignores Dynamic Type except through the system font
//   keywords. `-apple-system-body` is 17px at the default size (Large) and
//   follows the setting, so its ratio to 17 is the scale.
//
// No native code: a failed or missing reading leaves the root alone, which is
// exactly the behaviour before this file (Android uncapped, iOS fixed).

/** The largest standard iOS size, xxxLarge: a 23pt body against 17pt at Large. */
export const TEXT_SCALE_CAP = 23 / 17;
/** The smallest the app follows down to: Android's smallest step, 0.85. */
export const TEXT_SCALE_FLOOR = 0.85;
/** The root the app is designed at, and `-apple-system-body` at Large. */
export const BASE_ROOT_PX = 16;
export const IOS_BODY_AT_LARGE_PX = 17;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.min(TEXT_SCALE_CAP, Math.max(TEXT_SCALE_FLOOR, scale));
}

/**
 * The inline root font size to set, or null to leave the stylesheet's root
 * alone. `reading` is what the platform reported: on iOS the computed size of
 * `-apple-system-body` in px; on Android the factor the WebView itself applied
 * to a known font size.
 */
export function rootFontSizeFor(platform: string, reading: number): string | null {
  if (!Number.isFinite(reading) || reading <= 0) return null;
  if (platform === 'ios') {
    const scale = clampScale(reading / IOS_BODY_AT_LARGE_PX);
    return scale === 1 ? null : `${round(BASE_ROOT_PX * scale)}px`;
  }
  if (platform === 'android') {
    // The WebView multiplies whatever we set by `reading`; below the cap its
    // own scaling is already right.
    if (reading <= TEXT_SCALE_CAP) return null;
    return `${round((BASE_ROOT_PX * TEXT_SCALE_CAP) / reading)}px`;
  }
  return null;
}

function round(px: number): number {
  return Math.round(px * 1000) / 1000;
}

function measure(style: string, read: (el: HTMLElement) => number): number {
  const el = document.createElement('span');
  el.setAttribute('aria-hidden', 'true');
  el.textContent = 'X';
  el.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;top:0;left:0;white-space:nowrap;${style}`;
  document.body.appendChild(el);
  try {
    return read(el);
  } finally {
    el.remove();
  }
}

function readPlatform(platform: string): number {
  if (platform === 'ios') {
    return measure('font:-apple-system-body', (el) => parseFloat(getComputedStyle(el).fontSize));
  }
  // A 100px line of line-height 1 renders 100 tall unless the WebView scaled it.
  return measure('font-size:100px;line-height:1', (el) => el.getBoundingClientRect().height / 100);
}

export function applyTextScale(): void {
  const platform = Capacitor.getPlatform();
  if (platform !== 'ios' && platform !== 'android') return;
  const root = document.documentElement;
  try {
    // Measure against the stylesheet's root, not a previous reading's.
    root.style.removeProperty('font-size');
    const size = rootFontSizeFor(platform, readPlatform(platform));
    if (size) root.style.setProperty('font-size', size);
    root.dataset.textScale = size ?? 'system';
  } catch {
    root.style.removeProperty('font-size');
  }
}

let started = false;

export function initTextScale(): void {
  if (started) return;
  started = true;
  applyTextScale();
  // The setting is changed in the system Settings app, so the app comes back
  // to the foreground with it. Android recreates the activity on a font change;
  // iOS keeps the page and re-resolves the system font.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') applyTextScale();
  });
}
