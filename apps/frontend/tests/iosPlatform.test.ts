import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, sep } from 'node:path';

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
  // Automatic signing archives for DEVELOPMENT and re-signs for distribution at
  // export; Xcode 26 refuses a distribution identity on an automatically signed
  // target ("conflicting provisioning settings", run 36355938894, after #261).
  // So the archive needs an App Development profile, which needs one device
  // registered on the team (run 36355312731: "no devices"). No identity
  // override belongs in the target.
  it('the App target names no distribution identity (automatic signing picks development)', () => {
    expect(pbx).not.toContain('Apple Distribution');
    expect(pbx).not.toMatch(/"CODE_SIGN_IDENTITY\[sdk=iphoneos\*\]"/);
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

// ----------------------------------------------------------------------------
// Purpose strings and the privacy manifest (2026-09-28). Build 4 was rejected
// in processing with ITMS-90683 (missing NSPhotoLibraryUsageDescription): Apple
// scans the linked code, not what the app calls, so every key a linked plugin
// can reach must be present. The keys are DERIVED here from the native sources
// of the plugins Package.swift links, so a plugin added or upgraded later that
// reaches a new API fails this test before Apple does.
// ----------------------------------------------------------------------------
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.swift') && !p.includes(`${sep}Tests${sep}`) ? [p] : [];
  });

// The provider map capacitor.config.ts hands the social-login plugin. Its
// capacitor:sync:before hook comments the Facebook package out of the plugin's
// Package.swift when facebook is false (2026-09-29), so the FBSDKLoginKit
// module does not exist at compile time and every `#if canImport(FBSDKLoginKit)`
// region is dead. The audit below must read the source the compiler reads.
const socialLoginProviders = (): Record<string, boolean> => {
  const cfg = F('capacitor.config.ts');
  const m = cfg.match(/SocialLogin:\s*\{\s*providers:\s*\{([^}]*)\}/);
  if (!m) return {};
  const out: Record<string, boolean> = {};
  for (const kv of m[1].matchAll(/(\w+):\s*(true|false)/g)) out[kv[1]] = kv[2] === 'true';
  return out;
};

// Drops every line inside a `#if canImport(FBSDKLoginKit)` region (keeping its
// `#else` branch, the stub the compiler builds without Facebook). Nested
// regions inherit the suppression. Any other `#if` is kept whole.
const withoutFacebookRegions = (src: string): string => {
  const stack: Array<{ facebook: boolean; suppress: boolean }> = [];
  const out: string[] = [];
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (/^#if\b/.test(t)) {
      const facebook = /canImport\(FBSDKLoginKit\)/.test(t);
      stack.push({ facebook, suppress: facebook });
      continue;
    }
    if (/^#else\b/.test(t) && stack.length) {
      const top = stack[stack.length - 1];
      if (top.facebook) top.suppress = false;
      continue;
    }
    if (/^#endif\b/.test(t) && stack.length) {
      stack.pop();
      continue;
    }
    if (!stack.some((f) => f.suppress)) out.push(line);
  }
  return out.join('\n');
};

const linkedPluginSources = (opts: { raw?: boolean } = {}): Record<string, string> => {
  const pkg = F('ios/App/CapApp-SPM/Package.swift');
  const facebookOff = socialLoginProviders().facebook === false;
  const out: Record<string, string> = {};
  for (const m of pkg.matchAll(/path: "\.\.\/\.\.\/\.\.\/node_modules\/([^"]+)"/g)) {
    const iosDir = join(__dirname, '..', 'node_modules', m[1], 'ios');
    if (!existsSync(iosDir)) continue;
    const text = walk(iosDir).map((f) => readFileSync(f, 'utf8')).join('\n');
    out[m[1]] = facebookOff && !opts.raw ? withoutFacebookRegions(text) : text;
  }
  return out;
};

// API symbol in native code -> Info.plist key iOS requires for it.
const PURPOSE_STRING_MARKERS: Array<[RegExp, string]> = [
  [/AVCaptureDevice/, 'NSCameraUsageDescription'],
  [/PHPhotoLibrary|PHPickerViewController|PHAsset\b/, 'NSPhotoLibraryUsageDescription'],
  [/UIImageWriteToSavedPhotosAlbum|PHAssetChangeRequest/, 'NSPhotoLibraryAddUsageDescription'],
  [/recordVideo|AVAudioSession|AVMediaType\.audio/, 'NSMicrophoneUsageDescription'],
  [/ATTrackingManager/, 'NSUserTrackingUsageDescription'],
  [/CLLocationManager/, 'NSLocationWhenInUseUsageDescription'],
  [/CNContactStore/, 'NSContactsUsageDescription'],
  [/LAContext/, 'NSFaceIDUsageDescription'],
  [/EKEventStore/, 'NSCalendarsUsageDescription'],
  [/CBCentralManager|CBPeripheralManager/, 'NSBluetoothAlwaysUsageDescription'],
  [/SFSpeechRecognizer/, 'NSSpeechRecognitionUsageDescription'],
];

