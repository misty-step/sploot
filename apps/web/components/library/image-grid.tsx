'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Masonry from 'react-masonry-css';
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
  hasMore?: boolean;
  onLoadMore?: () => void;
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
  hasMore = false,
  onLoadMore,
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
      // Start transition: show skeleton fading out
      setShowingTransition(true);
      const timer = setTimeout(() => {
        setShowingTransition(false);
      }, 300); // Match the fade-out duration
      return () => clearTimeout(timer);
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
  // Hide upload button since the main page toolbar already has a prominent one
  // Fade in after skeleton transition completes
  if (assets.length === 0 && !loading) {
    return (
      <div className="animate-fade-in">
        <EmptyState
          variant={emptyStateVariant}
          searchQuery={emptyStateSearchQuery}
          onUploadClick={onUploadClick}
          showUploadButton={false}
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
        <Masonry
          breakpointCols={IMAGE_GRID_BREAKPOINT_COLS}
          className="masonry-grid"
          columnClassName="masonry-grid-column"
        >
          {assets.map((asset, index) => (
            <div
              key={asset.id}
              className="masonry-item"
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
                />
              </ImageTileErrorBoundary>
            </div>
          ))}
        </Masonry>

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

        {/* End of list indicator */}
        {!hasMore && assets.length > 0 && (
          <div className="flex justify-center py-6">
            <span className="inline-block -rotate-1 border border-border bg-card px-3 py-1 font-mono text-xs uppercase tracking-wider text-muted-foreground sploot-sticker-shadow">
              end of the pile. go touch grass.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
