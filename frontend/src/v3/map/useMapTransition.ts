/**
 * useMapTransition — animated transition between mini-map and full map mode.
 *
 * Uses CSS transforms (translate + scale) for 60fps animation.
 * - On expand: captures mini-map bounding rect, scales from mini to fullscreen
 * - On collapse: reverse animation
 * - Feed content fades out over 200ms, map scales up over 400ms
 */
import { useState, useRef, useCallback, useEffect } from 'react';

interface TransitionStyle {
  position: 'fixed';
  top: number;
  left: number;
  width: number;
  height: number;
  transform: string;
  transition: string;
  zIndex: number;
  opacity: number;
}

interface UseMapTransitionReturn {
  isExpanded: boolean;
  isTransitioning: boolean;
  miniMapRef: React.RefObject<HTMLDivElement | null>;
  fullMapRef: React.RefObject<HTMLDivElement | null>;
  triggerExpand: () => void;
  triggerCollapse: () => void;
  transitionStyle: TransitionStyle | null;
  feedOpacity: number;
}

export function useMapTransition(): UseMapTransitionReturn {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionStyle, setTransitionStyle] = useState<TransitionStyle | null>(null);
  const [feedOpacity, setFeedOpacity] = useState(1);

  const miniMapRef = useRef<HTMLDivElement | null>(null);
  const fullMapRef = useRef<HTMLDivElement | null>(null);
  const miniRectRef = useRef<DOMRect | null>(null);

  const triggerExpand = useCallback(() => {
    if (isTransitioning || isExpanded) return;

    // Capture mini-map position
    const miniEl = miniMapRef.current;
    if (miniEl) {
      miniRectRef.current = miniEl.getBoundingClientRect();
    }

    setIsTransitioning(true);
    // Fade out feed first
    setFeedOpacity(0);

    const rect = miniRectRef.current;
    if (rect) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Start from mini-map rect
      setTransitionStyle({
        position: 'fixed',
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        transform: 'scale(1)',
        transition: 'none',
        zIndex: 1000,
        opacity: 1,
      });

      // Next frame: animate to full viewport
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransitionStyle({
            position: 'fixed',
            top: 0,
            left: 0,
            width: vw,
            height: vh,
            transform: 'scale(1)',
            transition: 'all 400ms cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 1000,
            opacity: 1,
          });
        });
      });
    }

    // After animation completes, switch to expanded state
    setTimeout(() => {
      setIsExpanded(true);
      setIsTransitioning(false);
      setTransitionStyle(null);
    }, 420);
  }, [isTransitioning, isExpanded]);

  const triggerCollapse = useCallback(() => {
    if (isTransitioning || !isExpanded) return;

    setIsTransitioning(true);

    const rect = miniRectRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect) {
      // Start from fullscreen
      setTransitionStyle({
        position: 'fixed',
        top: 0,
        left: 0,
        width: vw,
        height: vh,
        transform: 'scale(1)',
        transition: 'none',
        zIndex: 1000,
        opacity: 1,
      });

      // Next frame: animate back to mini-map rect
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransitionStyle({
            position: 'fixed',
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            transform: 'scale(1)',
            transition: 'all 400ms cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 1000,
            opacity: 1,
          });
        });
      });
    }

    // Fade feed back in
    setTimeout(() => {
      setFeedOpacity(1);
    }, 200);

    // After animation: collapse
    setTimeout(() => {
      setIsExpanded(false);
      setIsTransitioning(false);
      setTransitionStyle(null);
    }, 420);
  }, [isTransitioning, isExpanded]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setTransitionStyle(null);
    };
  }, []);

  return {
    isExpanded,
    isTransitioning,
    miniMapRef,
    fullMapRef,
    triggerExpand,
    triggerCollapse,
    transitionStyle,
    feedOpacity,
  };
}

export default useMapTransition;
