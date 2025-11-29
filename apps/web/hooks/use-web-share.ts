'use client';

import { useState, useEffect } from 'react';

/**
 * Result object from useWebShare hook
 */
export interface WebShareCapabilities {
  /**
   * Whether the Web Share API is supported at all.
   * True if `navigator.share` exists.
   */
  isSupported: boolean;

  /**
   * Whether the browser supports sharing files via Web Share API.
   * True if `navigator.canShare({ files: [...] })` returns true.
   *
   * Note: iOS Safari supports file sharing, desktop Chrome support varies by version.
   */
  canShareFiles: boolean;
}

/**
 * Detects Web Share API capabilities in the current browser.
 *
 * The Web Share API allows websites to invoke native share dialogs on mobile devices.
 * This hook checks:
 * - Basic support: Does `navigator.share` exist?
 * - File support: Can we share files (images) via the API?
 *
 * Browser support:
 * - iOS Safari 12.2+: Full support including files
 * - Android Chrome 61+: Support varies, files added in Chrome 89+
 * - Desktop Safari: Supported in macOS 12.3+
 * - Desktop Chrome: Supported but files limited to certain versions
 *
 * @returns {WebShareCapabilities} Object with `isSupported` and `canShareFiles` booleans
 *
 * @example
 * ```tsx
 * function ShareButton() {
 *   const { isSupported, canShareFiles } = useWebShare();
 *
 *   if (!isSupported) {
 *     return <CopyToClipboardButton />;
 *   }
 *
 *   const handleShare = async () => {
 *     if (canShareFiles) {
 *       await navigator.share({ files: [imageFile], url: shareUrl });
 *     } else {
 *       await navigator.share({ url: shareUrl });
 *     }
 *   };
 *
 *   return <button onClick={handleShare}>Share</button>;
 * }
 * ```
 */
export function useWebShare(): WebShareCapabilities {
  const [capabilities, setCapabilities] = useState<WebShareCapabilities>(() => {
    // SSR-safe initialization
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return {
        isSupported: false,
        canShareFiles: false,
      };
    }

    // Check basic Web Share API support
    const isSupported = 'share' in navigator && typeof navigator.share === 'function';

    if (!isSupported) {
      return {
        isSupported: false,
        canShareFiles: false,
      };
    }

    // Check if files can be shared
    // Create a minimal test file to check capability
    let canShareFiles = false;
    if ('canShare' in navigator && typeof navigator.canShare === 'function') {
      try {
        // Create a dummy file to test file sharing capability
        const testFile = new File([''], 'test.txt', { type: 'text/plain' });
        canShareFiles = navigator.canShare({ files: [testFile] });
      } catch (error) {
        // canShare might throw in some browsers - assume files not supported
        canShareFiles = false;
      }
    }

    return {
      isSupported,
      canShareFiles,
    };
  });

  // Re-check on mount to handle hydration mismatches
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    const isSupported = 'share' in navigator && typeof navigator.share === 'function';

    if (!isSupported) {
      setCapabilities({
        isSupported: false,
        canShareFiles: false,
      });
      return;
    }

    let canShareFiles = false;
    if ('canShare' in navigator && typeof navigator.canShare === 'function') {
      try {
        const testFile = new File([''], 'test.txt', { type: 'text/plain' });
        canShareFiles = navigator.canShare({ files: [testFile] });
      } catch (error) {
        canShareFiles = false;
      }
    }

    setCapabilities({
      isSupported,
      canShareFiles,
    });
  }, []);

  return capabilities;
}
