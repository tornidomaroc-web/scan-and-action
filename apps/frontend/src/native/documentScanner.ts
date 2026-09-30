import { Capacitor, registerPlugin } from '@capacitor/core';

// The system document scanner (design step 3, the loop): edge detection,
// perspective correction and several pages, from the platform's own scanner.
//
// THE CONTRACT. A native plugin registered as "DocumentScanner" with three
// methods: isSupported, scan, discard. iOS implements it in the app target
// (`ios/App/App/DocumentScannerPlugin.swift`, over VisionKit). Android later
// implements the same three methods over ML Kit's document scanner and adds
// 'android' to SCANNER_PLATFORMS; nothing else in the web code changes.
//
// WHAT THE CALLER GETS. One File the upload route already accepts: a JPEG for
// one page, ONE PDF for several pages (a long receipt carries its total on the
// last page, so no page is dropped). Every other outcome is named, and the
// caller keeps today's camera input for all of them: the scanner is never the
// only way to capture.

/** The upload route's limit (`documentRoutes.ts`, multer fileSize). */
export const MAX_SCAN_BYTES = 10 * 1024 * 1024;

const SCANNER_PLATFORMS: readonly string[] = ['ios'];

type ScanMimeType = 'image/jpeg' | 'application/pdf';

interface NativeScanResult {
  status: 'success' | 'cancel';
  path?: string;
  mimeType?: ScanMimeType;
  pageCount?: number;
  bytes?: number;
}

interface DocumentScannerPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  scan(options: { maxBytes: number }): Promise<NativeScanResult>;
  discard(options: { path: string }): Promise<void>;
}

const DocumentScanner = registerPlugin<DocumentScannerPlugin>('DocumentScanner');

export type ScanOutcome =
  | { kind: 'scanned'; file: File; pageCount: number }
  | { kind: 'cancelled' }
  /** No scanner here: another platform, a build without the plugin, or unsupported hardware. */
  | { kind: 'unavailable' }
  /** The scanner opened or tried to, and no file came back. `reason` is a code, never shown. */
  | { kind: 'failed'; reason: string };

/** Whether this platform has a scanner at all. Cheap and synchronous: it decides which button path runs. */
export const hasScannerPlatform = (): boolean => SCANNER_PLATFORMS.includes(Capacitor.getPlatform());

const codeOf = (err: unknown): string => {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code ? code : 'SCAN_ERROR';
};

const stamp = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/**
 * Open the system scanner and return what it produced. Never throws: every
 * failure is an outcome the caller answers with the camera input.
 */
export async function scanDocument(now: Date = new Date()): Promise<ScanOutcome> {
  if (!hasScannerPlatform()) return { kind: 'unavailable' };
  try {
    const { supported } = await DocumentScanner.isSupported();
    if (!supported) return { kind: 'unavailable' };
  } catch {
    // The plugin is not in this binary (an older build), or the bridge refused.
    return { kind: 'unavailable' };
  }

  let result: NativeScanResult;
  try {
    result = await DocumentScanner.scan({ maxBytes: MAX_SCAN_BYTES });
  } catch (err) {
    return { kind: 'failed', reason: codeOf(err) };
  }
  if (result.status === 'cancel') return { kind: 'cancelled' };
  const { path, mimeType } = result;
  if (!path || (mimeType !== 'image/jpeg' && mimeType !== 'application/pdf')) {
    return { kind: 'failed', reason: 'NO_FILE' };
  }

  try {
    const response = await fetch(Capacitor.convertFileSrc(path));
    if (!response.ok) return { kind: 'failed', reason: 'READ_FAILED' };
    const blob = await response.blob();
    if (blob.size === 0) return { kind: 'failed', reason: 'EMPTY_FILE' };
    if (blob.size > MAX_SCAN_BYTES) return { kind: 'failed', reason: 'TOO_LARGE' };
    const name = `scan-${stamp(now)}.${mimeType === 'application/pdf' ? 'pdf' : 'jpg'}`;
    const file = new File([blob], name, { type: mimeType, lastModified: now.getTime() });
    return { kind: 'scanned', file, pageCount: Math.max(1, result.pageCount ?? 1) };
  } catch {
    return { kind: 'failed', reason: 'READ_FAILED' };
  } finally {
    // The bytes are in memory now; the temporary file has no further use.
    void DocumentScanner.discard({ path }).catch(() => {});
  }
}
