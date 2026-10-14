// The PR 5 proof matrix: every screen and sheet the PR touches, and how the
// harness reaches it. `wait` is how long after load the page is read (the
// timeout state needs the 20 s limit to pass); `web` / `native` limit a screen
// to where it can exist.
const confirm = (verify) => ({ route: '/auth/confirm?token_hash=proof0000&type=email', signedOut: true, verify });
export const SCREENS = [
  { name: 'signin', route: '/login', signedOut: true },
  { name: 'signup', route: '/login', signedOut: true, steps: [{ click: '[data-auth-mode-switch] button:nth-child(2)' }] },
  { name: 'inbox', route: '/login', signedOut: true, steps: [
    { click: '[data-auth-mode-switch] button:nth-child(2)' },
    { fill: ['#email', 'new.person@example.com'] }, { fill: ['#password', 'proof-password-1'] },
    { click: '[data-auth-form] button[type=submit]' }] },
  { name: 'confirm-working', ...confirm('hang'), wait: 4000 },
  { name: 'confirm-invalid', route: '/auth/confirm?type=email', signedOut: true },
  { name: 'confirm-failed', ...confirm('expired') },
  { name: 'confirm-network', ...confirm('network') },
  { name: 'confirm-timeout', ...confirm('hang'), wait: 23500 },
  { name: 'settings', route: '/settings' },
  { name: 'capture', route: '/dashboard', steps: [{ click: '[data-testid=scan-slot]' }] },
  { name: 'delete', route: '/settings', steps: [{ text: { en: 'Delete account', ar: 'حذف الحساب' } }] },
  { name: 'paywall', route: '/settings', web: true, steps: [{ text: { en: 'Go PRO for unlimited access', ar: 'الترقية إلى PRO للوصول غير المحدود' } }] },
  { name: 'tray', route: '/dashboard', jobs: true, steps: [{ click: '[data-testid=processing-chip]' }] },
  { name: 'prowelcome', route: '/dashboard?checkout=success' },
];
