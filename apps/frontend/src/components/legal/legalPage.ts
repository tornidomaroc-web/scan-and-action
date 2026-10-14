import { panelClass } from '../ui/Panel';

// ============================================================================
// The public legal pages (privacy, terms, refund, support, account deletion)
// in the app's language, restyle PR 6 (2026-10-14). Styling ONLY: the pages'
// words are referenced by App Store Connect, Play and Google's verified brand,
// and none of them may change here (the PR's rendered-text diff proves it).
//
// The text sits on one raised card in ink (19.0:1 light, 15.5:1 dark). The
// section headings take the accent text, the links the accent text underlined;
// the footer is ink-secondary, never muted. Until this PR the pages carried
// raw slate / blue / emerald / red classes: green headings measured 3.40:1 on
// the light page, blue links 3.68:1 on the dark one, the slate footer 4.29:1
// and 4.00:1 (softSurfaces.test.ts holds the new pairs and those controls).
// No uppercase and no letter-spacing: the headings carry their own numbers and
// section 4 of the privacy policy follows the reader's language, Arabic too.
// ============================================================================

export const legalPageClass = 'mx-auto max-w-4xl px-4 pb-16 pt-8 font-sans text-ink sm:px-6 sm:pt-12';
export const legalTitleRowClass = 'mb-6 flex items-center gap-4';
export const legalIconClass = 'flex-none rounded-tile bg-accent-tint p-3 text-accent-text';
export const legalTitleClass = 'text-[1.75rem] font-semibold leading-tight tracking-tight text-ink sm:text-[2.25rem]';
export const legalBodyClass = `space-y-8 p-5 leading-relaxed sm:p-8 ${panelClass}`;
export const legalHeadingClass = 'mb-2 text-[1.0625rem] font-semibold text-accent-text';
export const legalLinkClass = 'font-semibold text-accent-text underline underline-offset-2';
export const legalFooterClass = 'border-t border-divider pt-6 text-sm text-ink-secondary';
