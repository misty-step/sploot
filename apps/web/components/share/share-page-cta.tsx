'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { track } from '@vercel/analytics';

interface SharePageCTAProps {
  assetId: string;
  className?: string;
}

/**
 * Sanitize referrer URL to remove PII (query params and fragments).
 *
 * Returns only origin + pathname to prevent leaking sensitive data.
 *
 * @param referrer - Raw document.referrer value
 * @returns Sanitized referrer (origin + pathname) or 'direct' if unavailable
 */
function sanitizeReferrer(referrer: string): string {
  if (!referrer) return 'direct';

  try {
    const url = new URL(referrer);
    return `${url.origin}${url.pathname}`;
  } catch {
    return 'direct';
  }
}

/**
 * Branded CTA button for share pages.
 *
 * Links to sign-up with UTM tracking for conversion attribution.
 * Composes the shared toybox Button — physics and candy fill come from the
 * component; this only carries the touch-optimized 48px sizing.
 */
export function SharePageCTA({ assetId, className }: SharePageCTAProps) {
  // Construct sign-up URL with UTM parameters for tracking
  // Encode assetId to handle special characters (&, ?, #, spaces)
  const signUpUrl = `/sign-up?ref=share&id=${encodeURIComponent(assetId)}`;

  const handleClick = () => {
    const rawReferrer =
      typeof window !== 'undefined' ? document.referrer : '';

    track('share_cta_click', {
      assetId,
      referrer: sanitizeReferrer(rawReferrer),
      timestamp: Date.now(),
    });
  };

  return (
    <Button
      asChild
      size="default"
      className={cn(
        // Touch-optimized sizing (48px minimum on mobile)
        'h-12 px-4 text-sm',
        'sm:h-10 sm:px-6',
        // Prevent text selection on tap
        'select-none',
        className
      )}
      aria-label="Create your collection on Sploot"
    >
      <Link href={signUpUrl} onClick={handleClick}>
        Create your collection
      </Link>
    </Button>
  );
}
