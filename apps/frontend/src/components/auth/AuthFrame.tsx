import React from 'react';
import { BrandMark } from '../BrandMark';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { useStrings } from '../../i18n/useStrings';

// ============================================================================
// The frame of every screen a person sees before they are signed in, in the
// visual language of 2026-09-26: a dark page in both themes (`theme-dark`
// scopes the dark palette to this subtree, tokens.css); the brand, the
// language switcher, the screen's title and one line in the big accent card;
// then the content.
//
// The card is kept short on purpose: on a 390 x 844 phone a 336 pt keyboard
// leaves 508 pt, and the sign-in form's button has to end above that. With
// this frame it ends at about 490 pt (measured on the harness, 2026-09-26);
// the first cut of this card, with the switcher on its own row and a 44 px
// mark, put it at 591 and under the keyboard.
//
// The title is the page's only h1: the reset screen's tests read the first
// h1 on the page and expect the screen's own title.
// ============================================================================

export const AuthFrame: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => {
  const s = useStrings();
  return (
    <div className="theme-dark min-h-[100dvh] bg-surface text-ink" data-auth-frame>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] md:justify-center md:py-12">
        <section className="rounded-panel bg-accent p-4 text-on-accent shadow-raised" data-auth-hero>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <BrandMark size={36} className="rounded-[10px]" />
              <span className="text-[15px] font-semibold tracking-tight">{s.header}</span>
            </div>
            <LanguageSwitcher />
          </div>
          <h1 className="mt-3 text-start text-[22px] font-semibold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-start text-[13px] opacity-80">{subtitle}</p>}
        </section>
        <main className="mt-4">{children}</main>
      </div>
    </div>
  );
};
