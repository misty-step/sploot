'use client';

import { useEffect } from 'react';
import { track } from '@vercel/analytics';

interface SharePageAnalyticsProps {
  assetId: string;
}

/**
 * Client component for tracking share page analytics.
 *
 * Tracks:
 * - Page view when component mounts
 * - Bounce if user leaves within 5 seconds (tracked on unmount)
 */
export function SharePageAnalytics({ assetId }: SharePageAnalyticsProps) {
  useEffect(() => {
    const mountedAt = Date.now();

    // Track page view
    track('share_page_view', {
      assetId,
      referrer: document.referrer || 'direct',
      timestamp: mountedAt,
    });

    // Track bounce on cleanup if user leaves before 5 seconds
    return () => {
      const timeOnPage = Date.now() - mountedAt;
      if (timeOnPage < 5000) {
        track('share_page_bounce', {
          assetId,
          timeOnPage,
        });
      }
    };
  }, [assetId]);

  return null; // This component renders nothing
}
