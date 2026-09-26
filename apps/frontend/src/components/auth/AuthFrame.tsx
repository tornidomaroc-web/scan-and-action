import React from 'react';
import { BrandMark } from '../BrandMark';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { useStrings } from '../../i18n/useStrings';

// ============================================================================
// The frame of every screen a person sees before they are signed in: the
// app's own mark and name, the language switcher (the first screen has to be
// readable in the reader's language before anything else can be), and the
// content column.
//
// On a phone the content sits directly on the page surface, starting near
// the top: the fields and the button then fit above the keyboard on a
// 390 x 844 screen (a 336pt keyboard leaves 508pt; the sign-in form uses
// about 400 of them, measured on the harness, 2026-09-26). On a wider
// screen the column is centred and becomes a card.
//
// Renders no heading of its own: each screen owns its h1, and the reset
// screen's tests read the first h1 on the page.
// ============================================================================

export const AuthFrame: React.FC<{ children: React.ReactNode; 'data-testid'?: string }> = ({ children, ...rest }) => {
  const s = useStrings();
  return (
    <div className="min-h-[100dvh] bg-surface text-ink" data-auth-frame {...rest}>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] md:justify-center md:py-12">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandMark size={32} className="rounded-[8px]" />
            <span className="font-bold tracking-tight text-ink">{s.header}</span>
          </div>
          <LanguageSwitcher />
        </header>
        <main className="mt-7 md:mt-6 md:rounded-panel md:bg-surface-raised md:p-8 md:shadow-card md:ring-1 md:ring-line">
          {children}
        </main>
      </div>
    </div>
  );
};
