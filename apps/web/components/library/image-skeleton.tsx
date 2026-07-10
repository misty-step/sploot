'use client';

import { useMemo } from 'react';
import Masonry from 'react-masonry-css';
import { cn } from '@/lib/utils';
import { IMAGE_GRID_BREAKPOINT_COLS } from './image-grid-layout';

interface ImageSkeletonProps {
  className?: string;
  variant?: 'tile' | 'list';
  aspectRatio?: string;
  delay?: number;
}

export function ImageSkeleton({ className, variant = 'tile', aspectRatio = 'aspect-square', delay = 0 }: ImageSkeletonProps) {
  if (variant === 'list') {
    return (
      <div className={cn('flex items-center gap-4 p-4', className)}>
        <div className="h-16 w-16 flex-shrink-0 rounded-[var(--sploot-radius-inner)] bg-sploot-paper-warm animate-pulse" style={{ animationDelay: `${delay}ms` }} />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded-[var(--sploot-radius-ctl)] bg-sploot-paper-warm animate-pulse" style={{ animationDelay: `${delay}ms` }} />
          <div className="h-3 w-1/2 rounded-[var(--sploot-radius-ctl)] bg-sploot-paper-warm animate-pulse" style={{ animationDelay: `${delay}ms` }} />
        </div>
      </div>
    );
  }

  // Default tile variant — a quiet toy-card panel that pulses while it waits.
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--sploot-radius)] border-[3px] border-sploot-ink bg-sploot-panel sploot-shadow-sm',
        className
      )}
    >
      <div
        className={cn(
          aspectRatio,
          'm-2 rounded-[var(--sploot-radius-inner)] bg-sploot-paper-warm animate-pulse'
        )}
        style={{ animationDelay: `${delay}ms` }}
      />
    </div>
  );
}

interface ImageGridSkeletonProps {
  count?: number;
  variant?: 'tile' | 'list';
  className?: string;
}

// Varied aspect ratios for visual interest - mimics real meme content
const ASPECT_RATIOS = [
  'aspect-square',      // 1:1
  'aspect-[3/4]',       // Portrait
  'aspect-[4/3]',       // Landscape
  'aspect-[2/3]',       // Tall portrait
  'aspect-[16/9]',      // Wide
  'aspect-[9/16]',      // Phone screenshot
];

export function ImageGridSkeleton({ count = 20, variant = 'tile', className }: ImageGridSkeletonProps) {
  // Generate deterministic but varied aspect ratios
  const skeletonConfigs = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => ({
      aspectRatio: ASPECT_RATIOS[i % ASPECT_RATIOS.length],
      delay: i * 50, // Staggered animation
    }));
  }, [count]);

  if (variant === 'list') {
    return (
      <div className={cn('space-y-1', className)}>
        {skeletonConfigs.map((config, i) => (
          <ImageSkeleton key={i} variant="list" delay={config.delay} />
        ))}
      </div>
    );
  }

  return (
    <Masonry
      breakpointCols={IMAGE_GRID_BREAKPOINT_COLS}
      className={cn('masonry-grid', className)}
      columnClassName="masonry-grid-column"
    >
      {skeletonConfigs.map((config, i) => (
        <div key={i} className="masonry-item">
          <ImageSkeleton
            variant="tile"
            aspectRatio={config.aspectRatio}
            delay={config.delay}
          />
        </div>
      ))}
    </Masonry>
  );
}

// Optimized skeleton with CSS transforms for smooth transitions
export function OptimizedImageSkeleton({
  className,
  variant = 'tile',
  isExiting = false,
  aspectRatio = 'aspect-square',
}: ImageSkeletonProps & { isExiting?: boolean }) {
  const baseClasses = cn(
    'transition-all duration-300 ease-out transform-gpu will-change-transform',
    isExiting ? 'scale-95 opacity-0' : 'scale-100 opacity-100',
    className
  );

  if (variant === 'list') {
    return (
      <div className={cn('flex items-center gap-4 p-4', baseClasses)}>
        <div className="h-16 w-16 flex-shrink-0 rounded-[var(--sploot-radius-inner)] bg-sploot-paper-warm animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded-[var(--sploot-radius-ctl)] bg-sploot-paper-warm animate-pulse" />
          <div className="h-3 w-1/2 rounded-[var(--sploot-radius-ctl)] bg-sploot-paper-warm animate-pulse opacity-70" />
        </div>
      </div>
    );
  }

  // Default tile variant with optimized transitions
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--sploot-radius)] border-[3px] border-sploot-ink bg-sploot-panel sploot-shadow-sm',
        baseClasses
      )}
    >
      <div
        className={cn(
          aspectRatio,
          'm-2 rounded-[var(--sploot-radius-inner)] bg-sploot-paper-warm animate-pulse'
        )}
      />
    </div>
  );
}
