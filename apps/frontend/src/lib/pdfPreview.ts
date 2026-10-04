// ============================================================================
// Whether a scanned PDF can be shown as a picture on the receipt screen.
// ============================================================================
// A multi-page scan from the iOS document scanner uploads as ONE PDF
// (ios/App/App/DocumentScannerPlugin.swift), and the detail screen drew a
// picture for image file names only, so a scanned PDF got a bare link where
// every photo got its receipt (board, Step 3). The browser's own PDF viewer in
// an <iframe> is the preview: no library, no worker, nothing downloaded twice.
//
// Where it is known to render: WKWebView on iOS (the native app, and Safari on
// an iPhone) draws a PDF in a frame natively; desktop Chrome, Edge, Firefox
// and Safari say so through `navigator.pdfViewerEnabled`. Where it is not
// (Android WebView and Chrome on Android show nothing or a download), the
// screen keeps the link row it has today. The default is the link: a frame
// that cannot render would be a grey box where a receipt should be.
// ============================================================================

export const isPdfFileName = (name: unknown): boolean => typeof name === 'string' && /\.pdf$/i.test(name);

type NavigatorLike = { pdfViewerEnabled?: boolean; userAgent?: string };

export const canInlinePdf = (nav: NavigatorLike | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean =>
  nav?.pdfViewerEnabled === true || /iPhone|iPad|iPod/.test(nav?.userAgent ?? '');

// Viewer hints the PDF.js and Chromium viewers read from the fragment; others
// ignore them. The signed URL's query string is untouched.
export const pdfPreviewSrc = (signedUrl: string): string => `${signedUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
