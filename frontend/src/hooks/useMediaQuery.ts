import { useState, useEffect } from 'react';
import { BP } from '../tokens';

export type Viewport = 'mobile' | 'tablet' | 'desktop';

/**
 * Returns true when the given media query string matches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/**
 * Returns the current viewport category: 'mobile', 'tablet', or 'desktop'.
 * Uses the breakpoints from tokens.ts (BP.mobile = 768, BP.tablet = 1024).
 */
export function useViewport(): Viewport {
  const isMobile = useMediaQuery(`(max-width: ${BP.mobile - 1}px)`);
  const isTablet = useMediaQuery(`(min-width: ${BP.mobile}px) and (max-width: ${BP.tablet - 1}px)`);
  if (isMobile) return 'mobile';
  if (isTablet) return 'tablet';
  return 'desktop';
}

/**
 * Hook that returns true when the device supports touch (heuristic).
 */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);
  return isTouch;
}
