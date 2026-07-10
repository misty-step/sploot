'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Heart, Download, ImageOff, Loader2, Share2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShareMeme } from '@/components/library/share-button';
import { ImageGrid } from '@/components/library/image-grid';
import { StateSurface } from '@/components/sploot/state-surface';
import { IconButton, StatBlock, StickerTab } from '@/components/sploot';
import { DeleteConfirmationModal, useDeleteConfirmation } from '@/components/ui/delete-confirmation-modal';
import type { Asset } from '@/lib/types';
import { error as logError } from '@/lib/logger';
import { isAnimatedImageMimeType, isVideoMimeType } from '@sploot/common';
import { resolveQaSeedSrc } from '@/lib/qa/qa-image-loader';

// The sidebar keeps the read tight: a handful of scored neighbors beside the
// media, with the rest (if any) flowing into a full grid below the split.
const SIMILAR_SIDEBAR_LIMIT = 4;

interface MemeDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function MemeDetailPage({ params }: MemeDetailPageProps) {
  const router = useRouter();
  const [assetId, setAssetId] = useState<string | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [similarAssets, setSimilarAssets] = useState<Asset[]>([]);
  const [similarReason, setSimilarReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [similarLoading, setSimilarLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const similarAssetId = asset?.id;

  // Resolve params
  useEffect(() => {
    params.then(({ id }) => setAssetId(id));
  }, [params]);

  // Fetch asset details
  useEffect(() => {
    if (!assetId) return;

    async function fetchAsset() {
      try {
        const res = await fetch(`/api/assets/${assetId}`);
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        setAsset(data.asset);
      } catch (err) {
        logError('Failed to fetch asset:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAsset();
  }, [assetId]);

  // Fetch similar memes
  useEffect(() => {
    if (!assetId || !similarAssetId) {
      queueMicrotask(() => setSimilarLoading(false));
      return;
    }

    async function fetchSimilar() {
      setSimilarLoading(true);
      try {
        const res = await fetch(`/api/assets/${similarAssetId}/similar?limit=12`);
        if (!res.ok) {
          setSimilarLoading(false);
          return;
        }
        const data = await res.json();
        setSimilarAssets(data.results || []);
        setSimilarReason(data.reason ?? null);
      } catch (err) {
        logError('Failed to fetch similar assets:', err);
      } finally {
        setSimilarLoading(false);
      }
    }
    fetchSimilar();
  }, [assetId, similarAssetId]);

  const handleFavoriteToggle = useCallback(async () => {
    if (!asset || favoriteLoading) return;
    setFavoriteLoading(true);
    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !asset.favorite }),
      });
      if (res.ok) {
        setAsset((prev: Asset | null) => prev ? { ...prev, favorite: !prev.favorite } : prev);
      }
    } catch (err) {
      logError('Failed to toggle favorite:', err);
    } finally {
      setFavoriteLoading(false);
    }
  }, [asset, favoriteLoading]);

  const handleDownload = useCallback(async () => {
    if (!asset) return;
    try {
      const response = await fetch(asset.blobUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = asset.filename || asset.pathname?.split('/').pop() || 'meme';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      logError('Failed to download:', err);
    }
  }, [asset]);

  const handleSimilarAssetSelect = useCallback(
    (selected: Asset) => {
      router.push(`/app/meme/${selected.id}`);
    },
    [router]
  );

  // Delete reuses the same confirmation flow (and DELETE /api/assets/:id
  // endpoint) as the library grid's tile rail, so the "skip confirmation"
  // preference stays consistent across both surfaces.
  const {
    isOpen: isDeleteModalOpen,
    loading: isDeleting,
    setLoading: setIsDeleting,
    openConfirmation: openDeleteConfirmation,
    closeConfirmation: closeDeleteConfirmation,
  } = useDeleteConfirmation();

  const handleDeleteAsset = useCallback(async () => {
    if (!asset) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' });
      if (res.ok) {
        closeDeleteConfirmation();
        // replace, not push — Back must not resurrect the deleted meme's URL
        router.replace('/app');
      } else {
        throw new Error('Delete request failed');
      }
    } catch (err) {
      logError('Failed to delete asset:', err);
    } finally {
      setIsDeleting(false);
    }
  }, [asset, closeDeleteConfirmation, router, setIsDeleting]);

  const handleDeleteClick = useCallback(() => {
    if (!asset) return;
    const shouldSkip = openDeleteConfirmation({
      id: asset.id,
      imageUrl: asset.thumbnailUrl || asset.blobUrl,
      imageName: asset.filename,
    });
    if (shouldSkip) {
      handleDeleteAsset();
    }
  }, [asset, openDeleteConfirmation, handleDeleteAsset]);

