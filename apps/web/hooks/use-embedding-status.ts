'use client';

import { useEffect, useState, useCallback } from 'react';

interface UseEmbeddingStatusOptions {
  assetId: string;
  enabled?: boolean;
  pollInterval?: number;
  maxRetries?: number;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

interface EmbeddingStatus {
  hasEmbedding: boolean;
  isGenerating: boolean;
  error: string | null;
  retryCount: number;
}

/**
 * Hook to monitor and retry embedding generation for an asset.
 * Polls for embedding status and triggers generation if missing.
 */
export function useEmbeddingStatus({
  assetId,
  enabled = true,
  pollInterval = 2000,
  maxRetries = 3,
  onSuccess,
  onError,
}: UseEmbeddingStatusOptions) {
  const [status, setStatus] = useState<EmbeddingStatus>({
    hasEmbedding: false,
    isGenerating: false,
    error: null,
    retryCount: 0,
  });

  const checkEmbeddingStatus = useCallback(async () => {
    if (!assetId || !enabled) return;

    try {
      const response = await fetch(`/api/assets/${assetId}/embedding-status`);

      if (!response.ok) {
        throw new Error(`Failed to check embedding status: ${response.status}`);
      }

      const data = await response.json();

      if (data.hasEmbedding) {
        setStatus((prev) => ({
          ...prev,
          hasEmbedding: true,
          isGenerating: false,
          error: null,
        }));
        onSuccess?.();
        return true; // Stop polling
      }

      return false; // Continue polling
    } catch (error) {
      console.error('Error checking embedding status:', error);
      setStatus((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
      onError?.(error instanceof Error ? error : new Error('Unknown error'));
      return false;
    }
  }, [assetId, enabled, onSuccess, onError]);

  const triggerEmbeddingGeneration = useCallback(async () => {
    if (!assetId || status.retryCount >= maxRetries) return;

    setStatus((prev) => ({
      ...prev,
      isGenerating: true,
      error: null,
      retryCount: prev.retryCount + 1,
    }));

    try {
      const response = await fetch(`/api/assets/${assetId}/generate-embedding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to generate embedding: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setStatus((prev) => ({
          ...prev,
          hasEmbedding: true,
          isGenerating: false,
          error: null,
        }));
        onSuccess?.();
      } else {
        throw new Error(data.error || 'Failed to generate embedding');
      }
    } catch (error) {
      console.error('Error generating embedding:', error);
      setStatus((prev) => ({
        ...prev,
        isGenerating: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
      onError?.(error instanceof Error ? error : new Error('Unknown error'));
    }
  }, [assetId, status.retryCount, maxRetries, onSuccess, onError]);

  useEffect(() => {
    if (!enabled || !assetId) return;

    let pollTimer: NodeJS.Timeout;
    let retryTimer: NodeJS.Timeout;
    let isActive = true;

    const startPolling = async () => {
      // Initial check
      const hasEmbedding = await checkEmbeddingStatus();

      if (hasEmbedding || !isActive) return;

      // Start polling
      pollTimer = setInterval(async () => {
        if (!isActive) return;

        const hasEmbedding = await checkEmbeddingStatus();

        if (hasEmbedding) {
          clearInterval(pollTimer);
          return;
        }
      }, pollInterval);

      // After 5 seconds, try to generate embedding if still missing
      retryTimer = setTimeout(async () => {
        if (!isActive || status.hasEmbedding) return;

        // Stop polling while we try to generate
        clearInterval(pollTimer);

        await triggerEmbeddingGeneration();

        // Resume polling after generation attempt
        if (isActive && !status.hasEmbedding) {
          startPolling();
        }
      }, 5000);
    };

    startPolling();

    return () => {
      isActive = false;
      clearInterval(pollTimer);
      clearTimeout(retryTimer);
    };
  }, [assetId, enabled, pollInterval, checkEmbeddingStatus, triggerEmbeddingGeneration, status.hasEmbedding]);

  const retry = useCallback(() => {
    if (status.retryCount >= maxRetries) {
      setStatus((prev) => ({
        ...prev,
        error: 'Maximum retries exceeded',
      }));
      return;
    }

    triggerEmbeddingGeneration();
  }, [status.retryCount, maxRetries, triggerEmbeddingGeneration]);

  return {
    ...status,
    retry,
    canRetry: status.retryCount < maxRetries && !status.isGenerating,
  };
}