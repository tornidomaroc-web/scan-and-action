import React from 'react';
import { Briefcase, Car, HeartPulse, Plane, Shapes, ShoppingBag, Utensils, Zap } from 'lucide-react';
import type { LedgerCategory } from '../../lib/ledgerTypes';

// ============================================================================
// The category icon: the app's one treatment for a category, everywhere.
//
// A solid tile in the category's colour with a white glyph. Not a pale tint
// with a coloured glyph: a tint sits close to the card's own value, and that
// is what made the icons blend into the card. A saturated fill makes the icon
// the most chromatic thing on its card, so the eye finds the category first.
//
// Colour is never the only carrier: the tile is aria-hidden, and every place
// that draws one also prints the category's name. The fills live in
// tokens.css (--sa-cat-*), one value for both themes; categoryPalette.test.ts
// holds each to 3:1 for the glyph and 3:1 for the tile on every surface.
// ============================================================================

export const CATEGORY_ICON: Record<LedgerCategory, typeof Utensils> = {
  Food: Utensils,
  Transport: Car,
  Travel: Plane,
  Shopping: ShoppingBag,
  Health: HeartPulse,
  Bills: Zap,
  Office: Briefcase,
  Other: Shapes,
};

// Full class names, so Tailwind's scanner sees each one.
export const CATEGORY_FILL: Record<LedgerCategory, string> = {
  Food: 'bg-cat-food',
  Transport: 'bg-cat-transport',
  Travel: 'bg-cat-travel',
  Shopping: 'bg-cat-shopping',
  Health: 'bg-cat-health',
  Bills: 'bg-cat-bills',
  Office: 'bg-cat-office',
  Other: 'bg-cat-other',
};

/** The ring a selected category card wears, in its own colour. */
export const CATEGORY_RING: Record<LedgerCategory, string> = {
  Food: 'ring-cat-food',
  Transport: 'ring-cat-transport',
  Travel: 'ring-cat-travel',
  Shopping: 'ring-cat-shopping',
  Health: 'ring-cat-health',
  Bills: 'ring-cat-bills',
  Office: 'ring-cat-office',
  Other: 'ring-cat-other',
};

const SIZES = {
  sm: { box: 'h-9 w-9', glyph: 18 },
  md: { box: 'h-10 w-10', glyph: 20 },
} as const;

export const CategoryIcon: React.FC<{ category: LedgerCategory; size?: keyof typeof SIZES }> = ({ category, size = 'md' }) => {
  const Icon = CATEGORY_ICON[category];
  const { box, glyph } = SIZES[size];
  return (
    <span
      aria-hidden="true"
      data-category-icon={category}
      className={`flex ${box} flex-none items-center justify-center rounded-tile ${CATEGORY_FILL[category]} text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]`}
    >
      <Icon size={glyph} strokeWidth={2.25} />
    </span>
  );
};
