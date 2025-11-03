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
 * Branded CTA button for share pages.
 *
 * Links to sign-up with UTM tracking for conversion attribution.
 * Neon violet styling with glow hover effect.
 * Touch-optimized with 48px minimum target size.
 */
export function SharePageCTA({ assetId, className }: SharePageCTAProps) {
  // Construct sign-up URL with UTM parameters for tracking
  const signUpUrl = `/sign-up?ref=share&id=${assetId}`;

  const handleClick = () => {
    track('share_cta_click', {
      assetId,
      referrer: typeof window !== 'undefined' ? document.referrer || 'direct' : 'unknown',
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
