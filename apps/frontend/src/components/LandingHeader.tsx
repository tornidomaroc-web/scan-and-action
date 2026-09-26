import React from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from './BrandMark';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useStrings } from '../i18n/useStrings';

// ============================================================================
// The header of the unregistered routes (the landing and the four legal
// pages): a floating pill, the structure of the Vantro landing (HorizonX,
// read 2026-09-26) in the app's own language. The sticky wrapper keeps the
// pill in the flow, so the legal pages' content starts under it and nothing
// is covered; the pill itself is the raised surface with the mark, the two
// anchors, Log in and the dark Start pill. On the catalog in three languages.
//
// The mark's link is the only way back to the landing page from a legal
// route, so it is not decorative: `aria-label` names it for a screen reader.
// The two anchors point at sections of the landing that exist (legal pages
// pass showAnchors={false}). Both actions route to /login, where signup lives.
// ============================================================================

export const HEADER_ANCHORS = [
  { href: '#how-it-works', key: 'landingNavHow' },
  { href: '#pricing', key: 'landingNavPricing' },
] as const;

export interface LandingHeaderProps {
  showAnchors?: boolean;
}

export const LandingHeader: React.FC<LandingHeaderProps> = ({ showAnchors = true }) => {
  const s = useStrings();
  return (
    <header className="sticky top-0 z-chrome px-3 pt-3 sm:px-5" data-landing-header>
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 rounded-pill bg-surface-raised/95 ps-3 pe-2 shadow-raised ring-1 ring-line backdrop-blur">
        <Link to="/" className="flex items-center gap-2" aria-label="Scan & Action home">
          <BrandMark size={30} className="rounded-[8px]" />
          <span className="text-[15px] font-semibold tracking-tight text-ink">{s.header}</span>
        </Link>
        {showAnchors && (
          <nav className="hidden items-center gap-1 sm:flex">
            {HEADER_ANCHORS.map((a) => (
              <a key={a.href} href={a.href} className="rounded-pill px-3.5 py-1.5 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-muted hover:text-ink motion-reduce:transition-none">
                {s[a.key]}
              </a>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-1.5">
          <div className="hidden md:block"><LanguageSwitcher /></div>
          <Link to="/login" className="px-2.5 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:text-ink motion-reduce:transition-none">
            {s.landingLogIn}
          </Link>
          <Link to="/login" className="rounded-pill bg-ink px-4 py-2 text-sm font-semibold text-surface-raised transition-opacity hover:opacity-90 motion-reduce:transition-none">
            {s.landingStartFree}
          </Link>
        </div>
      </div>
    </header>
  );
};
