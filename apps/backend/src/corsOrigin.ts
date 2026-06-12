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

export function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes(origin) || VERCEL_PREVIEW_ORIGIN.test(origin);
}