  // Share runs the exact same flow as the library tile rail (native file share
  // → desktop image clipboard → share-link fallback), now driven by the shared
  // toybox IconButton so the three detail controls share one grammar.
  const { share: handleShare, loading: shareLoading } = useShareMeme({
    assetId: asset?.id ?? '',
    blobUrl: asset?.blobUrl,
    filename: asset?.filename,
    mimeType: asset?.mime,
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="sploot-shadow-sm border-[length:var(--sploot-active-border-width)] border-sploot-ink bg-sploot-paper px-5 py-4 font-mono text-sm font-bold lowercase tracking-normal text-sploot-ink">
          <Loader2 className="mr-2 inline-block size-4 animate-spin text-sploot-cyan" />
          loading this save...
        </div>
      </div>
    );
  }

  // Not found
  if (!asset) {
    return (
      <StateSurface
        size="panel"
        eyebrow="detail 404"
        title="that save left the pile."
        description="the detail route loaded, but this meme is gone, private, or never belonged to this library."
        primaryAction={{ href: '/app', label: 'open the pile' }}
        doodle="zzz"
        status={[
          { label: 'route', value: '/app/meme/:id' },
          { label: 'asset', value: 'miss' },
          { label: 'recovery', value: 'library', ok: true },
        ]}
      />
    );
  }

