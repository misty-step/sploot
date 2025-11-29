'use client';

import { useState, useEffect } from 'react';

/**
 * Detects if the current device is a touch-primary mobile device.
 *
 * Uses the CSS media query `(hover: none) and (pointer: coarse)` to identify
 * devices without hover capability and with coarse (touch) pointing.
 *
 * This hook handles dynamic changes - e.g., iPad with external keyboard/mouse
 * connected/disconnected, or browser responsive design mode toggled.
 *
 * @returns {boolean} `true` if device is touch-primary mobile, `false` if desktop with mouse
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const isMobile = useIsMobile();
 *
 *   return (
 *     <button className={isMobile ? 'opacity-100' : 'opacity-0 hover:opacity-100'}>
 *       Always visible on mobile, hover-only on desktop
 *     </button>
 *   );
 * }
 * ```
 */
export function useIsMobile(): boolean {
  // Initialize state based on current media query match
  // Use function to avoid server/client mismatch
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false; // SSR default: assume desktop
    }
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  });

  useEffect(() => {
    // Skip if SSR (no window)
    if (typeof window === 'undefined') {
      return;
    }

    // Create media query list
    const mediaQuery = window.matchMedia('(hover: none) and (pointer: coarse)');

    // Update state when media query changes
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    // Listen for changes (handles iPad rotation, external mouse connect/disconnect)
    mediaQuery.addEventListener('change', handleChange);

    // Sync state with current value (in case it changed during render)
    setIsMobile(mediaQuery.matches);

    // Cleanup listener on unmount
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return isMobile;
}
