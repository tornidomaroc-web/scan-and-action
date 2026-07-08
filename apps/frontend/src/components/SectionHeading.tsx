import React from 'react';
import type { LucideIcon } from 'lucide-react';

// Reusable File-Detail section heading (locked, human-approved spec).
//  - ONE monochrome neutral Lucide icon at 18px, colored with the --sa-ink-faint
//    "icons" token (never a semantic/accent color) so every section reads the same.
//  - Title 16px (text-base), semibold, in the primary ink token.
//  - 10px gap (gap-2.5) between icon and text.
//  - Sentence case — authored in the i18n copy, not forced here.
//  - No divider / separator line is ever drawn by the heading.
// The 40px inter-section spacing lives on the section wrappers (mb-10), not on the
// heading, so a heading placed anywhere keeps its own tight heading→content rhythm.
interface SectionHeadingProps {
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

export const SectionHeading = ({ icon: Icon, children, className = '' }: SectionHeadingProps) => (
  <h3 className={`mb-4 flex items-center gap-2.5 text-base font-semibold text-ink ${className}`}>
    <Icon size={18} className="flex-shrink-0 text-ink-faint" aria-hidden="true" />
    <span>{children}</span>
  </h3>
);
