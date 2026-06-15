import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

// One-time native shell setup: status-bar styling that tracks dark mode, plus a
// hook to hide the splash once the UI is ready. All no-ops on the web build, so
// the same bundle still ships to Vercel unchanged.
//
// NOTE on Android 15 (targetSdk 35): edge-to-edge is enforced, so the WebView
// draws under the status/navigation bars. The status bar is transparent; the
// visible colour behind it comes from the app's own header, which is padded with
// env(safe-area-inset-top) (see Layout). Here we only control the icon style so
// status-bar icons stay legible against that header in both themes.
export const isNativePlatform = (): boolean => Capacitor.isNativePlatform();

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}

async function syncStatusBar(): Promise<void> {
  try {
    // Style.Dark = light icons (for a dark background); Style.Light = dark icons.
    await StatusBar.setStyle({ style: isDarkMode() ? Style.Dark : Style.Light });
  } catch {
    /* status bar unavailable on this surface — ignore */
  }
}

let started = false;

export function initNativeShell(): void {
  if (!isNativePlatform() || started) return;
  started = true;

  void syncStatusBar();

  // The theme toggle flips the `dark` class on <html> (Sidebar/useTheme). Watch
  // it so the status-bar icon colour follows the theme without coupling this to
  // the theme code.
  const observer = new MutationObserver(() => void syncStatusBar());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
}

// Called once React has painted (App mount) so users never see a white flash
// between the splash and the first frame.
export function hideSplash(): void {
  if (!isNativePlatform()) return;
  void SplashScreen.hide().catch(() => {});
}
