import React from 'react';
import type { LucideIcon } from 'lucide-react';

// Reusable section heading (locked, human-approved spec). One shared visual style
// across every screen so headings stop diverging:
//  - An OPTIONAL monochrome neutral Lucide icon at 18px, colored with the
//    --sa-ink-faint "icons" token (never a semantic/accent color). When no icon is
//    passed the title renders alone — `gap-2.5` only spaces siblings, so a single
//    child leaves no dangling leading gap.
//  - Title 16px (text-base), semibold, in the primary ink token.
//  - 10px gap (gap-2.5) between icon and text.
//  - Sentence case — authored in the i18n copy, not forced here.
//  - No divider / separator line is ever drawn by the heading.
// The `as` prop only sets the semantic tag (h2/h3) so callers can keep a correct
// document outline; the VISUAL style is identical regardless of level. The 40px
// inter-section spacing lives on the section wrappers (mb-10), not the heading.
interface SectionHeadingProps {
  icon?: LucideIcon;
  as?: 'h2' | 'h3';
  children: React.ReactNode;
  className?: string;
}

export const SectionHeading = ({ icon: Icon, as: Tag = 'h3', children, className = '' }: SectionHeadingProps) => (
  <Tag className={`mb-4 flex items-center gap-2.5 text-base font-semibold text-ink ${className}`}>
    {Icon && <Icon size={18} className="flex-shrink-0 text-ink-faint" aria-hidden="true" />}
    <span>{children}</span>
  </Tag>
);
