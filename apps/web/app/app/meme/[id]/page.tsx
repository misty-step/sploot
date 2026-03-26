'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Heart, Download, ImageOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/library/share-button';
import { ImageGrid } from '@/components/library/image-grid';
import { cn } from '@/lib/utils';
import type { Asset } from '@/lib/types';
import { error as logError } from '@/lib/logger';

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
    if (!assetId) return;

    async function fetchSimilar() {
      try {
        const res = await fetch(`/api/assets/${assetId}/similar?limit=12`);
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
  }, [assetId]);

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
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not found
  if (!asset) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ImageOff className="h-16 w-16 text-muted-foreground" />
        <h1 className="text-xl font-medium text-foreground">Meme not found</h1>
        <Link href="/app" className="text-accent-cyan hover:underline text-sm">
          Back to library
        </Link>
      </div>
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

        <div className="flex items-center gap-1">
          {/* Favorite */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFavoriteToggle}
            disabled={favoriteLoading}
            className={cn(
              'h-8 w-8 transition-colors',
              asset.favorite
                ? 'text-accent-coral hover:text-accent-coral/80'
                : 'text-muted-foreground hover:text-accent-coral'
            )}
          >
            <Heart className={cn('h-4 w-4', asset.favorite && 'fill-current')} />
          </Button>

          {/* Share */}
          <ShareButton
            assetId={asset.id}
            blobUrl={asset.blobUrl}
            filename={asset.filename}
            mimeType={asset.mime}
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-accent-cyan"
          />

          {/* Download */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <Download className="h-4 w-4" />
          </Button>
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
          ) : (
            <Image
              src={asset.blobUrl}
              alt={asset.filename || 'Meme'}
              width={asset.width || 1200}
              height={asset.height || 630}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 900px"
              className="w-full h-auto max-h-[75vh] object-contain"
              priority
              quality={90}
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
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">
              No related memes found
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
