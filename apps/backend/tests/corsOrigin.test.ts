import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '../src/corsOrigin';

// Mirrors the four origins configured in ALLOWED_ORIGINS on Railway.
const ALLOWLIST = [
  'https://scan-and-action.vercel.app',
  'https://www.scan-action.com',
  'https://scan-action.com',
  'http://localhost:5173',
];

const PREVIEW =
  'https://scan-and-action-git-phase1-ch-ebbc98-tornidomaroc-webs-projects.vercel.app';

describe('isAllowedOrigin', () => {
  it('accepts every origin on the static allowlist', () => {
    for (const origin of ALLOWLIST) {
      expect(isAllowedOrigin(origin, ALLOWLIST)).toBe(true);
    }
  });

  it('accepts a Vercel preview deployment of this project', () => {
    expect(isAllowedOrigin(PREVIEW, ALLOWLIST)).toBe(true);
  });

  it('accepts the team-scoped project URL with no branch segment', () => {
    expect(
      isAllowedOrigin('https://scan-and-action-tornidomaroc-webs-projects.vercel.app', ALLOWLIST)
    ).toBe(true);
  });

  it('rejects vercel.app deployments of other teams and projects', () => {
    expect(isAllowedOrigin('https://evil-app.vercel.app', ALLOWLIST)).toBe(false);
    expect(
      isAllowedOrigin('https://other-app-git-main-someone-elses-projects.vercel.app', ALLOWLIST)
    ).toBe(false);
    // Same team slug but different project name prefix.
    expect(
      isAllowedOrigin('https://another-project-git-x-tornidomaroc-webs-projects.vercel.app', ALLOWLIST)
    ).toBe(false);
  });

  it('rejects the http variant of a preview URL', () => {
    expect(isAllowedOrigin(PREVIEW.replace('https://', 'http://'), ALLOWLIST)).toBe(false);
  });

  it('rejects lookalike domains that embed the real suffix', () => {
    expect(
      isAllowedOrigin(
        'https://evil-tornidomaroc-webs-projects.vercel.app.attacker.com',
        ALLOWLIST
      )
    ).toBe(false);
    expect(
      isAllowedOrigin(
        'https://scan-and-action-git-x-tornidomaroc-webs-projects.vercel.app.attacker.com',
        ALLOWLIST
      )
    ).toBe(false);
  });

  it('rejects origins absent from the allowlist that match no pattern', () => {
    expect(isAllowedOrigin('https://scan-action.com.evil.com', ALLOWLIST)).toBe(false);
    expect(isAllowedOrigin('http://localhost:3000', ALLOWLIST)).toBe(false);
  });

  it('accepts the Capacitor native app origins regardless of ALLOWED_ORIGINS', () => {
    // The Android WebView serves the bundled UI from https://localhost; iOS will
    // use capacitor://localhost. These must work even with an empty allowlist.
    expect(isAllowedOrigin('https://localhost', [])).toBe(true);
    expect(isAllowedOrigin('capacitor://localhost', [])).toBe(true);
  });

  it('does not let the native exception widen to arbitrary localhost ports/schemes', () => {
    expect(isAllowedOrigin('http://localhost', ALLOWLIST)).toBe(false);
    expect(isAllowedOrigin('https://localhost:8080', ALLOWLIST)).toBe(false);
    expect(isAllowedOrigin('https://localhost.attacker.com', ALLOWLIST)).toBe(false);
  });
});
