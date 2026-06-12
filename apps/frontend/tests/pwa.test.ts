import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('PWA installability (manifest only, no service worker)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/manifest.webmanifest'), 'utf8'));
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  it('manifest has the fields required for Add to Home Screen', () => {
    expect(manifest.name).toBe('Scan & Action');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/dashboard');
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();
  });

  it('manifest declares 192/512 icons plus a maskable variant, and the files exist', () => {
    const sizes = manifest.icons.map((i: any) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((i: any) => i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      expect(fs.existsSync(path.join(ROOT, 'public', icon.src))).toBe(true);
    }
    expect(fs.existsSync(path.join(ROOT, 'public/icons/apple-touch-icon.png'))).toBe(true);
  });

  it('index.html links the manifest, theme-color, and apple-touch-icon', () => {
    expect(indexHtml).toContain('rel="manifest"');
    expect(indexHtml).toContain('name="theme-color"');
    expect(indexHtml).toContain('rel="apple-touch-icon"');
    expect(indexHtml).toContain('apple-mobile-web-app-capable');
  });

  it('deliberately ships NO service worker (live checkout — stale-cache risk)', () => {
    expect(indexHtml).not.toMatch(/serviceWorker/i);
    const mainTsx = fs.readFileSync(path.join(ROOT, 'src/main.tsx'), 'utf8');
    expect(mainTsx).not.toMatch(/serviceWorker/i);
    expect(fs.existsSync(path.join(ROOT, 'public/sw.js'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'public/service-worker.js'))).toBe(false);
  });
});
