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
 * - Bounce if user leaves within 5 seconds
 */
export function SharePageAnalytics({ assetId }: SharePageAnalyticsProps) {
  useEffect(() => {
    // Track page view
    track('share_page_view', {
      assetId,
      referrer: document.referrer || 'direct',
      timestamp: Date.now(),
    });

    // Track bounce after 5 seconds if user is still on page
    const bounceTimer = setTimeout(() => {
      track('share_page_bounce', {
        assetId,
        timeOnPage: 5000,
      });
    }, 5000);

    return () => {
      clearTimeout(bounceTimer);
    };
  }, [assetId]);

  return null; // This component renders nothing
}
