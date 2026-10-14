// The PR 6 proof matrix: every public page. `native` marks the ones the app
// opens inside itself (Settings and sign-in link /privacy and /terms; the
// privacy policy links /delete-account); the landing never renders natively.
export const SCREENS = [
  { name: 'landing', route: '/', signedOut: true, web: true },
  { name: 'privacy', route: '/privacy', signedOut: true },
  { name: 'terms', route: '/terms', signedOut: true },
  { name: 'refund', route: '/refund', signedOut: true, web: true },
  { name: 'delete-account', route: '/delete-account', signedOut: true },
  { name: 'support', route: '/support', signedOut: true, web: true },
];
