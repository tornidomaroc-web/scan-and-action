import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// EVERY SHIPPED APP ICON EXISTS, AT ITS SIZE, IN ITS FORMAT.
// ============================================================================
// All of these are generated from assets/scan-action-mark.svg by
// assets/generate-android-icons.py (2026-10-12, concept A). This file fails if
// a size is missing or wrong, if the iOS 1024 can carry transparency (App Store
// Connect refuses an alpha channel in the app icon), if the Play listing icon
// leaves Google Play's specification, or if the Android monochrome layer is
// not declared.
//
// It reads the PNG headers rather than decoding pixels: an image whose colour
// type has no alpha and which has no tRNS chunk CANNOT be transparent, so the
// header is proof, not a proxy. The positive control below shows the reader
// finds alpha when alpha is there.
// ============================================================================

const FE = process.cwd(); // vitest runs with cwd = apps/frontend
const RES = join(FE, 'android', 'app', 'src', 'main', 'res');

interface Png {
  width: number;
  height: number;
  colorType: number; // 2 RGB, 6 RGBA, 0 grey, 4 grey+alpha, 3 palette
  chunks: string[];
}

function readPng(path: string): Png {
  const b = readFileSync(path);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  sig.forEach((v, i) => {
    if (b[i] !== v) throw new Error(`${path} is not a PNG`);
  });
  const chunks: string[] = [];
  let o = 8;
  while (o < b.length) {
    const len = b.readUInt32BE(o);
    chunks.push(b.toString('ascii', o + 4, o + 8));
    o += 12 + len;
  }
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25], chunks };
}

/** True when the PNG is able to hold a transparent pixel at all. */
const canBeTransparent = (p: Png) => p.colorType === 4 || p.colorType === 6 || p.chunks.includes('tRNS');

// Adaptive layers are 108dp; legacy launcher icons 48dp.
const DENSITIES: Record<string, [number, number]> = {
  mdpi: [108, 48],
  hdpi: [162, 72],
  xhdpi: [216, 96],
  xxhdpi: [324, 144],
  xxxhdpi: [432, 192],
};

const EXPECTED: Array<[string, number]> = [
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024],
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/icons/icon-maskable-512.png', 512],
  ['public/icons/apple-touch-icon.png', 180],
  ['assets/store/play-store-icon-512.png', 512],
  ...Object.entries(DENSITIES).flatMap(([d, [layer, legacy]]): Array<[string, number]> => [
    [`android/app/src/main/res/mipmap-${d}/ic_launcher_background.png`, layer],
    [`android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, layer],
    [`android/app/src/main/res/mipmap-${d}/ic_launcher_monochrome.png`, layer],
    [`android/app/src/main/res/mipmap-${d}/ic_launcher.png`, legacy],
    [`android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, legacy],
  ]),
];

describe('every shipped icon exists at its size', () => {
  it('lists 31 files: iOS 1, web 4, Play 1, Android 5 densities x 5', () => {
    expect(EXPECTED).toHaveLength(31);
  });

  it.each(EXPECTED)('%s is %ipx square', (rel, size) => {
    const p = join(FE, rel);
    expect(existsSync(p), `${rel} is missing`).toBe(true);
    const png = readPng(p);
    expect([png.width, png.height]).toEqual([size, size]);
  });
});

describe('the iOS 1024 cannot carry transparency', () => {
  const ios = readPng(join(FE, EXPECTED[0][0]));

  it('is RGB with no alpha channel and no tRNS chunk', () => {
    expect(ios.colorType).toBe(2);
    expect(ios.chunks).not.toContain('tRNS');
    expect(canBeTransparent(ios)).toBe(false);
  });

  it('is the one image the asset catalog names', () => {
    const contents = JSON.parse(
      readFileSync(join(FE, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json'), 'utf8'),
    ) as { images: Array<{ filename: string; size: string }> };
    expect(contents.images).toEqual([expect.objectContaining({ filename: 'AppIcon-512@2x.png', size: '1024x1024' })]);
  });

  it('control: the reader DOES see alpha in a layer that has it', () => {
    // The foreground is drawn on transparency. If this fails, the reader is
    // blind to alpha and the assertion above proves nothing.
    const fg = readPng(join(RES, 'mipmap-xxxhdpi', 'ic_launcher_foreground.png'));
    expect(canBeTransparent(fg)).toBe(true);
  });
});

describe('the Play listing icon meets Google Play icon specifications', () => {
  const rel = 'assets/store/play-store-icon-512.png';
  it('is 32-bit (RGBA) and at most 1024 KB', () => {
    expect(readPng(join(FE, rel)).colorType).toBe(6);
    expect(statSync(join(FE, rel)).size).toBeLessThanOrEqual(1024 * 1024);
  });
});

describe('the adaptive icon declares all three layers', () => {
  it.each(['ic_launcher.xml', 'ic_launcher_round.xml'])('%s', (f) => {
    const xml = readFileSync(join(RES, 'mipmap-anydpi-v26', f), 'utf8');
    for (const layer of ['background', 'foreground', 'monochrome']) {
      expect(xml).toContain(`<${layer} android:drawable="@mipmap/ic_launcher_${layer}"/>`);
    }
  });
});

describe('the web manifest names the shipped icons at their sizes', () => {
  const manifest = JSON.parse(readFileSync(join(FE, 'public', 'manifest.webmanifest'), 'utf8')) as {
    icons: Array<{ src: string; sizes: string; purpose: string }>;
  };
  it('192 and 512 for any, 512 for maskable, each file at its stated size', () => {
    expect(manifest.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
    for (const i of manifest.icons) {
      const png = readPng(join(FE, 'public', i.src));
      expect(`${png.width}x${png.height}`).toBe(i.sizes);
    }
  });
});
