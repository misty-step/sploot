'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Heart, Download, ImageOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/library/share-button';
import { ImageGrid } from '@/components/library/image-grid';
import { StateSurface } from '@/components/sploot/state-surface';
import { cn } from '@/lib/utils';
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
    <main aria-label="meme detail" className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="border-b border-border px-4 py-2 sm:px-6">
        <Button
          variant="compact"
          size="sm"
          onClick={() => router.back()}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          back to the pile
        </Button>
      </div>

      <div className="grid min-h-[calc(100vh-7rem)] lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.55fr)]">
        <section
          role="group"
          aria-label="full meme"
          className="flex min-h-[55vh] items-center justify-center bg-sploot-paper-warm p-3 sm:p-6 lg:min-h-[calc(100vh-7rem)]"
        >
          <div className="relative flex h-full w-full items-center justify-center">
            {imageError ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <ImageOff className="h-16 w-16 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">image unavailable</p>
              </div>
            ) : isVideoMimeType(asset.mime) ? (
              <video
                src={resolveQaSeedSrc(asset.blobUrl)}
                poster={asset.thumbnailUrl ? resolveQaSeedSrc(asset.thumbnailUrl) : undefined}
                controls
                autoPlay
                loop
                playsInline
                className="h-auto max-h-[82vh] w-full object-contain"
                onError={() => setImageError(true)}
              />
            ) : (
              <Image
                src={resolveQaSeedSrc(asset.blobUrl)}
                alt={asset.filename || 'meme'}
                width={asset.width || 1200}
                height={asset.height || 630}
                sizes="(max-width: 1024px) 100vw, 72vw"
                className="h-auto max-h-[82vh] w-full object-contain"
                priority
                quality={90}
                unoptimized={isAnimatedImageMimeType(asset.mime)}
                onError={() => setImageError(true)}
              />
            )}
          </div>
        </section>

        <aside className="border-t border-sploot-ink bg-sploot-paper p-5 lg:border-l lg:border-t-0 lg:p-8">
          <p className="font-mono text-xs uppercase text-muted-foreground">from the pile</p>
          <h1 className="mt-3 break-words font-display text-3xl uppercase leading-none text-sploot-ink text-balance sm:text-4xl">
            {asset.filename || asset.pathname?.split('/').pop() || 'untitled meme'}
          </h1>

          <div role="group" aria-label="meme actions" className="mt-6 flex flex-wrap items-center gap-2 border-y border-border py-3">
            <Button
              variant="compact"
              size="default"
              onClick={handleFavoriteToggle}
              disabled={favoriteLoading}
              className={cn(
                'border border-border px-3',
                asset.favorite
                  ? 'border-sploot-magenta bg-sploot-magenta text-white hover:bg-sploot-magenta'
                  : 'hover:border-sploot-magenta hover:text-sploot-magenta'
              )}
              aria-label={asset.favorite ? 'remove banger' : 'mark as banger'}
              aria-pressed={asset.favorite}
            >
              <Heart className={cn('h-4 w-4', asset.favorite && 'fill-current')} />
              banger
            </Button>

            <ShareButton
              assetId={asset.id}
              blobUrl={asset.blobUrl}
              filename={asset.filename}
              mimeType={asset.mime}
              variant="compact"
              size="icon"
              className="border border-border text-muted-foreground hover:border-sploot-cyan hover:text-sploot-ink"
            />

            <Button
              variant="compact"
              size="icon"
              onClick={handleDownload}
              className="border border-border text-muted-foreground hover:border-sploot-ink hover:text-foreground"
              aria-label="download meme"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>

          <section aria-label="meme metadata" className="mt-7">
            <h2 className="font-mono text-xs font-bold uppercase text-sploot-ink">file notes</h2>
            <dl className="mt-3 divide-y divide-border border-y border-border font-mono text-xs">
              {asset.width && asset.height && (
                <div className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-muted-foreground">dimensions</dt>
                  <dd className="tabular-nums text-foreground">{asset.width}x{asset.height}</dd>
                </div>
              )}
              {asset.size > 0 && (
                <div className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-muted-foreground">size</dt>
                  <dd className="tabular-nums text-foreground">{formatFileSize(asset.size)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-4 py-2">
                <dt className="text-muted-foreground">type</dt>
                <dd className="text-right text-foreground">{asset.mime}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <dt className="text-muted-foreground">saved</dt>
                <dd className="text-foreground">{formatDate(asset.createdAt)}</dd>
              </div>
              {asset.tags && asset.tags.length > 0 && (
                <div className="flex items-start justify-between gap-4 py-2">
                  <dt className="text-muted-foreground">tags</dt>
                  <dd className="text-right text-foreground">{asset.tags.map((t: { name: string }) => t.name).join(', ')}</dd>
                </div>
              )}
            </dl>
          </section>
        </aside>
      </div>

      <section aria-label="related memes" className="border-t border-sploot-ink">
        <div className="px-4 pb-3 pt-6 sm:px-6">
          <h2 className="font-display text-2xl uppercase text-foreground">related memes</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">nearby in the embedding space</p>
        </div>

        {similarLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : similarAssets.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">no related memes found</p>
          </div>
        ) : (
          <ImageGrid assets={similarAssets} onAssetSelect={handleSimilarAssetSelect} showSimilarityScores />
        )}
      </section>
    </main>
  );
}
