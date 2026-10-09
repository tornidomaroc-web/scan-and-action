import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The Android App Link for the confirmation and reset emails (design step 5).
// One filter, verified, https only, one host, one exact path: the same scope
// the iOS AASA file claims, so no other page of the site opens the app.

const manifest = readFileSync(join(process.cwd(), 'android/app/src/main/AndroidManifest.xml'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '');

describe('AndroidManifest App Link', () => {
  const filters = [...manifest.matchAll(/<intent-filter([^>]*)>([\s\S]*?)<\/intent-filter>/g)];
  const view = filters.filter((f) => f[2].includes('android.intent.action.VIEW'));

  it('exactly one VIEW filter, autoVerify, BROWSABLE and DEFAULT', () => {
    expect(view).toHaveLength(1);
    expect(view[0][1]).toContain('android:autoVerify="true"');
    expect(view[0][2]).toContain('android.intent.category.BROWSABLE');
    expect(view[0][2]).toContain('android.intent.category.DEFAULT');
  });

  it('https://www.scan-action.com/auth/confirm and nothing wider', () => {
    const data = [...view[0][2].matchAll(/<data([^>]*)\/>/g)].map((d) => d[1]);
    expect(data).toHaveLength(1);
    expect(data[0]).toContain('android:scheme="https"');
    expect(data[0]).toContain('android:host="www.scan-action.com"');
    expect(data[0]).toContain('android:path="/auth/confirm"');
    expect(data[0]).not.toMatch(/pathPrefix|pathPattern|host="\*/);
  });

  it('the launcher filter is untouched', () => {
    expect(manifest).toMatch(/<action android:name="android.intent.action.MAIN" \/>\s*<category android:name="android.intent.category.LAUNCHER" \/>/);
  });
});
