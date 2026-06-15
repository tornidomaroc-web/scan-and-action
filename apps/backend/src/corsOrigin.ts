// Origin validation for CORS.
//
// Two ways in: an exact match against the configured allowlist
// (ALLOWED_ORIGINS), or a Vercel preview deployment of THIS project.
// Preview URLs are dynamic (scan-and-action-git-<branch-hash>-<team>.vercel.app)
// so they can't live in a static allowlist.
//
// The pattern is deliberately strict:
//   - https only
//   - hostname is a single label (no dots) starting with the project name
//   - anchored suffix including the team slug, so other teams'
//     *.vercel.app deployments and lookalike domains
//     (…-tornidomaroc-webs-projects.vercel.app.attacker.com) never match.
const VERCEL_PREVIEW_ORIGIN =
  /^https:\/\/scan-and-action(-[a-z0-9-]+)?-tornidomaroc-webs-projects\.vercel\.app$/;

// The Capacitor Android app bundles its own UI and serves it from a fixed
// localhost origin (androidScheme: 'https' -> https://localhost). iOS (a future
// chunk) uses capacitor://localhost. These are constant per-platform origins —
// NOT the dev server (http://localhost:5173) and NOT an arbitrary localhost port
// — so allowing them exactly does not widen the surface for a browser attacker,
// who can never make a page served from https://localhost reach a real user.
const NATIVE_APP_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);

export function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  return (
    allowedOrigins.includes(origin) ||
    NATIVE_APP_ORIGINS.has(origin) ||
    VERCEL_PREVIEW_ORIGIN.test(origin)
  );
}
