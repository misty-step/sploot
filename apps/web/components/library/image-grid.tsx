'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { ImageTile } from './image-tile';
import { ImageTileErrorBoundary } from './image-tile-error-boundary';
import { ImageGridSkeleton } from './image-skeleton';
import { EmptyState } from './empty-state';
import { cn } from '@/lib/utils';
import { trackBrokenImageRatio, setupCLSTracking } from '@/lib/performance-metrics';
import type { Asset } from '@/lib/types';
import type { EmptyStateVariant } from './empty-state';
import { IMAGE_GRID_BREAKPOINT_COLS, IMAGE_GRID_SCROLL_CLASS } from './image-grid-layout';

interface ImageGridProps {
  assets: Asset[];
  loading?: boolean;
  dimmed?: boolean;
  error?: string | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  onAssetUpdate?: (id: string, updates: Partial<Asset>) => void;
  onAssetDelete?: (id: string) => void;
  onAssetSelect?: (asset: Asset) => void;
  containerClassName?: string;
  onScrollContainerReady?: (node: HTMLDivElement | null) => void;
  onUploadClick?: () => void;
  showSimilarityScores?: boolean;
  emptyStateVariant?: EmptyStateVariant;
  emptyStateSearchQuery?: string;
}

export function ImageGrid({
  assets,
  loading = false,
  dimmed = false,
  error = null,
  hasMore = false,
  onLoadMore,
  onRetry,
  onAssetUpdate,
  onAssetDelete,
  onAssetSelect,
  containerClassName,
  onScrollContainerReady,
  onUploadClick,
  showSimilarityScores = false,
  emptyStateVariant = 'first-use',
  emptyStateSearchQuery,
}: ImageGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showingTransition, setShowingTransition] = useState(false);
  const [brokenImageCount, setBrokenImageCount] = useState(0);
  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      onScrollContainerReady?.(node);
    },
    [onScrollContainerReady]
  );

  // Handle transition from skeleton to empty state
  useEffect(() => {
    if (!loading && assets.length === 0) {
      let cancelled = false;
      // Start transition: show skeleton fading out
      queueMicrotask(() => {
        if (!cancelled) {
          setShowingTransition(true);
        }
      });
      const timer = setTimeout(() => {
        setShowingTransition(false);
      }, 300); // Match the fade-out duration
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
  }, [loading, assets.length]);

  // Setup CLS (Cumulative Layout Shift) tracking
  // Monitors layout stability of image grid (target: CLS < 0.1)
  useEffect(() => {
    if (assets.length > 0) {
      setupCLSTracking(containerRef.current || undefined);
    }
  }, [assets.length]);

  // Track broken image ratio
  // Count images that fail to load and report metric
  useEffect(() => {
    if (assets.length === 0) return;

    // Listen for image load errors via event delegation
    const container = containerRef.current;
    if (!container) return;

    let brokenCount = 0;

    const handleImageError = (e: Event) => {
      if ((e.target as HTMLElement).tagName === 'IMG') {
        brokenCount++;
        setBrokenImageCount(brokenCount);
      }
    };

    container.addEventListener('error', handleImageError, true);

    // Report metric after initial render (throttled)
    const metricsTimer = setTimeout(() => {
      if (assets.length > 0) {
        trackBrokenImageRatio(brokenCount, assets.length);
      }
    }, 5000); // Wait 5s for images to load/fail

    return () => {
      container.removeEventListener('error', handleImageError, true);
      clearTimeout(metricsTimer);
    };
  }, [assets.length]);

  // Load more when scrolling near bottom
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onLoadMore || !hasMore || loading) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      if (scrollPercentage > 0.8) {
        onLoadMore();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [onLoadMore, hasMore, loading]);

  const handleFavoriteToggle = useCallback(
    (id: string, favorite: boolean) => {
      onAssetUpdate?.(id, { favorite });
    },
    [onAssetUpdate]
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center overflow-auto p-4" role="alert">
        <section className="w-full max-w-xl rounded-[var(--sploot-radius)] border-[3px] border-sploot-red bg-sploot-panel p-6 text-center sploot-shadow-sm">
          <p className="font-mono text-xs lowercase text-sploot-red">retrieval failed</p>
          <h2 className="mt-2 font-display text-2xl font-normal lowercase">the shelf is still here.</h2>
          <p className="mt-2 text-sm lowercase text-muted-foreground">{error}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 min-h-[var(--sploot-touch-target)] rounded-[var(--sploot-radius-pill)] border-[3px] border-sploot-ink bg-sploot-blue px-5 font-bold text-sploot-on-blue sploot-press"
            >
              try again
            </button>
          ) : null}
        </section>
      </div>
    );
  }

  // Show skeleton loaders during initial load
  if (assets.length === 0 && loading) {
    return (
      <div className="h-full">
        <div
          ref={setContainerRef}
          className={cn(IMAGE_GRID_SCROLL_CLASS, containerClassName)}
          style={{ scrollbarGutter: 'stable' }}
        >
          <ImageGridSkeleton count={20} variant="tile" className="animate-fade-in" />
        </div>
      </div>
    );
  }

  // Transitioning from skeleton to empty state
  // Show skeleton fading out for smooth transition
  if (assets.length === 0 && !loading && showingTransition) {
    return (
      <div className="h-full">
        <div
          ref={setContainerRef}
          className={cn(IMAGE_GRID_SCROLL_CLASS, containerClassName)}
          style={{ scrollbarGutter: 'stable' }}
        >
          <ImageGridSkeleton
            count={20}
            variant="tile"
            className="animate-fade-out opacity-0 transition-opacity duration-300 ease-out"
          />
        </div>
      </div>
    );
  }

  // Empty state
  // First-use renders the capture rig (demo pile + capture-surface activation,
  // docs/design/lab-074-capture-activation.html); its compact "upload chaos"
  // row is part of the rig, so the upload button stays on.
  // Fade in after skeleton transition completes
  if (assets.length === 0 && !loading) {
    return (
      <div className="animate-fade-in">
        <EmptyState
          variant={emptyStateVariant}
          searchQuery={emptyStateSearchQuery}
          onUploadClick={onUploadClick}
        />
      </div>
    );
  }

  // Render column-based masonry layout
  // Perfect vertical spacing within each column, natural tile flow
  return (
    <div className="h-full bg-sploot-workbench">
      <div
        ref={setContainerRef}
        className={cn(IMAGE_GRID_SCROLL_CLASS, containerClassName)}
        style={{ scrollbarGutter: 'stable' }}
      >
        <div
          role="list"
          aria-label="meme results"
          aria-busy={loading || undefined}
          className={cn(
            'grid grid-cols-2 items-start gap-2 p-3 sm:grid-cols-2 sm:gap-3 md:grid-cols-3 md:p-5 xl:grid-cols-4 motion-safe:transition-opacity motion-safe:duration-200',
            dimmed && 'opacity-45'
          )}
        >
          {assets.map((asset, index) => (
            <div
              key={asset.id}
              data-asset-id={asset.id}
              data-sploot-grid-item
              role="listitem"
              className="min-w-0"
              style={{
                // Cap the cascade so late/paginated tiles never wait seconds
                animation: `fadeInScale 300ms var(--sploot-ease-out) ${Math.min(index, 15) * 30}ms forwards`,
                opacity: 0,
              }}
            >
              <ImageTileErrorBoundary asset={asset} onDelete={onAssetDelete}>
                <ImageTile
                  asset={asset}
                  onFavorite={handleFavoriteToggle}
                  onDelete={onAssetDelete}
                  onSelect={onAssetSelect}
                  onAssetUpdate={onAssetUpdate}
                  showSimilarityScore={showSimilarityScores}
                  preserveAspectRatio
                  squareFrame
                />
              </ImageTileErrorBoundary>
            </div>
          ))}
        </div>

        {/* Loading indicator */}
        {loading && (
          <div className="py-8 text-center">
            <div className="inline-flex items-center gap-2 text-sploot-cyan">
              <svg
                className="animate-spin h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="font-mono text-sm">loading more...</span>
            </div>
          </div>
        )}

        {/* End of list indicator — a little toy sticker */}
        {!hasMore && assets.length > 0 && (
          <div className="flex justify-center py-6">
            <span className="inline-block -rotate-1 rounded-[var(--sploot-radius-pill)] border-[3px] border-sploot-ink bg-sploot-yellow px-4 py-1.5 font-mono text-xs lowercase text-[#1c1547] sploot-shadow-sm">
              end of the pile. go touch grass.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
