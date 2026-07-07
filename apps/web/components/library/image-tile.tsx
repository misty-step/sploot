'use client';

import { useMemo, useState, useEffect, memo } from 'react';
import type { CSSProperties } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { error as logError } from '@/lib/logger';
import { DeleteConfirmationModal, useDeleteConfirmation } from '@/components/ui/delete-confirmation-modal';
import { useBlobCircuitBreaker } from '@/contexts/blob-circuit-breaker-context';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Heart, Trash2, ImageOff, Loader2, AlertCircle, Clock } from 'lucide-react';
import type { Asset } from '@/lib/types';
import { ShareButton } from './share-button';
import { logger } from '@/lib/observability-logger';
import { BangerStamp } from '@/components/sploot';
import { isAnimatedImageMimeType, isVideoMimeType } from '@sploot/common';
import { resolveQaSeedSrc } from '@/lib/qa/qa-image-loader';
import { SIMILARITY_MATCH_BOUNDARY, SIMILARITY_NEAR_BOUNDARY } from '@/lib/search-config';

interface ImageTileProps {
  asset: Asset;
  onFavorite?: (id: string, favorite: boolean) => void;
  onDelete?: (id: string) => void;
  onSelect?: (asset: Asset) => void;
  onToggleFavorite?: () => void;
  preserveAspectRatio?: boolean;
  onClick?: () => void;
  onAssetUpdate?: (id: string, updates: Partial<Asset>) => void;
  showSimilarityScore?: boolean;
}

type EmbeddingStatusType = 'pending' | 'processing' | 'ready' | 'failed';

