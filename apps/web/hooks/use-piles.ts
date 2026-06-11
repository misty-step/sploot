'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AutomaticPilesResponse, SemanticPile } from '@/lib/types';
import { error as logError } from '@/lib/logger';

interface UseAutomaticPilesOptions {
  enabled?: boolean;
  limit?: number;
  minAssets?: number;
}

export function useAutomaticPiles({
  enabled = true,
  limit = 6,
  minAssets = 50,
}: UseAutomaticPilesOptions = {}) {
  const [piles, setPiles] = useState<SemanticPile[]>([]);
  const [status, setStatus] = useState<AutomaticPilesResponse['status'] | 'idle'>('idle');
  const [embeddedAssetCount, setEmbeddedAssetCount] = useState(0);
  const [minimumAssets, setMinimumAssets] = useState(minAssets);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPiles = useCallback(async () => {
    if (!enabled) {
      setPiles([]);
      setStatus('idle');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: String(limit),
        minAssets: String(minAssets),
      });
      const response = await fetch(`/api/piles?${params}`);
      if (!response.ok) {
        let message = 'Failed to build automatic piles';
        try {
          const body = await response.json();
          message = body.error || message;
        } catch {
          // Non-JSON error; keep generic message.
        }
        throw new Error(message);
      }

      const body = await response.json() as AutomaticPilesResponse;
      setPiles(body.piles);
      setStatus(body.status);
      setEmbeddedAssetCount(body.embeddedAssetCount);
      setMinimumAssets(body.minimumAssets);
    } catch (err) {
      logError('Error loading automatic piles:', err);
      setPiles([]);
      setStatus('idle');
      setError(err instanceof Error ? err.message : 'Failed to build automatic piles');
    } finally {
      setLoading(false);
    }
  }, [enabled, limit, minAssets]);

  useEffect(() => {
    void loadPiles();
  }, [loadPiles]);

  return {
    piles,
    status,
    embeddedAssetCount,
    minimumAssets,
    loading,
    error,
    reload: loadPiles,
  };
}
