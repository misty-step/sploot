'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Heart, Download, ImageOff, Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShareMeme } from '@/components/library/share-button';
import { ImageGrid } from '@/components/library/image-grid';
import { StateSurface } from '@/components/sploot/state-surface';
import { IconButton } from '@/components/sploot';
import type { Asset } from '@/lib/types';
import { error as logError } from '@/lib/logger';
import { isAnimatedImageMimeType, isVideoMimeType } from '@sploot/common';
import { resolveQaSeedSrc } from '@/lib/qa/qa-image-loader';

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

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-6 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>

        <div className="flex items-center gap-1.5">
          {/* Favorite — banger heart (filled = banger) */}
          <IconButton
            label={asset.favorite ? 'remove banger' : 'mark as banger'}
            pressed={asset.favorite}
            onClick={handleFavoriteToggle}
            disabled={favoriteLoading}
          >
            <Heart fill={asset.favorite ? 'currentColor' : 'none'} />
          </IconButton>

          {/* Share */}
          <IconButton label="share meme" onClick={handleShare} disabled={shareLoading}>
            {shareLoading ? <Loader2 className="animate-spin" /> : <Share2 />}
          </IconButton>

          {/* Download */}
          <IconButton label="download meme" onClick={handleDownload}>
            <Download />
          </IconButton>
        </div>
      </div>

      {/* Main meme view */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="relative max-w-4xl w-full">
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
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 900px"
              className="w-full h-auto max-h-[75vh] object-contain"
              priority
              quality={90}
              unoptimized={isAnimatedImageMimeType(asset.mime)}
              onError={() => setImageError(true)}
            />
          )}
        </div>
      </div>

      {/* Metadata bar */}
      <div className="flex items-center justify-center px-4 py-2 border-t border-border">
        <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
          {asset.width && asset.height && (
            <span className="tabular-nums">{asset.width}x{asset.height}</span>
          )}
          {asset.size > 0 && (
            <>
              <span className="text-muted-foreground/30">|</span>
              <span className="tabular-nums">{formatFileSize(asset.size)}</span>
            </>
          )}
          <span className="text-muted-foreground/30">|</span>
          <span>{asset.mime}</span>
          <span className="text-muted-foreground/30">|</span>
          <span>{formatDate(asset.createdAt)}</span>
          {asset.tags && asset.tags.length > 0 && (
            <>
              <span className="text-muted-foreground/30">|</span>
              <span>{asset.tags.map((t: { name: string }) => t.name).join(', ')}</span>
            </>
          )}
        </div>
      </div>

      {/* Related memes section */}
      <div className="border-t border-border">
        <div className="px-4 sm:px-6 pt-6 pb-2">
          <h2
            className="text-2xl tracking-wider text-foreground"
            style={{ fontFamily: 'var(--font-bebas-neue)' }}
          >
            RELATED MEMES
          </h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            semantically similar via CLIP embeddings
          </p>
        </div>

        {similarLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : similarAssets.length === 0 ? (
          <div className="px-4 sm:px-6 pb-12 pt-2">
            <p className="font-mono text-xs lowercase text-muted-foreground">
              {similarReason === 'source-unembedded'
                ? 'still embedding this one. related memes show up once its vector is ready.'
                : 'nothing else in the pile lands close yet. save a few more and they will show up here.'}
            </p>
          </div>
        ) : (
          <ImageGrid
            assets={similarAssets}
            onAssetSelect={handleSimilarAssetSelect}
            showSimilarityScores
          />
        )}
      </div>
    </div>
  );
}
