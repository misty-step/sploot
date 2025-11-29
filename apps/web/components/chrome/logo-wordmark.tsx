'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoWordmarkProps {
  className?: string;
  variant?: 'default' | 'compact';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Logo/Wordmark component for sploot
 * Simplified - just SVG + text, responsive sizing via Tailwind
 */
export function LogoWordmark({ className, variant = 'default', size = 'md' }: LogoWordmarkProps) {
  // Size variants
  const iconSize = size === 'sm' ? 6 : size === 'lg' ? 10 : 8;
  const iconText = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-xs';
  const textSize = size === 'sm' ? 'text-xl' : size === 'lg' ? 'text-3xl' : 'text-2xl';
  const compactTextSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <Link
      href="/app"
      className={cn('inline-flex items-center gap-2', className)}
      aria-label="Sploot - Home"
    >
      {/* Logo icon */}
      <div className={cn(`flex items-center justify-center size-${iconSize} bg-primary border border-primary rounded-lg`)}>
        <span className={cn('font-mono font-bold text-primary-foreground', iconText)}>
          S
        </span>
      </div>

      {/* Variant: default shows full wordmark */}
      {variant === 'default' && (
        <div className="flex flex-col">
          <span className={cn('font-mono font-bold text-foreground tracking-wider leading-tight hover:text-primary transition-colors', textSize)}>
            sploot
          </span>
        </div>
      )}

      {/* Variant: compact shows just 's' */}
      {variant === 'compact' && (
        <span className={cn('font-mono font-bold text-foreground tracking-wider', compactTextSize)}>
          s
        </span>
      )}
    </Link>
  );
}

/**
 * Standalone logo icon component
 * Useful for loading states, favicons, or icon-only contexts
 */
export function LogoIcon({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center bg-primary border border-primary rounded-lg',
        className
      )}
      style={{ width: size, height: size }}
    >
      <span
        className="font-mono font-bold text-primary-foreground"
        style={{ fontSize: size * 0.4 }}
      >
        S
      </span>
    </div>
  );
}
