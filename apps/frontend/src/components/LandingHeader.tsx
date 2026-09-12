import React from 'react';
import { Link } from 'react-router-dom';
import { AppLogo } from './AppLogo';

// ============================================================================
// THE LANDING HEADER.
// ============================================================================
// Measured 2026-09-12: the landing page had NO header element at all —
// `document.querySelector('header')` and `('nav')` both returned null, and the
// page opened directly on a headline with nothing above it. All five competitor
// landing pages captured that day carry one, because a header is what makes a
// page read as a company rather than a deployed template.
//
// ── WHY THE LOGO IS THE MARK ONLY ──────────────────────────────────────────
// `AppLogo`'s `showText` variant is built for a DARK surface: it renders the
// wordmark in `text-white` with a `text-blue-500` ampersand. This header is
// `bg-surface-raised` (#FFFFFF), so that variant would be invisible here, and
// its blue is a colour outside the approved set. So the mark is reused as-is
// (`showText={false}`) and the wordmark is set in `text-ink`, which is the
// colour the rest of the product already uses for primary text.
//
// ── COLOUR ─────────────────────────────────────────────────────────────────
// Tokens only, and no new colour enters: `bg-surface-raised`, `border-line`,
// `text-ink`, `text-ink-secondary`, and `bg-ink` on the one filled action. The
// accent stays where #208 left it — the headline's second line — and appears
// nowhere in this component.
//
// ── z-index ────────────────────────────────────────────────────────────────
// `z-chrome` (60), the named step the token ladder already reserves for a
// layout header. Nothing else on this page carries a z-index, and this page
// mounts no portal and no overlay: grep for `createPortal`, `overlayStack` and
// `useBackDismiss` in LandingScreen returns nothing. So this cannot disturb the
// modal ladder or the Android back-button LIFO, neither of which this route
// participates in — LandingScreen is routed OUTSIDE the app `Layout`.
// ============================================================================

// The two anchors, and the section ids they scroll to. Both sections already
// exist on the page; this component adds no content anywhere.
export const HEADER_ANCHORS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
] as const;

export const LandingHeader: React.FC = () => (
  <header className="sticky top-0 z-chrome border-b border-line bg-surface-raised">
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
      {/* Left: the mark, plus the wordmark in ink. */}
      <Link to="/" className="flex items-center gap-2.5" aria-label="Scan & Action home">
        <AppLogo size={30} showText={false} />
        <span className="text-lg font-black tracking-tight text-ink">Scan&amp;Action</span>
      </Link>

      {/* Centre: anchors to sections that already exist. Hidden below `sm`,
          where there is not room for them beside two actions — the sections
          themselves stay reachable by scrolling, so nothing becomes
          unreachable and no new navigation interaction is introduced. */}
      <nav className="hidden items-center gap-8 sm:flex">
        {HEADER_ANCHORS.map((a) => (
          <a
            key={a.href}
            href={a.href}
            className="text-sm font-bold text-ink-secondary transition-colors hover:text-ink"
          >
            {a.label}
          </a>
        ))}
      </nav>

      {/* Right: text action, then filled action — the ordering every competitor
          measured uses. Both route to /login, which is where signup lives. */}
      <div className="flex items-center gap-3">
        <Link to="/login" className="text-sm font-bold text-ink-secondary transition-colors hover:text-ink">
          Log in
        </Link>
        <Link
          to="/login"
          className="rounded-btn bg-ink px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          Start free
        </Link>
      </div>
    </div>
  </header>
);
