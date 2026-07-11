'use client';

import { useMemo, useState, useEffect, memo } from 'react';
import type { CSSProperties } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { error as logError } from '@/lib/logger';
import { DeleteConfirmationModal, useDeleteConfirmation } from '@/components/ui/delete-confirmation-modal';
import { useBlobCircuitBreaker } from '@/contexts/blob-circuit-breaker-context';
import { Button } from '@/components/ui/button';
import { ImageOff, Trash2, Loader2, AlertCircle, Clock } from 'lucide-react';
import type { Asset } from '@/lib/types';
import { useShareMeme } from './share-button';
import { logger } from '@/lib/observability-logger';
import { TileActionRail } from '@/components/sploot';
import { isAnimatedImageMimeType, isVideoMimeType } from '@sploot/common';
import { resolveQaSeedSrc } from '@/lib/qa/qa-image-loader';
import { SIMILARITY_MATCH_BOUNDARY, SIMILARITY_NEAR_BOUNDARY } from '@/lib/search-config';
import { postBlobLoadFailure } from '@/lib/telemetry-client';

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

  const { share: shareMeme, loading: shareLoading } = useShareMeme({
    assetId: asset.id,
    blobUrl: asset.blobUrl,
    filename: asset.filename,
    mimeType: asset.mime,
  });

  const handleFavoriteToggle = async () => {
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

  const handleDelete = async () => {
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

  // A found tile gets a candy shell: lime for a locked match, grape for a near
  // hit. The card keeps its ink shell + drop otherwise. Tokens only.
  const scoreCardClass = useMemo(() => {
    if (!showSimilarityScore) return null;
    const score = (asset as any).similarity;
    if (typeof score !== 'number') return null;

    if (score >= SIMILARITY_MATCH_BOUNDARY) {
      return 'border-sploot-lime';
    } else if (score >= SIMILARITY_NEAR_BOUNDARY) {
      return 'border-sploot-violet';
    }
    return null;
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

  const handleMediaLoadError = () => {
    setImageError(true);
    setImageLoaded(true);
    recordBlobError(404);

    void postBlobLoadFailure(hasTriedFallback).catch(() => {});
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
        className={cn(
          'sploot-press-sm group flex cursor-pointer flex-col overflow-hidden',
          'rounded-[var(--sploot-radius)] border-[3px] border-sploot-ink bg-sploot-panel sploot-shadow-sm',
          scoreCardClass
        )}
      >
        {/* Media frame — object-contain, never cropped, aspect preserved */}
        <div
          className={cn(
            'relative m-2 mb-0 overflow-hidden rounded-[var(--sploot-radius-inner)] border-2 border-sploot-ink bg-sploot-paper-warm',
            // No known dimensions -> stable square letterbox; the media still
            // renders complete via object-contain (never cropped).
            (!preserveAspectRatio || !aspectRatioStyle) && 'aspect-square'
          )}
          style={aspectRatioStyle}
        >
          {imageError ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-sploot-ink">
              <div className="flex flex-col items-center gap-2">
                <ImageOff className="h-10 w-10" />
                <p className="font-mono text-xs lowercase">image unavailable</p>
              </div>

              <Button
                variant="destructive"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                disabled={isLoading}
              >
                <Trash2 className="mr-1.5 h-3 w-3" />
                delete
              </Button>
            </div>
          ) : (
            <>
              {/* Quiet dimmed-panel pulse while the media loads */}
              {!imageLoaded && (
                <div aria-hidden className="absolute inset-0 overflow-hidden">
                  <div className="h-full w-full animate-pulse bg-sploot-paper-warm" />
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
                    handleMediaLoadError();
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

                    handleMediaLoadError();
                  }}
                />
              )}
            </>
          )}
        </div>

        {/* Machine metadata — mono, quiet, desktop-only per the mobile contract */}
        <div className="flex items-center justify-end gap-2 px-2.5 pt-1.5">
          <span className="hidden font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap sm:inline">
            {asset.width}×{asset.height} {formatFileSize(asset.size || 0)}
          </span>

          {typeof asset.relevance === 'number' && (
            <>
              <span className="hidden text-muted-foreground/30 sm:inline">|</span>
              <span
                className={cn(
                  'hidden font-mono text-xs tabular-nums sm:inline',
                  asset.belowThreshold ? 'text-sploot-orange' : 'text-sploot-lime'
                )}
              >
                {Math.round(asset.relevance)}%
              </span>
            </>
          )}

          {similarityScore !== null && (
            <>
              <span className="hidden text-muted-foreground/30 sm:inline">|</span>
              <span className="hidden font-mono text-xs text-sploot-cyan tabular-nums sm:inline">
                {similarityScore}
              </span>
            </>
          )}

          {embeddingStatusInfo && (
            <>
              <span className="hidden text-muted-foreground/30 sm:inline">|</span>
              <span className={cn('hidden shrink-0 font-mono text-xs sm:inline', embeddingStatusInfo.color)}>
                {embeddingStatusInfo.label}
              </span>
            </>
          )}
        </div>

        {/* Action rail — heart (banger) / share / delete, inside the card so it
            travels with the hover lift. Never over the media. */}
        <TileActionRail
          banger={!!asset.favorite}
          disabled={isLoading}
          shareLoading={shareLoading}
          onToggleBanger={handleFavoriteToggle}
          onShare={shareMeme}
          onDelete={handleDelete}
          className="mt-1.5 rounded-b-[calc(var(--sploot-radius)-3px)]"
        />

        {/* Debug info strip */}
        {isDebugMode && (embeddingStatus !== 'ready' || debugInfo.apiResponseTime) && (
          <div className="border-t-2 border-dashed border-sploot-ink px-2.5 py-1 font-mono text-[9px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="text-sploot-blue">debug:</span>
              <span>{embeddingStatus}</span>
              {asset.embeddingRetryCount !== undefined && <span>R{asset.embeddingRetryCount}</span>}
              {debugInfo.apiResponseTime && <span>{debugInfo.apiResponseTime}ms</span>}
            </div>
          </div>
        )}
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
