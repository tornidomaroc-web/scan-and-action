// Sign-in keyboard proof (throwaway): the reviewer's first screen, keyboard up.
export const SCREENS = [
  { name: 's1-email', route: '/login', signedOut: true },
  { name: 's2-password', route: '/login', signedOut: true, steps: [{ focus: 'input[type=password]' }] },
];
