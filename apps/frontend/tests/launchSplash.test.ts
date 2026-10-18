import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// ============================================================================
// The launch screen and the splash (2026-10-15). The approved mark is 42% of
// the screen width on #0F1014 (2026-09-27; concept A since #307).
//
// iOS: LaunchScreen.storyboard drew the square 2732 splash with
// scaleAspectFill, which scales the square to the screen's HEIGHT, so on a
// 390 x 844 phone the mark spanned about 96% of the width (#323). aspect-fit
// scales it to the WIDTH. The same storyboard is the Capacitor splash's view
// (SplashScreen.swift builds it from UILaunchStoryboardName), so one attribute
// fixes both. ios-audit.yml's launch-geometry job renders it and measures.
//
// Android: from API 31 the system draws the launch from
// windowSplashScreenBackground and windowSplashScreenAnimatedIcon and ignores
// android:background, so API 31+ showed the system default background and the
// launcher icon. values-v31 sets both; values/ is untouched, so API 30 and
// below keep today's splash exactly.
// ============================================================================

const APP = join(__dirname, '..');
const F = (rel: string) => readFileSync(join(APP, rel), 'utf8');
const RES = 'android/app/src/main/res';

describe('iOS: the launch image fits the width', () => {
  const sb = F('ios/App/App/Base.lproj/LaunchScreen.storyboard');

  it('draws the Splash image aspect-fit, not aspect-fill', () => {
    expect(sb).toMatch(/<imageView key="view"[^>]*contentMode="scaleAspectFit"[^>]*image="Splash"/);
    expect(sb).not.toContain('scaleAspectFill');
  });

  it('the image view keeps the #0F1014 background that fills the letterbox above and below', () => {
    expect(sb).toContain('<color key="backgroundColor" red="0.0588" green="0.0627" blue="0.0784" alpha="1"');
  });

  it("aspect-fit puts the mark at 42% of a portrait phone's width; aspect-fill put it near 96% (control)", () => {
    const script = F('assets/generate-android-icons.py');
    const scale = Number(script.match(/^SPLASH_MASTER_SCALE = ([\d.]+)/m)![1]);
    const ink = Number(script.match(/^MASTER_INK_W = ([\d.]+)/m)![1]);
    const inkShare = (scale * ink) / 512; // the mark's share of the square image
    for (const [w, h] of [[375, 667], [390, 844], [440, 956]]) {
      const fit = (inkShare * Math.min(w, h)) / w; // the square scales to the width
      const fill = (inkShare * Math.max(w, h)) / w; // the square scales to the height
      expect(fit).toBeGreaterThan(0.40);
      expect(fit).toBeLessThan(0.44);
      expect(fill).toBeGreaterThan(0.74);
    }
  });
});

describe('Android: API 31+ gets the dark splash, API 30 and below keep theirs', () => {
  it('values/styles.xml is exactly as it was before this change (older Androids)', () => {
    const base = F(`${RES}/values/styles.xml`);
    expect(createHash('sha256').update(base).digest('hex')).toBe('18ebba36575e9461347ee67361b23caf095f158ee85dbefe1b83a4669ba5bd6c');
    expect(base).not.toContain('windowSplashScreen');
  });

  it('values-v31 keeps the launch theme, on #0F1014, with the flat mark as its icon', () => {
    const v31 = F(`${RES}/values-v31/styles.xml`);
    expect(v31).toMatch(/<style name="AppTheme\.NoActionBarLaunch" parent="Theme\.SplashScreen">/);
    expect(v31).toContain('<item name="android:background">@drawable/splash</item>');
    expect(v31).toContain('<item name="windowSplashScreenBackground">#0F1014</item>');
    expect(v31).toContain('<item name="windowSplashScreenAnimatedIcon">@drawable/splash_icon</item>');
  });

  it('the icon exists at every density, 288dp square, as the platform expects', () => {
    const k: Record<string, number> = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
    for (const [dens, f] of Object.entries(k)) {
      const p = join(APP, RES, `drawable-${dens}`, 'splash_icon.png');
      expect(existsSync(p), p).toBe(true);
      const png = readFileSync(p);
      expect(png.readUInt32BE(16)).toBe(Math.round(288 * f)); // IHDR width
      expect(png.readUInt32BE(20)).toBe(Math.round(288 * f)); // IHDR height
    }
  });

  it('the icon is the flat mark, sized inside the 192dp mask circle', () => {
    const script = F('assets/generate-android-icons.py');
    expect(script).toMatch(/icon = compose\(MONO_ONLY, W, W, sc/); // no shadow: no baked-in depth
    const inkDp = Number(script.match(/^ANDROID12_INK_DP = ([\d.]+)/m)![1]);
    expect(inkDp * Math.SQRT2).toBeLessThanOrEqual(192); // the square's corners stay inside the circle
  });
});
