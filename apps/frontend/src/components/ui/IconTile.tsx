import React from 'react';
import type { LucideIcon } from 'lucide-react';

// ============================================================================
// The icon tile for anything that is not a category: a solid or tinted square
// with the glyph inside, the same shape and sizes as CategoryIcon, so every
// icon in the app sits in a tile and none floats as a grey line drawing on a
// card (the owner's complaint on the ledger home, 2026-09-24).
//
//   accent   the one primary tile on a screen (a search, an AI answer)
//   neutral  a document with no category, a settings row, a section
//   warning / danger / success   a state, in that state's own colours
//
// Every pairing is token on token, so both sides flip together in dark mode
// (tokenLiteralPairing.test.ts is the guard). The tile is aria-hidden: the
// text beside it carries the meaning.
// ============================================================================

export type IconTone = 'accent' | 'neutral' | 'warning' | 'danger' | 'success';

const TONE: Record<IconTone, string> = {
  accent: 'bg-accent text-surface-raised',
  neutral: 'bg-surface-muted text-ink-secondary',
  warning: 'bg-warning-tint text-warning-text',
  danger: 'bg-danger-tint text-danger-text',
  success: 'bg-success-tint text-success-text',
};

const SIZES = {
  sm: { box: 'h-9 w-9', glyph: 18 },
  md: { box: 'h-10 w-10', glyph: 20 },
  lg: { box: 'h-14 w-14', glyph: 26 },
} as const;

export const IconTile: React.FC<{
  icon: LucideIcon;
  tone?: IconTone;
  size?: keyof typeof SIZES;
  className?: string;
}> = ({ icon: Icon, tone = 'neutral', size = 'md', className = '' }) => {
  const { box, glyph } = SIZES[size];
  return (
    <span
      aria-hidden="true"
      data-icon-tile={tone}
      className={`flex ${box} flex-none items-center justify-center rounded-tile ${TONE[tone]} ${className}`}
    >
      <Icon size={glyph} strokeWidth={2.25} />
    </span>
  );
};
