// Store set, direction C (2026-10-15): the five approved frames, in order.
export const SCREENS = [
  { name: '01-home', route: '/dashboard' },
  { name: '02-capture', route: '/dashboard', steps: [{ click: '[data-testid=scan-slot]' }] },
  // The receipt photo must have loaded before the shot (run 38784782735 fired too early).
  { name: '03-detail', route: '/documents/d1', wait: 9000 },
  { name: '04-queue', route: '/queue' },
  { name: '05-search', route: '/search?month=2026-10' },
];
