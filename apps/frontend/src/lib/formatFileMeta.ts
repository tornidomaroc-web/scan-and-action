// ============================================================================
// Localised, dir-safe file-meta line ("0.00 MB • PDF") for the upload surfaces.
// ============================================================================
// Shared by UploadModal and CaptureSheet, which each rendered a BYTE-IDENTICAL
// inline expression — and both were broken in Arabic:
//
//   `${(size / 1024 / 1024).toFixed(2)} MB • ${type.split('/')[1]?.toUpperCase() || 'FILE'}`
//
// Two defects, not just duplication:
//   (a) Unlocalised — "MB" and the "FILE" fallback were hardcoded English, and
//       `.toFixed(2)` never followed the locale's decimal separator (fr wants a
//       comma: "0,00").
//   (b) NOT dir-safe — the string mixes European digits, Latin unit/type and a
//       neutral bullet, and it was rendered in a <p> with NO `dir`. In the Arabic
//       document (LanguageContext.tsx:19 sets documentElement.dir='rtl') that
//       paragraph inherited RTL, so the all-Latin runs bidi-reordered to
//       "MB • PDF 0.00" — the size displaced to the end.
//
// This helper owns fix (a): the unit and the fallback come from i18n
// (fileSizeMb / fileTypeUnknown) and the number is locale-formatted. The
// extension token stays Latin upper-case (PDF/PNG/JPG) — a format acronym, not
// translatable.
//
// The CALL SITES own fix (b): each renders the result in a `dir="auto"` <p>.
// Both parts are required and neither suffices alone —
//   * dir="auto" over the OLD all-Latin string still had no strong RTL character,
//     so `auto` would resolve the paragraph LTR and the reorder would persist;
//   * the localised string in a dir-LESS <p> would still inherit the document's
//     RTL base.
// Together, the localised Arabic unit ("ميغابايت") is the paragraph's first STRONG
// character, so dir="auto" resolves it RTL and the runs order correctly; en/fr
// have a Latin first strong char and resolve LTR. (This mirrors the fix #101
// already applied to the *filename* <p> in CaptureSheet.tsx:224.)
//
// NUMBER — deliberately NOT formatCount() (lib/formatNumber.ts): that formatter
// is integer-only (no fraction digits), so a 1.23 MB file would collapse to "1".
// A 2-decimal Intl formatter is used instead, following the same bare-subtag
// convention formatNumber.ts documents: on the 'ar' subtag Intl emits LATIN
// digits, so only the decimal separator localises (fr "0,00"), never the digits.
export const formatFileMeta = (
  file: { size: number; type: string },
  s: { fileSizeMb: string; fileTypeUnknown: string },
  lang: string,
): string => {
  const mb = file.size / 1024 / 1024;
  const size = new Intl.NumberFormat(lang || 'en', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(mb) ? mb : 0);

  // "application/pdf" -> "PDF", "image/jpeg" -> "JPEG"; empty/odd type -> fallback.
  const type = file.type.split('/')[1]?.toUpperCase() || s.fileTypeUnknown;

  // U+00A0 (no-break space) glues the number to its unit — required before the
  // French "Mo", good typography in every locale. " • " keeps regular spaces so
  // the size-group and the type can wrap apart if the row is narrow.
  return `${size} ${s.fileSizeMb} • ${type}`;
};