  const sidebarSimilar = similarAssets.slice(0, SIMILAR_SIDEBAR_LIMIT);
  const overflowSimilar = similarAssets.slice(SIMILAR_SIDEBAR_LIMIT);
  const vectorId = asset.embedding?.assetId ?? asset.id;
  // An embedding row exists from the moment processing starts — only call it
  // "embedded" once its status is ready (legacy rows have no status column).
  const embeddingReady =
    !!asset.embedding && (asset.embedding.status == null || asset.embedding.status === 'ready');
  const modelName = embeddingReady ? asset.embedding?.modelName : undefined;

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Back nav */}
      <div className="flex items-center px-4 py-3 sm:px-6 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
      </div>

      {/* Editorial split: uncropped media left, identity + actions + related sidebar right */}
      <div className="flex-1 grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,22rem)] lg:items-start">
        <div className="sploot-card flex items-center justify-center overflow-hidden p-4 sm:p-6">
          {imageError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <ImageOff className="h-16 w-16 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Image unavailable</p>
            </div>
          ) : isVideoMimeType(asset.mime) ? (
            <video
              src={resolveQaSeedSrc(asset.blobUrl)}
              poster={asset.thumbnailUrl ? resolveQaSeedSrc(asset.thumbnailUrl) : undefined}
              controls
              autoPlay
              loop
              playsInline
              className="w-full h-auto max-h-[75vh] object-contain"
              onError={() => setImageError(true)}
            />
          ) : (
            <Image
              src={resolveQaSeedSrc(asset.blobUrl)}
              alt={asset.filename || 'Meme'}
              width={asset.width || 1200}
              height={asset.height || 630}
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 80vw, 60vw"
              className="w-full h-auto max-h-[75vh] object-contain"
              priority
              quality={90}
              unoptimized={isAnimatedImageMimeType(asset.mime)}
              onError={() => setImageError(true)}
            />
          )}
        </div>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-6">
          <div className="space-y-2">
            <StickerTab tone="cyan">meme detail</StickerTab>
            <h1 className="font-display text-3xl leading-[0.95] text-foreground sm:text-4xl break-words">
              {asset.filename || 'untitled save'}
            </h1>
          </div>

          {/* Identical-grammar action trio: same IconButton, same size, never mixed raised/flat */}
          <div className="flex items-center gap-1.5" role="group" aria-label="meme actions">
            <IconButton
              label={asset.favorite ? 'remove banger' : 'mark as banger'}
              pressed={asset.favorite}
              onClick={handleFavoriteToggle}
              disabled={favoriteLoading}
              className={asset.favorite ? '!bg-transparent !text-sploot-magenta' : undefined}
            >
              <Heart fill={asset.favorite ? 'currentColor' : 'none'} />
            </IconButton>
            <IconButton label="share meme" onClick={handleShare} disabled={shareLoading}>
              {shareLoading ? <Loader2 className="animate-spin" /> : <Share2 />}
            </IconButton>
            <IconButton label="delete meme" onClick={handleDeleteClick}>
              <Trash2 />
            </IconButton>
          </div>

          {/* Candy stat toys */}
          <div className="grid grid-cols-2 gap-2.5">
            <StatBlock
              label="vector id"
              value={<span className="text-lg sm:text-xl">#{vectorId.slice(0, 8)}</span>}
            />
            <StatBlock
              label="dims · size"
              value={
                <span className="flex flex-col text-lg leading-tight sm:text-xl">
                  {asset.width && asset.height ? `${asset.width}×${asset.height}` : '—'}
                  <span className="font-sans text-xs font-normal normal-case opacity-70">
                    {asset.size > 0 ? formatFileSize(asset.size) : ''}
                  </span>
                </span>
              }
            />
          </div>

          <p className="min-w-0 break-words font-mono text-xs lowercase text-muted-foreground">
            saved {formatDate(asset.createdAt)} · {asset.mime}
            {modelName ? ` · embedded with ${modelName}` : ' · embedding pending'}
          </p>

          {asset.tags && asset.tags.length > 0 && (
            <p className="min-w-0 break-words font-mono text-xs lowercase text-muted-foreground">
              tags: {asset.tags.map((t) => t.name).join(', ')}
            </p>
          )}

          {/* Similar saves — always present; quiet notes cover the not-ready states */}
          <div className="space-y-2.5 border-t-2 border-dashed border-border pt-4">
            <div className="flex items-baseline justify-between gap-2">
              <StickerTab tone="lime">similar saves</StickerTab>
              <span className="font-mono text-[0.65rem] lowercase text-muted-foreground/70">
                ranked by cosine similarity
              </span>
            </div>

            {similarLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : sidebarSimilar.length === 0 ? (
              <p className="font-mono text-xs lowercase text-muted-foreground">
                {similarReason === 'source-unembedded'
                  ? 'still embedding this one. related memes show up once its vector is ready.'
                  : 'nothing else in the pile lands close yet. save a few more and they will show up here.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {sidebarSimilar.map((similar) => (
                  <li key={similar.id}>
                    <button
                      type="button"
                      onClick={() => handleSimilarAssetSelect(similar)}
                      className="sploot-press-sm flex w-full items-center gap-2.5 rounded-[var(--sploot-radius-inner)] border-2 border-sploot-ink bg-sploot-panel p-1.5 text-left"
                    >
                      <span className="relative size-11 shrink-0 overflow-hidden rounded-[calc(var(--sploot-radius-inner)-2px)] bg-sploot-paper-warm">
                        {isVideoMimeType(similar.mime) && !similar.thumbnailUrl ? (
                          <span className="flex h-full w-full items-center justify-center font-mono text-[0.6rem] font-bold lowercase text-muted-foreground">
                            {similar.mime.split('/')[1] ?? 'video'}
                          </span>
                        ) : (
                          <Image
                            src={resolveQaSeedSrc(similar.thumbnailUrl || similar.blobUrl)}
                            alt={similar.filename || 'Similar meme'}
                            fill
                            sizes="44px"
                            className="object-cover"
                            unoptimized={isAnimatedImageMimeType(similar.mime)}
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                        {similar.filename || 'untitled save'}
                      </span>
                      <span className="sploot-sticker-shadow shrink-0 rounded-[var(--sploot-radius-pill)] border-2 border-sploot-ink bg-sploot-yellow px-2 py-0.5 font-mono text-[0.65rem] font-bold text-[#1c1547]">
                        {Math.round(similar.relevance ?? (similar.similarity ?? 0) * 100)}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 self-start font-mono text-xs lowercase text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="size-3.5" />
            download original
          </button>
        </aside>
      </div>

      {/* Overflow: remaining related memes that didn't fit the sidebar */}
      {overflowSimilar.length > 0 && (
        <div className="border-t border-border">
          <div className="px-4 sm:px-6 pt-6 pb-2">
            <h2 className="font-display text-2xl tracking-wider text-foreground">
              MORE FROM THE PILE
            </h2>
            <p className="text-xs text-muted-foreground font-mono mt-1">
              semantically similar via CLIP embeddings
            </p>
          </div>
          <ImageGrid
            assets={overflowSimilar}
            onAssetSelect={handleSimilarAssetSelect}
            showSimilarityScores
          />
        </div>
      )}

      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteConfirmation}
        onConfirm={handleDeleteAsset}
        title="Delete meme"
        description="Are you sure you want to delete this meme? This action cannot be undone."
        imageUrl={asset.thumbnailUrl || asset.blobUrl}
        imageName={asset.filename}
        loading={isDeleting}
        showDontAskAgain={true}
      />
    </div>
  );
}
