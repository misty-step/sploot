'use client';

import { useEffect } from 'react';
import { track } from '@vercel/analytics';

interface SharePageAnalyticsProps {
  assetId: string;
}

/**
 * Sanitize referrer URL to remove PII (query params and fragments).
 *
 * Returns only origin + pathname to prevent leaking sensitive data like:
 * - Session tokens (?token=xyz)
 * - Email addresses (?email=user@domain.com)
 * - UTM parameters with PII
 *
 * @param referrer - Raw document.referrer value
 * @returns Sanitized referrer (origin + pathname) or 'direct' if unavailable
 */
function sanitizeReferrer(referrer: string): string {
  if (!referrer) return 'direct';

  try {
    const url = new URL(referrer);
    // Only keep origin (https://example.com) + pathname (/path/to/page)
    // Strip query params (? ...) and fragments (# ...)
    return `${url.origin}${url.pathname}`;
  } catch {
    // Invalid URL - return safe default
    return 'direct';
  }
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

    // Track page view with sanitized referrer (no PII)
    track('share_page_view', {
      assetId,
      referrer: sanitizeReferrer(document.referrer),
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
