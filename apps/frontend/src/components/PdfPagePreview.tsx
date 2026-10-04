import React, { useEffect, useRef, useState } from 'react';
import { renderPdfFirstPage } from '../lib/pdfFirstPage';

// The first page of a scanned PDF, in the receipt card, at the card's width,
// cropped to the card's height from the top: the same picture a photo gets.
// `loading` holds the frame with the skeleton; `loaded` shows the canvas; a
// failure of any kind (fetch, parse, render) is reported up so the card falls
// back to the link row it had before, which never depends on this file.
export const PdfPagePreview: React.FC<{ url: string; fileName: string; onFailed: () => void }> = ({ url, fileName, onFailed }) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'loaded'>('loading');
  const failed = useRef(onFailed);
  failed.current = onFailed;

  useEffect(() => {
    const canvas = canvasRef.current;
    const width = frameRef.current?.clientWidth || 0;
    if (!canvas || width <= 0) {
      failed.current();
      return;
    }
    const controller = new AbortController();
    setState('loading');
    renderPdfFirstPage(url, canvas, width, controller.signal)
      .then(() => { if (!controller.signal.aborted) setState('loaded'); })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.warn('[PdfPagePreview] first page not drawn:', err instanceof Error ? err.message : String(err));
        failed.current();
      });
    return () => controller.abort();
  }, [url]);

  return (
    <div ref={frameRef} className={`relative h-44 overflow-hidden ${state === 'loading' ? 'skeleton' : 'bg-surface-muted'}`} data-detail-pdf={state}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={fileName}
        className={`block ${state === 'loading' ? 'opacity-0' : ''}`}
      />
    </div>
  );
};
