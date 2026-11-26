import React from 'react';
import { BrandMark } from '../BrandMark';
import { useStrings } from '../../i18n/useStrings';

// ============================================================================
// The header of the two store pages (/privacy/app and /support/app), the
// addresses App Store Connect gives a reviewer. The same pill as
// LandingHeader, with NOTHING to follow: the mark is not a link, and there is
// no Log in and no Start. LandingHeader's mark links to "/", and on the web
// "/" is the landing with its prices, one tap from a store page. Here the
// header holds no <a>, no href and no role="link" (iosNoPlanWording.test.tsx
// counts them, with a planted link as its control).
// ============================================================================

export const StoreHeader: React.FC = () => {
  const s = useStrings();
  return (
    <header className="sticky top-0 z-chrome px-3 pt-3 sm:px-5" data-landing-header data-store-header>
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 rounded-pill bg-surface-raised ps-3 pe-2 shadow-raised ring-1 ring-line">
        <BrandMark size={30} className="rounded-[8px]" />
        <span className="text-[0.9375rem] font-semibold tracking-tight text-ink">{s.header}</span>
      </div>
    </header>
  );
};
