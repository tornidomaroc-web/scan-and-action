import { useEffect, useState } from 'react';

// matchMedia is absent in non-browser environments (jsdom, SSR); treat
// those as non-matching rather than crashing the render.
const canMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => canMatch() && window.matchMedia(query).matches);

  useEffect(() => {
    if (!canMatch()) return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
};

// Mirrors Tailwind's `md` breakpoint, which the Layout uses to swap
// between the desktop sidebar and the mobile bottom tab bar.
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');
