// Dark Interface proof (throwaway): every common task, shot with NO stored
// theme so the app follows the system appearance, plus the in-app toggle.
export const SCREENS = [
  { name: '01-home', route: '/dashboard' },
  { name: '02-capture', route: '/dashboard', steps: [{ click: '[data-testid=scan-slot]' }] },
  { name: '03-detail', route: '/documents/d1' },
  { name: '04-queue', route: '/queue' },
  { name: '05-search', route: '/search?month=2026-10' },
  { name: '06-settings', route: '/settings' },
  { name: '07-tray', route: '/dashboard', jobs: true, steps: [{ click: '[data-testid=processing-chip]' }] },
  { name: '08-signin', route: '/login', signedOut: true },
  { name: '09-toggle', route: '/settings', steps: [{ text: { en: 'Switch to dark mode' } }] },
];
