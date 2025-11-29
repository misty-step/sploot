'use client';

import { useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/observability-logger';

interface EmbeddingResponse {
  success?: boolean;
  message?: string;
  embedding?: {
    modelName: string;
    dimension: number;
    processingTime?: number;
    createdAt: string;
  };
}

interface UseEmbeddingRetryOptions {
  assetId: string;
  hasEmbedding: boolean;
  onEmbeddingGenerated?: (result: EmbeddingResponse) => void;
  retryDelay?: number; // Delay before first retry (ms)
  maxRetries?: number;
}

export function useEmbeddingRetry({
  assetId,
  hasEmbedding,
  onEmbeddingGenerated,
  retryDelay = 5000, // 5 seconds default
  maxRetries = 3,
}: UseEmbeddingRetryOptions) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const hasTriggeredRef = useRef<boolean>(false);

  useEffect(() => {
    // Skip if already has embedding or already triggered
    if (hasEmbedding || hasTriggeredRef.current || retryCount >= maxRetries) {
      return;
    }

    // Set up auto-retry after delay
    timeoutRef.current = setTimeout(async () => {
      if (hasEmbedding) return; // Double-check before retrying

      hasTriggeredRef.current = true;
      setIsRetrying(true);
      setError(null);

      try {
        logger.logInfo('embedding-retry.auto-attempt', {
          assetId,
          attempt: retryCount + 1,
          maxRetries,
        });

        const response = await fetch(`/api/assets/${assetId}/generate-embedding`, {
          method: 'POST',
        });

        if (response.ok) {
          const result: EmbeddingResponse = await response.json();
          logger.logInfo('embedding-retry.auto-success', {
            assetId,
            result,
          });

          if (onEmbeddingGenerated) {
            onEmbeddingGenerated(result);
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error || `Failed to generate embedding (status: ${response.status})`;
          console.error(`[Auto-retry] Failed to generate embedding for asset ${assetId}:`, errorMessage);
          setError(errorMessage);

          // Increment retry count for next attempt
          if (retryCount + 1 < maxRetries) {
            setRetryCount(prev => prev + 1);
            hasTriggeredRef.current = false; // Allow next retry
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Auto-retry] Error generating embedding for asset ${assetId}:`, errorMessage);
        setError(errorMessage);

        // Increment retry count for next attempt
        if (retryCount + 1 < maxRetries) {
          setRetryCount(prev => prev + 1);
          hasTriggeredRef.current = false; // Allow next retry
        }
      } finally {
        setIsRetrying(false);
      }
    }, retryDelay);

    // Cleanup on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [assetId, hasEmbedding, retryDelay, retryCount, maxRetries, onEmbeddingGenerated]);

  // Manual retry function
  const manualRetry = async () => {
    if (isRetrying || hasEmbedding) return;

    setIsRetrying(true);
    setError(null);

    try {
      const response = await fetch(`/api/assets/${assetId}/generate-embedding`, {
        method: 'POST',
      });

      if (response.ok) {
        const result: EmbeddingResponse = await response.json();
        logger.logInfo('embedding-retry.manual-success', {
          assetId,
          result,
        });

        if (onEmbeddingGenerated) {
          onEmbeddingGenerated(result);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error || 'Failed to generate embedding');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsRetrying(false);
    }
  };

  return {
    isRetrying,
    retryCount,
    error,
    manualRetry,
  };
}
