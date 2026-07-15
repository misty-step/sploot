'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ImageGrid } from '@/components/library/image-grid';
import type { Asset, AssetListResponse } from '@/lib/types';

interface Tag {
  id: string;
  name: string;
  color: string | null;
  assetCount: number;
}

type TagPageParams = { tagId: string };

export default function TagPage({
  params,
}: {
  params: Promise<TagPageParams>;
}) {
  const resolvedParams = use(params);
  const [tag, setTag] = useState<Tag | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchTagAndAssets = async () => {
    try {
      // Fetch tag details
      const tagResponse = await fetch('/api/tags');
      if (tagResponse.ok) {
        const tagData: { tags: Tag[] } = await tagResponse.json();
        const currentTag = tagData.tags.find((t) => t.id === resolvedParams.tagId);

        if (!currentTag) {
          router.push('/app');
          return;
        }

        setTag(currentTag);
      } else {
        router.push('/app');
        return;
      }

      // Fetch assets with this tag
      const assetsResponse = await fetch(`/api/assets?tagId=${resolvedParams.tagId}`);
      if (assetsResponse.ok) {
        const assetsData: AssetListResponse = await assetsResponse.json();
        setAssets(assetsData.assets);
      }
    } catch (error) {
      console.error('Failed to fetch tag data:', error);
      router.push('/app');
    } finally {
      setLoading(false);
    }
  };

    fetchTagAndAssets();
  }, [resolvedParams.tagId, router]);

  const handleDelete = async (assetId: string) => {
    try {
      const response = await fetch(`/api/assets/${assetId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setAssets((prev) => prev.filter((asset) => asset.id !== assetId));
      }
    } catch (error) {
      console.error('Failed to delete asset:', error);
    }
  };

  const handleFavorite = (assetId: string, favorite: boolean) => {
    setAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId ? { ...asset, favorite } : asset
      )
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-48 mb-4" />
          <div className="h-4 bg-muted rounded w-32" />
        </div>
      </div>
    );
  }

  if (!tag) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b-[3px] border-sploot-ink px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-foreground">
                {tag.name}
              </h1>
              {tag.color && (
                <span
                  className="w-4 h-4 rounded-[var(--sploot-radius-ctl)] border-2 border-sploot-ink"
                  style={{ backgroundColor: tag.color }}
                />
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {assets.length} {assets.length === 1 ? 'image' : 'images'}
            </p>
          </div>
        </div>
      </header>

      {/* Assets Grid */}
      <div className="p-8">
        <ImageGrid
          assets={assets}
          onAssetDelete={handleDelete}
          onAssetUpdate={(id, updates) => {
            if ('favorite' in updates) {
              handleFavorite(id, updates.favorite!);
            }
          }}
        />
      </div>
    </div>
  );
}
