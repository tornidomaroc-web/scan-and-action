// A scanned PDF (several pages become one, ios/App/App/DocumentScannerPlugin
// .swift) gets a picture in the receipt card like a photo does. The picture is
// drawn by lib/pdfFirstPage.ts; this is only the file-name gate the card reads.
export const isPdfFileName = (name: unknown): boolean => typeof name === 'string' && /\.pdf$/i.test(name);