function ImageTileComponent({
  asset,
  onFavorite,
  onDelete,
  onSelect,
  onToggleFavorite,
  preserveAspectRatio = true,
  onClick,
  onAssetUpdate,
  showSimilarityScore = false,
}: ImageTileProps) {
  const isVideo = isVideoMimeType(asset.mime);
  const isAnimatedImage = isAnimatedImageMimeType(asset.mime);
  const [isLoading, setIsLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSrc, setImageSrc] = useState(() =>
    getTileImageSrc(asset.mime, asset.blobUrl, asset.thumbnailUrl)
  );
  const [hasTriedFallback, setHasTriedFallback] = useState(false);
  const [isGeneratingEmbedding, setIsGeneratingEmbedding] = useState(false);
  const [hasEmbedding, setHasEmbedding] = useState(!!asset.embedding);
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatusType>(() => {
    if (asset.embedding) return 'ready';
    if (asset.embeddingStatus === 'failed') return 'failed';
    if (asset.embeddingStatus === 'processing') return 'processing';
    return 'pending';
  });
  const deleteConfirmation = useDeleteConfirmation();
  const { recordBlobError, recordBlobSuccess } = useBlobCircuitBreaker();

  // Debug mode tracking
  const [debugInfo, setDebugInfo] = useState<{
    queuePosition?: number;
    apiResponseTime?: number;
    lastTransition?: string;
  }>({});
  const [isDebugMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('debug_embeddings') === 'true';
    }
    return false;
  });

  // Reset image src when asset changes (e.g., component reused)
  useEffect(() => {
    queueMicrotask(() => {
      setImageSrc(getTileImageSrc(asset.mime, asset.blobUrl, asset.thumbnailUrl));
      setHasTriedFallback(false);
      setImageError(false);
      setImageLoaded(false);
    });
  }, [asset.id, asset.blobUrl, asset.thumbnailUrl, asset.mime]);

  // Simulate queue position in debug mode
  useEffect(() => {
    if (isDebugMode && embeddingStatus === 'processing' && !debugInfo.queuePosition) {
      const simulatedPosition = Math.floor(Math.random() * 5) + 1;
      queueMicrotask(() => {
        setDebugInfo((prev) => ({ ...prev, queuePosition: simulatedPosition }));
      });
      logger.logInfo('image-tile.debug.queue-position', {
        assetId: asset.id,
        simulatedPosition,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDebugMode, embeddingStatus, asset.id]);

  const handleEmbeddingSuccess = (result?: {
    embedding?: { modelName: string; dimension: number; createdAt: string };
  }) => {
    if (isDebugMode) {
      logger.logInfo('image-tile.debug.embedding-success', {
        assetId: asset.id,
        result,
      });
      setDebugInfo((prev) => ({ ...prev, lastTransition: 'processing → ready' }));
    }
    setHasEmbedding(true);
    setEmbeddingStatus('ready');

    if (onAssetUpdate) {
      const embeddingInfo = result?.embedding;
      const modelName = embeddingInfo?.modelName ?? 'unknown/model';
      const createdAt = embeddingInfo?.createdAt ?? new Date().toISOString();

      onAssetUpdate(asset.id, {
        embedding: {
          assetId: asset.id,
          modelName,
          modelVersion: modelName,
          createdAt,
        },
      });
    }
  };

  // Auto-retry removed: rely on server-side scheduling + manual retry button

  // Log initial status and transitions in debug mode
  useEffect(() => {
    if (isDebugMode) {
      logger.logInfo('image-tile.debug.initial-status', {
        assetId: asset.id,
        status: embeddingStatus,
        error: asset.embeddingError,
        retryCount: asset.embeddingRetryCount,
        lastAttempt: asset.embeddingLastAttempt,
      });
    }
  }, [
    isDebugMode,
    asset.id,
    embeddingStatus,
    asset.embeddingError,
    asset.embeddingRetryCount,
    asset.embeddingLastAttempt,
  ]);

  // Log status changes in debug mode
  useEffect(() => {
    if (isDebugMode) {
      logger.logInfo('image-tile.debug.status-change', {
        assetId: asset.id,
        status: embeddingStatus,
      });
    }
  }, [embeddingStatus, isDebugMode, asset.id]);

  const aspectRatioStyle = useMemo<CSSProperties | undefined>(() => {
    if (!preserveAspectRatio) return undefined;
    if (!asset.width || !asset.height) return undefined;
    if (asset.width <= 0 || asset.height <= 0) return undefined;

    return { aspectRatio: `${asset.width} / ${asset.height}` };
  }, [preserveAspectRatio, asset.width, asset.height]);

  const handleFavoriteToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleFavorite) {
      onToggleFavorite();
      return;
    }
    if (!onFavorite || isLoading) return;

    setIsLoading(true);
    try {
      await fetch(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !asset.favorite }),
      });
      onFavorite(asset.id, !asset.favorite);
    } catch (error) {
      logError('Failed to toggle favorite:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateEmbedding = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGeneratingEmbedding || hasEmbedding) return;

    const startTime = Date.now();
    if (isDebugMode) {
      logger.logInfo('image-tile.debug.manual-trigger', {
        assetId: asset.id,
        previousStatus: embeddingStatus,
      });
      setDebugInfo((prev) => ({ ...prev, lastTransition: `${embeddingStatus} → processing (manual)` }));
    }

    setIsGeneratingEmbedding(true);
    setEmbeddingStatus('processing');
    try {
      const response = await fetch(`/api/assets/${asset.id}/generate-embedding`, {
        method: 'POST',
      });

      const apiResponseTime = Date.now() - startTime;
      if (isDebugMode) {
        logger.logInfo('image-tile.debug.api-response', {
          assetId: asset.id,
          durationMs: apiResponseTime,
        });
        setDebugInfo((prev) => ({ ...prev, apiResponseTime }));
      }

      if (response.ok) {
        const result = await response.json();
        if (isDebugMode) {
          logger.logInfo('image-tile.debug.manual-success', {
            assetId: asset.id,
            result,
          });
        }
        if (result?.success && result?.embedding) {
          handleEmbeddingSuccess(result);
        } else if (result?.status === 'ready') {
          if (isDebugMode) {
            logger.logInfo('image-tile.debug.manual-ready', {
              assetId: asset.id,
              result,
            });
            setDebugInfo((prev) => ({ ...prev, lastTransition: 'processing → ready (no payload)' }));
          }
          setHasEmbedding(true);
          setEmbeddingStatus('ready');
        } else if (result?.status === 'processing') {
          setEmbeddingStatus('processing');
        } else {
          setEmbeddingStatus('failed');
        }
      } else {
        const errorText = await response.text();
        if (isDebugMode) {
          console.error(`[debug_embeddings] Asset ${asset.id}: Failed to generate embedding - ${response.status}`);
          console.error('[debug_embeddings] Error response:', errorText);
          setDebugInfo((prev) => ({ ...prev, lastTransition: 'processing → failed' }));
        }
        setEmbeddingStatus('failed');
      }
    } catch (error) {
      if (isDebugMode) {
        console.error(`[debug_embeddings] Asset ${asset.id}: Exception during embedding generation:`, error);
        setDebugInfo((prev) => ({ ...prev, lastTransition: 'processing → failed (exception)' }));
      }
      logError('Failed to generate embedding:', error);
      setEmbeddingStatus('failed');
    } finally {
      setIsGeneratingEmbedding(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete || isLoading) return;

    const shouldDelete = deleteConfirmation.openConfirmation({
      id: asset.id,
      imageUrl: asset.thumbnailUrl || asset.blobUrl,
      imageName: asset.filename || asset.pathname?.split('/').pop() || 'Unnamed image',
    });

    if (shouldDelete) {
      performDelete();
    }
  };

  const performDelete = async () => {
    setIsLoading(true);
    deleteConfirmation.setLoading(true);
    try {
      await fetch(`/api/assets/${asset.id}`, {
        method: 'DELETE',
      });
      onDelete!(asset.id);
      deleteConfirmation.closeConfirmation();
    } catch (error) {
      logError('Failed to delete asset:', error);
    } finally {
      setIsLoading(false);
      deleteConfirmation.setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Extract similarity score from search results
  const similarityScore = useMemo(() => {
    if (!showSimilarityScore) return null;
    const score = (asset as any).similarity;
    if (typeof score !== 'number') return null;
    return score.toFixed(2);
  }, [showSimilarityScore, asset]);

  // Determine border color based on similarity score
  const scoreBorderStyle = useMemo(() => {
    if (!showSimilarityScore) return null;
    const score = (asset as any).similarity;
    if (typeof score !== 'number') return null;

    if (score >= SIMILARITY_MATCH_BOUNDARY) {
      return 'border-sploot-cyan shadow-[0_0_0_2px_var(--sploot-cyan),0_0_12px_color-mix(in_srgb,var(--sploot-cyan)_28%,transparent)]';
    } else if (score >= SIMILARITY_NEAR_BOUNDARY) {
      return 'border-sploot-violet shadow-[0_0_0_2px_var(--sploot-violet),0_0_12px_color-mix(in_srgb,var(--sploot-violet)_28%,transparent)]';
    }
    return 'border-border shadow-[0_0_0_2px_hsl(var(--border))]';
  }, [showSimilarityScore, asset]);

  // Get embedding status icon and label (minimalist aesthetic)
  const getEmbeddingStatusIcon = () => {
    switch (embeddingStatus) {
      case 'ready':
        return null; // Hide embedded status (default state)
      case 'processing':
        return { icon: Loader2, label: 'processing', color: 'text-muted-foreground' };
      case 'pending':
        return { icon: Clock, label: 'pending', color: 'text-muted-foreground' };
      case 'failed':
        return { icon: AlertCircle, label: 'failed', color: 'text-destructive' };
      default:
        return null;
    }
  };

  const embeddingStatusInfo = getEmbeddingStatusIcon();

  const handleMediaLoadError = (failedUrl: string) => {
    setImageError(true);
    setImageLoaded(true);
    recordBlobError(404);

    // Send telemetry (fire-and-forget)
    fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetId: asset.id,
        blobUrl: failedUrl,
        errorType: 'blob_load_failure',
        timestamp: Date.now(),
        fallbackAttempted: hasTriedFallback,
      }),
    }).catch(() => {});
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`open ${asset.filename || asset.pathname?.split('/').pop() || 'meme'}`}
        onClick={onClick || (() => onSelect?.(asset))}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (onClick || (() => onSelect?.(asset)))();
          }
        }}
        className="group overflow-hidden cursor-pointer border border-border transition-all duration-[var(--sploot-motion-base)] hover:-translate-y-0.5 hover:border-sploot-ink hover:shadow-[3px_3px_0_var(--sploot-ink)]"
      >
        <div className="relative">
          {/* Image container */}
          <div
            className={cn('relative bg-muted overflow-hidden', !preserveAspectRatio && 'aspect-square')}
            style={aspectRatioStyle}
          >
            {imageError ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOff className="w-12 h-12" />
                  <p className="text-xs text-center">Image unavailable</p>
                </div>

                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isLoading}>
                  <Trash2 className="w-3 h-3 mr-1.5" />
                  Delete
                </Button>
              </div>
            ) : (
              <>
                {/* Skeleton placeholder */}
                {!imageLoaded && (
                  <div aria-hidden className="absolute inset-0 overflow-hidden">
                    <div className="h-full w-full bg-muted animate-pulse" />
                  </div>
                )}
                {isVideo ? (
                  <video
                    key={asset.blobUrl}
                    aria-label={`play ${asset.filename || asset.pathname?.split('/').pop() || 'meme'}`}
                    className={cn(
                      'h-full w-full',
                      preserveAspectRatio ? 'object-contain' : 'object-cover'
                    )}
                    poster={asset.thumbnailUrl ? resolveQaSeedSrc(asset.thumbnailUrl) : undefined}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onLoadedData={() => {
                      setImageLoaded(true);
                      recordBlobSuccess();
                    }}
                    onError={() => {
                      handleMediaLoadError(asset.blobUrl);
                    }}
                  >
                    <source src={resolveQaSeedSrc(asset.blobUrl)} type={asset.mime} />
                  </video>
                ) : (
                  <Image
                    key={imageSrc}
                    src={imageSrc}
                    alt={asset.filename || asset.pathname?.split('/').pop() || 'Uploaded image'}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                    className={cn(
                      'h-full w-full',
                      preserveAspectRatio ? 'object-contain' : 'object-cover'
                    )}
                    loading="lazy"
                    // Grid tiles source the pre-built ~256px thumbnail (the
                    // list/shuffle/search/similar reads return thumbnailUrl as of
                    // 048), so the optimizer would add transform + cache-write cost
                    // for no benefit — serve it directly. The detail/share pages
                    // stay optimized. See ADR-008.
                    unoptimized
                    onLoad={() => {
                      setImageLoaded(true);
                      recordBlobSuccess();
                    }}
                    onError={() => {
                      // If thumbnail failed and we haven't tried the main blob yet
                      if (imageSrc === asset.thumbnailUrl && asset.blobUrl && !hasTriedFallback) {
                        logger.logInfo('image-tile.thumbnail-fallback', {
                          assetId: asset.id,
                        });
                        setHasTriedFallback(true);
                        setImageSrc(asset.blobUrl);
                        // Don't set imageError yet - give the fallback a chance
                        return;
                      }

                      handleMediaLoadError(imageSrc);
                    }}
                  />
                )}
              </>
            )}


            {/* Banger stamp - slapped on the artwork like a sticker */}
            {asset.favorite && !imageError && (
              <div className="absolute top-2 left-2 z-10 -rotate-6">
                <BangerStamp className="animate-sploot-stamp sploot-sticker-shadow" />
              </div>
            )}

            {/* Similarity score overlay */}
            {similarityScore !== null && (
              <div className="absolute top-2 right-2 z-10">
                <div className="border border-sploot-violet bg-black/80 px-2 py-1">
                  <span className="font-mono text-xs text-sploot-cyan sploot-tabular">{similarityScore}</span>
                </div>
              </div>
            )}
          </div>

          {/* Action bar below image */}
          <div className="flex items-center justify-between gap-2 px-2 py-2 bg-card dark:bg-muted border-t border-border sm:py-1.5">
            {/* Left: Actions */}
            <div className="flex items-center gap-1.5 sm:gap-1">
              {/* Banger button - always visible */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-11 w-11 rounded-none transition-colors hover:bg-sploot-coral hover:text-black sm:h-7 sm:w-7',
                        asset.favorite
                          ? 'text-sploot-coral'
                          : 'text-muted-foreground/80'
                      )}
                      onClick={handleFavoriteToggle}
                      disabled={isLoading}
                      aria-pressed={asset.favorite}
                      aria-label={asset.favorite ? 'remove banger' : 'mark as banger'}
                    >
                      <Heart
                        className={cn('h-5 w-5 sm:h-4 sm:w-4', asset.favorite && 'fill-current')}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{asset.favorite ? 'unfavorite' : 'favorite'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Share button - always visible with hover color transition */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ShareButton
                      assetId={asset.id}
                      blobUrl={asset.blobUrl}
                      filename={asset.filename}
                      mimeType={asset.mime}
                      size="icon"
                      className="h-11 w-11 rounded-none transition-colors text-muted-foreground/60 hover:bg-sploot-cyan hover:text-black sm:h-7 sm:w-7"
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>share</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Delete button - direct on mobile so there is no one-item overflow menu */}
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-none transition-colors text-muted-foreground/60 hover:bg-destructive hover:text-white sm:h-7 sm:w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(e);
                }}
                disabled={isLoading}
                aria-label="delete meme"
                title="delete"
              >
                <Trash2 className="h-5 w-5 sm:h-4 sm:w-4" />
              </Button>
            </div>

            {/* Right: Metadata */}
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              {/* Dimensions and size - monospace for technical data */}
              <span className="hidden font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap sm:inline">
                {asset.width}×{asset.height} {formatFileSize(asset.size || 0)}
              </span>

              {/* Relevance score - search results only */}
              {typeof asset.relevance === 'number' && (
                <>
                  <span className="hidden text-muted-foreground/30 sm:inline">|</span>
                  <span
                    className={cn(
                      'hidden font-mono text-xs tabular-nums sm:inline',
                      asset.belowThreshold ? 'text-orange-400' : 'text-green-400'
                    )}
                  >
                    {Math.round(asset.relevance)}%
                  </span>
                </>
              )}

              {/* Embedding status - only show if not ready */}
              {embeddingStatusInfo && (
                <>
                  <span className="hidden text-muted-foreground/30 sm:inline">|</span>
                  <span className={cn('hidden text-xs shrink-0 sm:inline', embeddingStatusInfo.color)}>
                    {embeddingStatusInfo.label}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Debug info overlay */}
          {isDebugMode && (embeddingStatus !== 'ready' || debugInfo.apiResponseTime) && (
            <div className="px-2 py-1 bg-black/80 text-[9px] font-mono text-muted-foreground border-t border-border">
              <div className="flex items-center gap-2">
                <span className="text-primary">Debug:</span>
                <span>{embeddingStatus}</span>
                {asset.embeddingRetryCount !== undefined && <span>R{asset.embeddingRetryCount}</span>}
                {debugInfo.apiResponseTime && <span>{debugInfo.apiResponseTime}ms</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.targetAsset && (
        <DeleteConfirmationModal
          isOpen={deleteConfirmation.isOpen}
          onClose={deleteConfirmation.closeConfirmation}
          onConfirm={performDelete}
          imageUrl={deleteConfirmation.targetAsset.imageUrl}
          imageName={deleteConfirmation.targetAsset.imageName}
          loading={deleteConfirmation.loading}
        />
      )}
    </>
  );
}

/**
 * Custom comparison function for React.memo optimization.
 *
 * IMPORTANT: This function intentionally skips comparison of function props (onClick, onToggleFavorite, etc.)
 * because it assumes parent components wrap these callbacks in useCallback with stable dependencies.
 *
 * **Parent Component Requirements:**
 * ```tsx
 * // ✅ CORRECT - Callbacks wrapped in useCallback
 * const handleClick = useCallback((assetId: string) => {
 *   navigateToAsset(assetId);
 * }, []); // Empty deps if truly stable
 *
 * const handleToggleFavorite = useCallback(async (assetId: string) => {
 *   await updateFavorite(assetId);
 * }, []); // Or include necessary deps
 *
 * <ImageTile onClick={handleClick} onToggleFavorite={handleToggleFavorite} />
 * ```
 *
 * ```tsx
 * // ❌ WRONG - Inline functions recreated on every render
 * <ImageTile
 *   onClick={(id) => navigateToAsset(id)}
 *   onToggleFavorite={async (id) => await updateFavorite(id)}
 * />
 * // This causes ALL tiles to re-render on parent state changes!
 * ```
 *
 * **Consequences of violating this assumption:**
 * - Every parent re-render triggers re-render of ALL ImageTile instances
 * - Defeats the purpose of React.memo optimization
 * - Significant performance degradation with 100+ images in grid
 * - May cause frame drops during scroll on lower-end devices
 *
 * **Why we skip function comparison:**
 * - Comparing functions by reference is unreliable (new function !== new function)
 * - If parent follows useCallback pattern, functions are stable by reference
 * - This allows grid to skip re-renders when parent state changes unrelated to tiles
 *
 * Only re-renders if visual props change (asset data, favorite status, embedding status, etc.)
 */
function arePropsEqual(prevProps: ImageTileProps, nextProps: ImageTileProps) {
  // Always re-render if asset ID changed (different image)
  if (prevProps.asset.id !== nextProps.asset.id) return false;

  // Re-render if URLs changed
  if (prevProps.asset.blobUrl !== nextProps.asset.blobUrl) return false;
  if (prevProps.asset.thumbnailUrl !== nextProps.asset.thumbnailUrl) return false;
  if (prevProps.asset.mime !== nextProps.asset.mime) return false;

  // Re-render if favorite status changed
  if (prevProps.asset.favorite !== nextProps.asset.favorite) return false;

  // Re-render if embedding status changed
  if (prevProps.asset.embeddingStatus !== nextProps.asset.embeddingStatus) return false;
  if (!!prevProps.asset.embedding !== !!nextProps.asset.embedding) return false;

  // Re-render if relevance score changed (for search results)
  if (prevProps.asset.relevance !== nextProps.asset.relevance) return false;

  // Re-render if preserveAspectRatio prop changed
  if (prevProps.preserveAspectRatio !== nextProps.preserveAspectRatio) return false;

  // Re-render if showSimilarityScore prop changed
  if (prevProps.showSimilarityScore !== nextProps.showSimilarityScore) return false;

  // Re-render if similarity score changed (for search results)
  const prevSimilarity = (prevProps.asset as any).similarity;
  const nextSimilarity = (nextProps.asset as any).similarity;
  if (prevSimilarity !== nextSimilarity) return false;

  // Ignore function prop changes - they're stable via useCallback (see JSDoc above)
  // This prevents unnecessary re-renders when parent re-renders

  // All relevant props are equal, skip re-render
  return true;
}

// Export memoized version to prevent unnecessary re-renders
export const ImageTile = memo(ImageTileComponent, arePropsEqual);

function getTileImageSrc(
  mimeType: string,
  blobUrl: string,
  thumbnailUrl?: string | null
): string {
  if (isAnimatedImageMimeType(mimeType)) {
    return resolveQaSeedSrc(blobUrl);
  }

  return resolveQaSeedSrc(thumbnailUrl || blobUrl);
}
