import React from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from './BrandMark';

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
// The mark is `BrandMark`, which is the Play Store listing icon and the source
// of all 26 Android launcher/splash assets. It carries its own gradient plate,
// so it needs no variant for this surface or for the dark one. The wordmark is
// set in `text-ink`, the colour the rest of the product already uses for
// primary text — the mark ships no wordmark of its own, deliberately.
//
// `size={30}` is below `CUT_THRESHOLD_PX`, so this renders the SMALL CUT. That
// is not incidental: the full master at 30px contains zero fully-opaque pixels
// and its white renders #47749C. See the measurement table in BrandMark.tsx.
//
// ── COLOUR ─────────────────────────────────────────────────────────────────
// Tokens only, and no new colour enters: `bg-surface-raised`, `border-line`,
// `text-ink`, `text-ink-secondary`, and `bg-ink` on the one filled action. The
// accent stays where #208 left it — the headline's second line — and appears
// nowhere in this component.
//
// THE FILLED ACTION PAIRS TWO TOKENS, NOT A TOKEN AND A LITERAL. It was
// `bg-ink text-white` until this component was mounted on routes that are not
// pinned light, and that pairing is broken by construction: `bg-ink` paints the
// background with the primary TEXT colour, which inverts under `.dark`, while
// `text-white` cannot. Measured: #FFFFFF on #F8FAFC is 1.05:1 against a 3.0:1
// floor — the #211 defect. `text-surface-raised` inverts WITH the background:
//     light  #1A1F36 on #FFFFFF = 16.24:1   (identical to what it replaced)
//     dark   #F8FAFC on #1E293B = 13.98:1
// So the header is now correct on any route, pinned or not, and no longer
// depends on the page's theme policy. On the pinned landing route nothing
// changes, because `--sa-surface-raised` is #FFFFFF there in both modes.
//
// ── WHERE THIS MOUNTS, AND WHY THE ANCHORS ARE OPTIONAL ────────────────────
// `#how-it-works` and `#pricing` are sections of the LANDING page. Measured on
// the four legal routes: `grep -c 'id="how-it-works"'` and `id="pricing"` both
// return 0 in all four. An anchor to a missing id scrolls nowhere and reports
// no error — the same silent failure `landingHeader.test.tsx` already guards on
// the landing page. So `showAnchors` defaults to true and is passed false off
// the landing route, rather than shipping two dead links per page.
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

export interface LandingHeaderProps {
  /** Render the centre anchors. True only where their target ids exist —
   *  i.e. the landing page. See the note above; false ships no dead links. */
  showAnchors?: boolean;
}

export const LandingHeader: React.FC<LandingHeaderProps> = ({ showAnchors = true }) => (
  <header className="sticky top-0 z-chrome border-b border-line bg-surface-raised">
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
      {/* Left: the mark, plus the wordmark in ink. This Link is also the only
          way back to the landing page from a legal route, so it is not
          decorative — `aria-label` names it for a screen reader. */}
      <Link to="/" className="flex items-center gap-2.5" aria-label="Scan & Action home">
        <BrandMark size={30} />
        <span className="text-lg font-black tracking-tight text-ink">Scan&amp;Action</span>
      </Link>

      {/* Centre: anchors to sections that already exist. Hidden below `sm`,
          where there is not room for them beside two actions — the sections
          themselves stay reachable by scrolling, so nothing becomes
          unreachable and no new navigation interaction is introduced. */}
      {showAnchors && (
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
      )}

      {/* Right: text action, then filled action — the ordering every competitor
          measured uses. Both route to /login, which is where signup lives. */}
      <div className="flex items-center gap-3">
        <Link to="/login" className="text-sm font-bold text-ink-secondary transition-colors hover:text-ink">
          Log in
        </Link>
        <Link
          to="/login"
          className="rounded-btn bg-ink px-4 py-2 text-sm font-bold text-surface-raised transition-opacity hover:opacity-90"
        >
          Start free
        </Link>
      </div>
    </div>
  </header>
);
