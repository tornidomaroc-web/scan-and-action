import React from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from './BrandMark';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useStrings } from '../i18n/useStrings';

// ============================================================================
// The header of the unregistered routes (the landing and the four legal
// pages), in the visual language of 2026-09-26 and on the catalog in three
// languages. Sticky, on the chrome layer, on token surfaces only.
//
// The left link is the only way back to the landing page from a legal route,
// so it is not decorative: `aria-label` names it for a screen reader. The two
// anchors point at sections of the landing that exist (legal pages pass
// showAnchors={false}). Both actions route to /login, where signup lives.
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
    <header className="sticky top-0 z-chrome border-b border-line bg-surface-raised">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-5 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Scan & Action home">
          <BrandMark size={30} className="rounded-[8px]" />
          <span className="text-[15px] font-semibold tracking-tight text-ink">{s.header}</span>
        </Link>
        {showAnchors && (
          <nav className="hidden items-center gap-1 rounded-pill bg-surface-muted p-1 sm:flex">
            {HEADER_ANCHORS.map((a) => (
              <a key={a.href} href={a.href} className="rounded-pill px-3.5 py-1.5 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-raised hover:text-ink motion-reduce:transition-none">
                {s[a.key]}
              </a>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2">
          <div className="hidden md:block"><LanguageSwitcher /></div>
          <Link to="/login" className="px-2 text-sm font-semibold text-ink-secondary transition-colors hover:text-ink motion-reduce:transition-none">
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
