import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// The iOS platform and its TestFlight pipeline (2026-09-27), pinned from the
// side a Linux runner can see. What only the macOS run can prove (signing,
// upload, the buttons on a phone) is not claimed here; what a PR can break
// silently is: the three edits deferred from #258, the export-compliance key,
// the version and device-family settings, the splash colour agreeing across
// the three places that paint it, and the workflow never opening the Admin
// key to a pull request.
// ============================================================================

const F = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
const ROOT = (rel: string) => readFileSync(join(__dirname, '..', '..', '..', rel), 'utf8');

import { GOOGLE_IOS_CLIENT_ID } from '../src/lib/googleClientIds';

const reversed = (id: string) => id.split('.').reverse().join('.');

describe('Info.plist', () => {
  const plist = F('ios/App/App/Info.plist');
  it('carries the reversed Google iOS client id as a URL scheme, derived from the committed id', () => {
    expect(GOOGLE_IOS_CLIENT_ID).toMatch(/\.apps\.googleusercontent\.com$/);
    expect(plist).toContain(`<string>${reversed(GOOGLE_IOS_CLIENT_ID)}</string>`);
    expect(reversed(GOOGLE_IOS_CLIENT_ID)).toMatch(/^com\.googleusercontent\.apps\./);
  });
  it('declares no non-exempt encryption (HTTPS only), so TestFlight asks no compliance question', () => {
    expect(plist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  });
  it('reads version and build from the build settings, never literals', () => {
    expect(plist).toMatch(/<key>CFBundleShortVersionString<\/key>\s*<string>\$\(MARKETING_VERSION\)<\/string>/);
    expect(plist).toMatch(/<key>CFBundleVersion<\/key>\s*<string>\$\(CURRENT_PROJECT_VERSION\)<\/string>/);
  });
});

describe('entitlements and project settings', () => {
  const pbx = F('ios/App/App.xcodeproj/project.pbxproj');
  it('Sign in with Apple is in the entitlements file the project signs with', () => {
    const ent = F('ios/App/App/App.entitlements');
    expect(ent).toMatch(/<key>com\.apple\.developer\.applesignin<\/key>\s*<array>\s*<string>Default<\/string>\s*<\/array>/);
    expect(pbx.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g)).toHaveLength(2);
  });
  it('automatic signing under the owner team, bundle com.scanaction.app, in both configurations', () => {
    expect(pbx.match(/CODE_SIGN_STYLE = Automatic;/g)).toHaveLength(2);
    expect(pbx.match(/DEVELOPMENT_TEAM = NQ23SMHXJV;/g)).toHaveLength(2);
    expect(pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = com\.scanaction\.app;/g)).toHaveLength(2);
  });
  it('marketing version 1.0.0, fixed in the project; build number left to the pipeline', () => {
    expect(pbx.match(/MARKETING_VERSION = 1\.0\.0;/g)).toHaveLength(2);
    expect(pbx.match(/CURRENT_PROJECT_VERSION = 1;/g)).toHaveLength(2);
  });
  it('iPhone only (board: v1 is iPhone-only)', () => {
    expect(pbx.match(/TARGETED_DEVICE_FAMILY = 1;/g)).toHaveLength(2);
    expect(pbx).not.toContain('TARGETED_DEVICE_FAMILY = "1,2"');
  });
});

