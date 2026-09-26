// ============================================================================
// Safari's toolbars take the page's `theme-color`. index.html declares one
// per colour scheme; when the person chooses a theme in the app, both metas
// take the chosen surface so the toolbar never shows the other theme's
// colour under the tab bar (seen as a stray band on the owner's iPhone,
// 2026-09-26). The two values are the page surfaces in tokens.css.
// ============================================================================

export const THEME_COLOR = { light: '#F5F6FA', dark: '#0F1014' } as const;

export function syncThemeColor(theme: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', THEME_COLOR[theme]));
}
