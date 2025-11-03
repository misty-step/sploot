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
 * Neon violet styling with glow hover effect.
 * Touch-optimized with 48px minimum target size.
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
        // Neon violet brand styling
        'bg-primary text-primary-foreground',
        'hover:bg-primary/90',
        // Subtle glow effect on hover
        'hover:shadow-lg hover:shadow-primary/20',
        'transition-all duration-200',
        // Touch feedback: scale down on tap (active state)
        'active:scale-95',
        // Touch-optimized sizing (48px minimum on mobile)
        'h-12 px-4 text-sm',
        'sm:h-10 sm:px-6',
        // Accessibility
        'focus-visible:ring-2 focus-visible:ring-primary',
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