describe('the splash colour is one value in the three places that paint it', () => {
  it('capacitor.config, the asset script and the launch storyboard agree on #0F1014', () => {
    const cfg = F('capacitor.config.ts');
    expect(cfg).toMatch(/backgroundColor:\s*'#0F1014'/);
    expect(cfg).not.toContain('#0f172a');
    const script = F('assets/generate-android-icons.py');
    expect(script).toMatch(/SPLASH_NAVY = "#0F1014"/);
    const storyboard = F('ios/App/App/Base.lproj/LaunchScreen.storyboard');
    // #0F1014 = rgb(15, 16, 20) = (0.0588, 0.0627, 0.0784)
    expect(storyboard).toMatch(/backgroundColor" red="0\.0588" green="0\.0627" blue="0\.0784"/);
    expect(storyboard).not.toContain('systemColor="systemBackgroundColor"');
    const tokens = F('src/styles/tokens.css');
    expect(tokens).toMatch(/--sa-surface:\s*#0F1014/i);
  });
  it('the iOS asset catalog holds the 1024 icon and the three 2732 splash files the template expects', () => {
    const icon = JSON.parse(F('ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json'));
    expect(icon.images[0]).toMatchObject({ filename: 'AppIcon-512@2x.png', size: '1024x1024' });
    const splash = JSON.parse(F('ios/App/App/Assets.xcassets/Splash.imageset/Contents.json'));
    expect(splash.images.map((i: { filename: string }) => i.filename).sort()).toEqual(
      ['splash-2732x2732-1.png', 'splash-2732x2732-2.png', 'splash-2732x2732.png'],
    );
  });
});

describe('the TestFlight workflow never opens the key to a pull request', () => {
  const wf = ROOT('.github/workflows/ios-testflight.yml');
  it('triggers: push to main (frontend paths) and manual dispatch only', () => {
    expect(wf).not.toMatch(/^\s*pull_request/m);
    expect(wf).not.toContain('pull_request_target');
    expect(wf).toMatch(/on:\s*\n\s*push:\s*\n\s*branches: \[main\]/);
    expect(wf).toMatch(/^\s*workflow_dispatch:/m);
    expect(wf).toMatch(/paths:\s*\n\s*- 'apps\/frontend\/\*\*'/);
  });
  it('runs in the testflight environment on a pinned macOS 26 image with read-only token', () => {
    expect(wf).toMatch(/environment: testflight/);
    expect(wf).toMatch(/runs-on: macos-26/);
    expect(wf).not.toMatch(/runs-on:.*macos-latest/);
    expect(wf).toMatch(/permissions:\s*\n\s*contents: read/);
  });
  it('uses the three API-key secrets and no certificate or profile secret', () => {
    for (const s of ['ASC_KEY_P8', 'ASC_KEY_ID', 'ASC_ISSUER_ID']) expect(wf).toContain(`secrets.${s}`);
    expect(wf).not.toMatch(/P12|CERTIFICATE|PROVISIONING_PROFILE|KEYCHAIN_PASSWORD/);
    expect(wf).toContain('-allowProvisioningUpdates');
    expect(wf).toContain('-authenticationKeyPath');
  });
  it('the key is written under umask 077 and removed even on failure', () => {
    expect(wf).toContain('umask 077');
    expect(wf).toMatch(/if: always\(\)\s*\n\s*run: rm -rf "\$APP_STORE_CONNECT_KEY_DIR"/);
  });
  it('export options: App Store Connect upload, internal TestFlight only', () => {
    const plist = F('ios/ExportOptions.plist');
    expect(plist).toMatch(/<key>method<\/key>\s*<string>app-store-connect<\/string>/);
    expect(plist).toMatch(/<key>destination<\/key>\s*<string>upload<\/string>/);
    expect(plist).toMatch(/<key>testFlightInternalTestingOnly<\/key>\s*<true\/>/);
    expect(plist).toMatch(/<key>teamID<\/key>\s*<string>NQ23SMHXJV<\/string>/);
    expect(wf).toContain('ios/ExportOptions.plist');
  });
});

describe('the web build is untouched by the platform', () => {
  it('no server.url, and the iOS project is outside every web input', () => {
    const cfg = F('capacitor.config.ts');
    expect(cfg).not.toMatch(/server\s*:/);
    const vite = F('vite.config.ts');
    expect(vite).not.toContain('ios');
    const tsconfig = F('tsconfig.json');
    expect(tsconfig).not.toContain('ios');
  });
});
