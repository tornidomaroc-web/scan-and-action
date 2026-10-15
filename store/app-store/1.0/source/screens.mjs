// The store set, in its order. Each frame explains one thing the app does
// today; the order follows a receipt's life: what you get, how it comes in,
// what is read, what needs you, how you find it again.
export const SCREENS = [
  { name: '01-home', route: '/dashboard' },
  { name: '02-capture', route: '/dashboard', steps: [{ click: '[data-testid=scan-slot]' }] },
  // Candidate for frame 2 (2026-10-15): the screen a scan lands on.
  { name: '02-reading', route: '/documents/r1' },
  { name: '03-detail', route: '/documents/d1' },
  { name: '04-queue', route: '/queue' },
  { name: '05-search', route: '/search?month=2026-10' },
];
