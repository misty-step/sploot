'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SharePageCTAProps {
  assetId: string;
  className?: string;
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
      <Link href={signUpUrl}>
        Create your collection
      </Link>
    </Button>
  );
}