// Required reason API in native code -> privacy manifest category.
const REQUIRED_REASON_MARKERS: Array<[RegExp, string]> = [
  [/UserDefaults/, 'NSPrivacyAccessedAPICategoryUserDefaults'],
  [/\.modificationDate|\.creationDate|fileModificationDate|\bstat\(|\bfstat\(/, 'NSPrivacyAccessedAPICategoryFileTimestamp'],
  [/systemUptime|mach_absolute_time/, 'NSPrivacyAccessedAPICategorySystemBootTime'],
  [/volumeAvailableCapacity|NSFileSystemFreeSize/, 'NSPrivacyAccessedAPICategoryDiskSpace'],
  [/activeInputModes/, 'NSPrivacyAccessedAPICategoryActiveKeyboards'],
];

describe('purpose strings: every key a linked plugin can reach is present, non-empty, in every language', () => {
  const sources = linkedPluginSources();
  const required = new Map<string, string[]>(); // key -> plugins that reference it
  for (const [plugin, src] of Object.entries(sources)) {
    for (const [re, key] of PURPOSE_STRING_MARKERS) {
      if (re.test(src)) required.set(key, [...(required.get(key) ?? []), plugin]);
    }
  }
  const plist = F('ios/App/App/Info.plist');
  const LANGS = ['en', 'fr', 'ar'];

  it('reads the plugin sources it audits (positive control)', () => {
    expect(Object.keys(sources).sort()).toEqual(
      ['@capacitor/app', '@capacitor/camera', '@capacitor/splash-screen', '@capacitor/status-bar', '@capgo/capacitor-social-login'],
    );
    expect(required.get('NSCameraUsageDescription')).toEqual(['@capacitor/camera']);
    // The tracking call exists in the plugin's text and is compiled out: the
    // raw source names ATTrackingManager (so the stripper, not a missing
    // file, is what removes it), the compiled source does not.
    const raw = linkedPluginSources({ raw: true })['@capgo/capacitor-social-login'];
    expect(raw).toMatch(/ATTrackingManager/);
    expect(sources['@capgo/capacitor-social-login']).not.toMatch(/ATTrackingManager/);
    expect(required.get('NSUserTrackingUsageDescription')).toBeUndefined();
  });

  it('the derived set is exactly the four keys audited on 2026-09-29 (tracking gone with the Facebook provider); a change here is a plugin change to re-audit', () => {
    expect([...required.keys()].sort()).toEqual([
      'NSCameraUsageDescription',
      'NSMicrophoneUsageDescription',
      'NSPhotoLibraryAddUsageDescription',
      'NSPhotoLibraryUsageDescription',
    ]);
  });

  for (const key of [...required.keys()].sort()) {
    it(`${key} is in Info.plist with a non-empty string (App Store Connect reads only this file)`, () => {
      const m = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
      expect(m, `${key} required by ${required.get(key)?.join(', ')}`).not.toBeNull();
      expect(m![1].trim().length).toBeGreaterThan(20);
    });
    for (const lang of LANGS) {
      it(`${key} is localized in ${lang}.lproj/InfoPlist.strings`, () => {
        const strings = F(`ios/App/App/${lang}.lproj/InfoPlist.strings`);
        const m = strings.match(new RegExp(`^"${key}" = "([^"]+)";$`, 'm'));
        expect(m).not.toBeNull();
        expect(m![1].trim().length).toBeGreaterThan(20);
      });
    }
  }

  it('the copy names the brand, uses Western digits only and contains no dash', () => {
    for (const lang of LANGS) {
      const strings = F(`ios/App/App/${lang}.lproj/InfoPlist.strings`);
      for (const m of strings.matchAll(/^"NS\w+" = "([^"]+)";$/gm)) {
        expect(m[1]).toContain('Scan & Action');
        expect(m[1]).not.toMatch(/[-–—٠-٩۰-۹]/);
      }
    }
  });

  it('Info.plist is the English copy, byte for byte with en.lproj (the fallback iOS shows for other languages)', () => {
    const en = F('ios/App/App/en.lproj/InfoPlist.strings');
    for (const key of required.keys()) {
      const fromPlist = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`))![1].replace(/&amp;/g, '&');
      const fromStrings = en.match(new RegExp(`^"${key}" = "([^"]+)";$`, 'm'))![1];
      expect(fromPlist).toBe(fromStrings);
    }
  });

  it('the three .lproj files are one variant group in the App target, and fr and ar are known regions', () => {
    const pbx = F('ios/App/App.xcodeproj/project.pbxproj');
    expect(pbx).toMatch(/isa = PBXVariantGroup;\s*children = \(\s*\w+ \/\* en \*\/,\s*\w+ \/\* fr \*\/,\s*\w+ \/\* ar \*\/,\s*\);\s*name = InfoPlist\.strings;/);
    expect(pbx).toMatch(/InfoPlist\.strings in Resources \*\/ = \{isa = PBXBuildFile;/);
    expect(pbx).toMatch(/knownRegions = \(\s*en,\s*Base,\s*fr,\s*ar,\s*\);/);
    for (const lang of LANGS) expect(pbx).toContain(`path = ${lang}.lproj/InfoPlist.strings;`);
  });
});

