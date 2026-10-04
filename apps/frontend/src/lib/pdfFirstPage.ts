// ============================================================================
// Page 1 of a PDF, drawn into a canvas fitted to a width.
// ============================================================================
// The receipt card first showed a scanned PDF through the WebKit PDF plugin
// in an <iframe>. On the owner's iPhone (build 15, 2026-10-04) that plugin
// drew the page at its own zoom, so the card held a fragment: giant letters
// "Walm", or a blank strip of paper. A frame cannot be told how to fit, and
// nothing on the web side can read what it drew.
//
// pdf.js draws the page itself, to the width the card has, on every platform
// alike, and a failure is an exception this side can catch. It is loaded on
// first use (dynamic import), so the main bundle carries none of it, and the
// worker rides along as a bundled asset (`?url`). The PDF bytes are fetched
// once here rather than streamed by pdf.js: the signed storage URL allows a
// plain cross-origin GET (the <img> next to it does the same), and range
// requests would be a second kind of request to reason about.
// ============================================================================

export interface RenderedPdfPage {
  pages: number;
  /** CSS pixels the canvas was sized to. */
  cssWidth: number;
  cssHeight: number;
}

export async function renderPdfFirstPage(
  url: string,
  canvas: HTMLCanvasElement,
  cssWidth: number,
  signal?: AbortSignal
): Promise<RenderedPdfPage> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`pdf fetch ${res.status}`);
  const data = new Uint8Array(await res.arrayBuffer());
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    // Device pixels for a crisp picture, capped so a 3x phone does not draw a
    // 3000 px wide bitmap for a 358 px card.
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const cssHeight = Math.ceil(viewport.height / dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) throw new Error('no 2d context');
    await page.render({ canvasContext, viewport, canvas }).promise;
    return { pages: doc.numPages, cssWidth, cssHeight };
  } finally {
    await task.destroy();
  }
}