describe('privacy manifest: required reason APIs in plugins that ship no manifest are declared by the app', () => {
  const sources = linkedPluginSources();
  const categories = new Map<string, string[]>();
  for (const [plugin, src] of Object.entries(sources)) {
    const hasOwnManifest = existsSync(join(__dirname, '..', 'node_modules', plugin, 'ios', 'PrivacyInfo.xcprivacy'));
    if (hasOwnManifest) continue;
    for (const [re, cat] of REQUIRED_REASON_MARKERS) {
      if (re.test(src)) categories.set(cat, [...(categories.get(cat) ?? []), plugin]);
    }
  }
  const manifestPath = join(__dirname, '..', 'ios/App/App/PrivacyInfo.xcprivacy');

  it('the derived set is exactly UserDefaults, from the social login plugin (audit 2026-09-28)', () => {
    expect([...categories.entries()]).toEqual([['NSPrivacyAccessedAPICategoryUserDefaults', ['@capgo/capacitor-social-login']]]);
  });

  it('PrivacyInfo.xcprivacy exists, is in the App target resources, declares no tracking and each derived category with a reason', () => {
    expect(existsSync(manifestPath)).toBe(true);
    const m = readFileSync(manifestPath, 'utf8');
    expect(m).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    for (const cat of categories.keys()) {
      expect(m).toMatch(new RegExp(`<string>${cat}</string>\\s*<key>NSPrivacyAccessedAPITypeReasons</key>\\s*<array>\\s*<string>[A-Z0-9]{4}\\.\\d</string>`));
    }
    const pbx = F('ios/App/App.xcodeproj/project.pbxproj');
    expect(pbx).toMatch(/PrivacyInfo\.xcprivacy in Resources \*\/ = \{isa = PBXBuildFile;/);
    expect(pbx).toMatch(/files = \((?:[^)]*)PrivacyInfo\.xcprivacy in Resources/);
  });
});

// ----------------------------------------------------------------------------
// The pipeline's three hardening rules (2026-09-28), pinned on the workflow
// file itself. Read as YAML, not as text, so a step moved between jobs is seen.
// ----------------------------------------------------------------------------
type Step = { name?: string; uses?: string; run?: string; if?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Job = { 'runs-on': string; environment?: string; needs?: string | string[]; steps: Step[] };
type Workflow = { jobs: Record<string, Job> };

const loadWorkflow = (): Workflow => {
  const { load } = createRequire(import.meta.url)('js-yaml') as { load: (s: string) => unknown };
  return load(ROOT('.github/workflows/ios-testflight.yml')) as Workflow;
};
const stepText = (s: Step) => [s.run ?? '', s.uses ?? '', JSON.stringify(s.env ?? {}), JSON.stringify(s.with ?? {})].join('\n');

describe('1. the Admin key is never on a runner that has run npm', () => {
  const wf = loadWorkflow();
  const jobs = Object.entries(wf.jobs);
  const signing = jobs.filter(([, j]) => j.environment === 'testflight');
  const others = jobs.filter(([, j]) => j.environment !== 'testflight');

  it('exactly one job deploys to the testflight environment, and it needs a job that does not', () => {
    expect(signing.map(([k]) => k)).toEqual(['testflight']);
    expect(others.length).toBeGreaterThan(0);
    const needs = ([] as string[]).concat(signing[0][1].needs ?? []);
    expect(needs).toEqual(['web']);
    for (const [, j] of others) expect(j.environment).toBeUndefined();
  });

  it('the signing job runs no npm, npx or node, installs nothing and checks nothing out', () => {
    const steps = signing[0][1].steps;
    for (const s of steps) {
      expect(s.uses ?? '').not.toMatch(/actions\/(checkout|setup-node)/);
      expect(s.run ?? '').not.toMatch(/(^|[\s;|&(])(npm|npx|node|corepack|yarn|pnpm)\b/);
    }
    // the only actions it uses are GitHub's artifact download and upload, and every one runs BEFORE the key exists
    const uses = steps.map((s) => s.uses).filter(Boolean) as string[];
    expect(uses.map((u) => u.split('@')[0])).toEqual(['actions/download-artifact', 'actions/upload-artifact']);
    const iDownload = steps.findIndex((s) => s.uses?.startsWith('actions/download-artifact'));
    const iKey = steps.findIndex((s) => s.name === 'Place the App Store Connect key');
    const iRemove = steps.findIndex((s) => s.name === 'Remove the key');
    expect(iDownload).toBeGreaterThanOrEqual(0);
    expect(iKey).toBeGreaterThan(iDownload);
    for (const [i, s] of steps.entries()) if (s.uses) expect(i, s.uses).toBeLessThan(iKey);
    expect(iRemove).toBe(steps.length - 1);
    expect(steps[iRemove].if).toBe('always()');
    // between placing and removing the key, only xcodebuild runs
    for (const s of steps.slice(iKey + 1, iRemove)) {
      expect(s.uses).toBeUndefined();
      expect(s.run).toMatch(/xcodebuild/);
    }
  });

  it('packages are resolved, fetched and gated for plugins and macros BEFORE the key exists; the archive may not resolve', () => {
    const steps = signing[0][1].steps;
    const iKey = steps.findIndex((s) => s.name === 'Place the App Store Connect key');
    const iResolve = steps.findIndex((s) => /-resolvePackageDependencies/.test(s.run ?? ''));
    const iGate = steps.findIndex((s) => /\\\.plugin\\\(\|plugins:\|\\\.macro\\\(/.test(s.run ?? ''));
    const iArchive = steps.findIndex((s) => s.name === 'Archive (automatic signing with the API key)');
    expect(iResolve).toBeGreaterThanOrEqual(0);
    expect(iGate).toBeGreaterThan(iResolve);
    expect(iKey).toBeGreaterThan(iGate);
    expect(iArchive).toBeGreaterThan(iKey);
    // the resolve step and the archive share the clone directory, and the resolve step proves Package.resolved was written
    expect(steps[iResolve].run).toContain('-clonedSourcePackagesDirPath "$RUNNER_TEMP/spm"');
    expect(steps[iResolve].run).toMatch(/test -f .*swiftpm\/Package\.resolved/);
    // the gate fails the job on a hit, and never reads a secret
    expect(steps[iGate].run).toMatch(/test -z "\$found" \|\| \{[^}]*exit 1; \}/);
    expect(stepText(steps[iGate])).not.toMatch(/ASC_|APP_STORE_CONNECT/);
    // the archive cannot fetch or re-resolve
    for (const flag of ['-clonedSourcePackagesDirPath "$RUNNER_TEMP/spm"', '-disableAutomaticPackageResolution', '-onlyUsePackageVersionsFromResolvedFile']) {
      expect(steps[iArchive].run).toContain(flag);
    }
    // xcodebuild's own refusal of unvalidated plugins and macros is never switched off (the steps, not the comments)
    for (const s of steps) expect(s.run ?? '', s.name).not.toMatch(/-skip(PackagePlugin|Macro)Validation/);
  });

  it('the ASC secrets are referenced in the signing job only; the web job sees no environment secret', () => {
    for (const [name, j] of others) {
      for (const s of j.steps) expect(stepText(s), `${name}: ${s.name ?? s.uses}`).not.toMatch(/ASC_|APP_STORE_CONNECT/);
    }
    const signingText = signing[0][1].steps.map(stepText).join('\n');
    for (const secret of ['ASC_KEY_P8', 'ASC_KEY_ID', 'ASC_ISSUER_ID']) expect(signingText).toContain(`secrets.${secret}`);
  });

  it('the web job hands over the synced iOS project and exactly the five plugin packages Package.swift points at', () => {
    const web = wf.jobs.web;
    const upload = web.steps.find((s) => s.uses?.startsWith('actions/upload-artifact'));
    expect(upload).toBeDefined();
    const paths = String(upload!.with!.path).trim().split('\n').map((p) => p.trim());
    const pkg = F('ios/App/CapApp-SPM/Package.swift');
    const plugins = [...pkg.matchAll(/path: "\.\.\/\.\.\/\.\.\/node_modules\/([^"]+)"/g)].map((m) => `apps/frontend/node_modules/${m[1]}`);
    expect(paths).toEqual(['apps/frontend/ios', ...plugins]);
    expect(upload!.with!['if-no-files-found']).toBe('error');
    const sync = web.steps.findIndex((s) => /cap sync ios/.test(s.run ?? ''));
    expect(sync).toBeGreaterThanOrEqual(0);
    expect(web.steps.indexOf(upload!)).toBeGreaterThan(sync);
    // and the signing job proves that state on its runner before the key is placed
    const proof = wf.jobs.testflight.steps.find((s) => s.name === 'Only the iOS project is on this runner');
    expect(proof?.run).toMatch(/test ! -e package\.json/);
    expect(proof?.run).toMatch(/test ! -e node_modules\/\.bin/);
  });
});

describe('2. every action is pinned to a full commit SHA, with the release as a comment', () => {
  const text = ROOT('.github/workflows/ios-testflight.yml') + ROOT('.github/workflows/ios-audit.yml');
  const uses = [...text.matchAll(/^\s*-?\s*uses:\s*(.+)$/gm)].map((m) => m[1].trim());
  it('the two iOS workflows use at least six actions between them (positive control)', () => {
    expect(uses.length).toBeGreaterThanOrEqual(6);
  });
  for (const u of uses) {
    it(`${u.split('@')[0]} is pinned`, () => {
      expect(u).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    });
  }
  it('Dependabot watches github-actions, so a pin moves only by pull request', () => {
    const d = ROOT('.github/dependabot.yml');
    expect(d).toMatch(/package-ecosystem: github-actions/);
    expect(d).toMatch(/directory: \//);
  });
});

describe('3. a failing xcodebuild fails its step directly', () => {
  const wf = loadWorkflow();
  // the build invocations are the multi-line `xcodebuild \` ones; `xcodebuild -version` is not one
  const xcodeSteps = wf.jobs.testflight.steps.filter((s) => /^\s*xcodebuild \\$/m.test(s.run ?? ''));
  it('finds the resolve, archive and export steps (positive control)', () => {
    expect(xcodeSteps.map((s) => s.name)).toEqual([
      'Resolve Swift packages (no key on this runner yet)',
      'Archive (automatic signing with the API key)',
      'Export and upload to App Store Connect',
    ]);
  });
  for (const s of xcodeSteps) {
    it(`${s.name}: pipefail is on, the filter is wrapped so its status cannot mask xcodebuild's, stderr is captured`, () => {
      const run = s.run!;
      expect(run).toMatch(/^set -eu -o pipefail$/m);
      // the pipeline: xcodebuild ... 2>&1 | tee <log> | { grep -E '<filter>' || true; }
      expect(run).toMatch(/2>&1 \| tee "\$RUNNER_TEMP\/\w+\.log" \| \{ grep -E (-i )?'[^']+' \|\| true; \}$/m);
      // never the unwrapped form, whose `|| true` swallows the whole pipeline
      expect(run).not.toMatch(/\| grep -E[^{]*\|\| true$/m);
      // the #261 filter survives
      expect(run).toContain(': (error|warning):');
    });
  }
});

// ----------------------------------------------------------------------------
// The Facebook SDK is out of the binary (2026-09-29): the provider map, the
// import guard, the audit that reads the linked binary on a PR, and the same
// audit on the archive before an upload. The reading itself (otool -L) is the
// macOS job's; what a PR can silently undo is pinned here.
// ----------------------------------------------------------------------------
describe('the Facebook provider is off, and the AppTrackingTransparency import is guarded', () => {
  it('capacitor.config.ts hands the plugin google and apple on, facebook and twitter off', () => {
    expect(socialLoginProviders()).toEqual({ google: true, apple: true, facebook: false, twitter: false });
  });
  it('the patch guards the import behind canImport(FBSDKLoginKit), and postinstall applies it', () => {
    const patch = F('patches/@capgo+capacitor-social-login+8.5.11.patch');
    expect(patch).toContain('-#if canImport(AppTrackingTransparency)');
    expect(patch).toContain('+#if canImport(FBSDKLoginKit) && canImport(AppTrackingTransparency)');
    expect(patch.match(/^\+\+\+ /gm)).toHaveLength(1); // one file, the provider; never the manifest the sync hook owns
    const pkg = JSON.parse(F('package.json'));
    expect(pkg.scripts.postinstall).toBe('patch-package');
    expect(pkg.devDependencies['patch-package']).toBeDefined();
    const installed = readFileSync(join(__dirname, '..', 'node_modules/@capgo/capacitor-social-login/ios/Sources/SocialLoginPlugin/FacebookProvider.swift'), 'utf8');
    expect(installed).toContain('#if canImport(FBSDKLoginKit) && canImport(AppTrackingTransparency)');
    expect(installed).not.toMatch(/^#if canImport\(AppTrackingTransparency\)$/m);
  });
  it('the stripper keeps the #else stub and drops the guarded body (control on a synthetic source)', () => {
    const src = ['a', '#if canImport(FBSDKLoginKit)', 'FB', '#if canImport(AppTrackingTransparency)', 'ATT', '#endif', '#else', 'STUB', '#endif', '#if os(iOS)', 'IOS', '#endif', 'z'].join('\n');
    expect(withoutFacebookRegions(src).split('\n')).toEqual(['a', 'STUB', 'IOS', 'z']);
  });
});

describe('the binary audit runs on a pull request without secrets, and on the archive', () => {
  const text = ROOT('.github/workflows/ios-audit.yml');
  const wf = (() => {
    const { load } = createRequire(import.meta.url)('js-yaml') as { load: (s: string) => unknown };
    return load(text) as Workflow & { on: Record<string, unknown>; permissions: Record<string, string> };
  })();
  it('triggers on pull_request restricted to the paths that change what Xcode links, plus manual dispatch', () => {
    const pr = wf.on.pull_request as { branches: string[]; paths: string[] };
    expect(pr.branches).toEqual(['main']);
    expect(pr.paths).toEqual([
      'apps/frontend/ios/**',
      'apps/frontend/capacitor.config.ts',
      'apps/frontend/patches/**',
      'apps/frontend/package.json',
      'apps/frontend/package-lock.json',
      '.github/workflows/ios-audit.yml',
    ]);
    expect(wf.on.workflow_dispatch).toBeDefined();
    expect(text).not.toContain('pull_request_target');
    expect(wf.permissions).toEqual({ contents: 'read' });
  });
  it('one macOS job, no environment, no secret reference, no signing', () => {
    expect(Object.keys(wf.jobs)).toEqual(['audit']);
    const job = wf.jobs.audit;
    expect(job['runs-on']).toBe('macos-26');
    expect(job.environment).toBeUndefined();
    expect(text).not.toMatch(/secrets\./);
    for (const step of job.steps) expect(stepText(step), step.name).not.toMatch(/ASC_|APP_STORE_CONNECT|authenticationKey|allowProvisioningUpdates|archive/);
    const build = job.steps.find((s) => s.name === 'Build for the iOS Simulator (unsigned)');
    expect(build?.run).toContain('CODE_SIGNING_ALLOWED=NO');
    expect(build?.run).toContain("-destination 'generic/platform=iOS Simulator'");
  });
  it('the audit reads otool -L with UIKit as the positive control, and fails on tracking or Facebook by an explicit if', () => {
    const audit = wf.jobs.audit.steps.find((s) => s.name === 'Audit the binary');
    expect(audit?.run).toMatch(/otool -L "\$bin"/);
    expect(audit?.run).toMatch(/grep -q 'UIKit\.framework' .* \|\| \{ [^}]*exit 1; \}/);
    expect(audit?.run).toMatch(/if grep -iqE 'AppTrackingTransparency\|FBSDK\|Facebook' [^\n]*; then\n[^\n]*exit 1\n\s*fi/);
    // never the negated form, which set -e ignores
    expect(audit?.run).not.toMatch(/^\s*! /m);
  });
  it('the archive step in ios-testflight.yml takes the same reading before the export', () => {
    const tf = loadWorkflow();
    const archive = tf.jobs.testflight.steps.find((s) => s.name === 'Archive (automatic signing with the API key)');
    expect(archive?.run).toMatch(/otool -L "\$bin"/);
    expect(archive?.run).toMatch(/grep -q "UIKit\.framework"/);
    expect(archive?.run).toMatch(/if grep -iqE "AppTrackingTransparency\|FBSDK\|Facebook" [^\n]*; then [^\n]*exit 1; fi/);
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
