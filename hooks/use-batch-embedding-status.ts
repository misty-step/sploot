'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { logger } from '@/lib/observability-logger';

interface AssetEmbeddingStatus {
  hasEmbedding: boolean;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error?: string;
  retryCount?: number;
}

interface BatchEmbeddingStatusMap {
  [assetId: string]: AssetEmbeddingStatus;
}

interface UseBatchEmbeddingStatusOptions {
  assetIds: string[];
  enabled?: boolean;
  pollInterval?: number;
  maxRetries?: number;
  retryDelay?: number;
  onSuccess?: (assetId: string) => void;
  onError?: (assetId: string, error: Error) => void;
  onAllComplete?: () => void;
}

interface BatchEmbeddingState {
  statuses: BatchEmbeddingStatusMap;
  isPolling: boolean;
  completedCount: number;
  failedCount: number;
  totalCount: number;
}

/**
 * Hook to monitor embedding generation status for multiple assets simultaneously.
 * Efficiently batches status checks and handles automatic retries.
 */
export function useBatchEmbeddingStatus({
  assetIds,
  enabled = true,
  pollInterval = 2000,
  maxRetries = 10,
  retryDelay = 5000,
  onSuccess,
  onError,
  onAllComplete,
}: UseBatchEmbeddingStatusOptions) {
  const [state, setState] = useState<BatchEmbeddingState>({
    statuses: {},
    isPolling: false,
    completedCount: 0,
    failedCount: 0,
    totalCount: assetIds.length,
  });

  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const retryCountsRef = useRef<Map<string, number>>(new Map());
  const isActiveRef = useRef(true);

  // Track which assets need monitoring (not yet ready or failed)
  const assetsNeedingMonitoring = useCallback(() => {
    return assetIds.filter((id) => {
      const status = state.statuses[id];
      if (!status) return true; // No status yet, needs monitoring
      if (status.status === 'ready') return false; // Already ready
      if (status.status === 'failed') {
        const retryCount = retryCountsRef.current.get(id) || 0;
        return retryCount < maxRetries;
      }
      return true; // pending or processing
    });
  }, [assetIds, state.statuses, maxRetries]);

  // Check batch embedding status
  const checkBatchStatus = useCallback(async () => {
    const assetsToCheck = assetsNeedingMonitoring();

    if (assetsToCheck.length === 0) {
      setState((prev) => ({ ...prev, isPolling: false }));
      return;
    }

    // Batch requests in chunks of 50 (as specified in TODO)
    const BATCH_SIZE = 50;
    const chunks = [];
    for (let i = 0; i < assetsToCheck.length; i += BATCH_SIZE) {
      chunks.push(assetsToCheck.slice(i, i + BATCH_SIZE));
    }

    setState((prev) => ({ ...prev, isPolling: true }));

    try {
      const results = await Promise.all(
        chunks.map(async (chunk) => {
          const response = await fetch('/api/assets/batch/embedding-status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ assetIds: chunk }),
          });

          if (!response.ok) {
            throw new Error(`Failed to check batch status: ${response.status}`);
          }

          return response.json();
        })
      );

      // Merge all results
      const mergedStatuses: BatchEmbeddingStatusMap = {};
      for (const result of results) {
        if (result.statuses) {
          Object.assign(mergedStatuses, result.statuses);
        }
      }

      // Update state with new statuses
      setState((prev) => {
        const newStatuses = { ...prev.statuses, ...mergedStatuses };
        let completedCount = 0;
        let failedCount = 0;

        // Count completed and failed, trigger callbacks
        Object.entries(newStatuses).forEach(([id, status]) => {
          const prevStatus = prev.statuses[id];

          if (status.status === 'ready') {
            completedCount++;
            // Trigger success callback if just became ready
            if (prevStatus?.status !== 'ready') {
              onSuccess?.(id);
            }
          } else if (status.status === 'failed') {
            failedCount++;
            // Trigger error callback if just failed
            if (prevStatus?.status !== 'failed' && status.error) {
              onError?.(id, new Error(status.error));
            }
          }
        });

        // Check if all are complete
        if (completedCount + failedCount === assetIds.length && prev.completedCount + prev.failedCount < assetIds.length) {
          onAllComplete?.();
        }

        return {
          ...prev,
          statuses: newStatuses,
          completedCount,
          failedCount,
          isPolling: false,
        };
      });

      // Schedule retries for failed embeddings
      Object.entries(mergedStatuses).forEach(([id, status]) => {
        if (status.status === 'failed') {
          scheduleRetry(id);
        }
      });
    } catch (error) {
      console.error('Error checking batch embedding status:', error);
      setState((prev) => ({ ...prev, isPolling: false }));
    }
  }, [assetsNeedingMonitoring, assetIds, onSuccess, onError, onAllComplete]);

  // Schedule retry for a failed embedding
  const scheduleRetry = useCallback((assetId: string) => {
    // Clear existing retry timer if any
    const existingTimer = retryTimersRef.current.get(assetId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const retryCount = retryCountsRef.current.get(assetId) || 0;
    if (retryCount >= maxRetries) {
      logger.logInfo('batch-embedding-status.max-retries', {
        assetId,
        maxRetries,
      });
      return;
    }

    // Schedule retry after delay
    const timer = setTimeout(async () => {
      if (!isActiveRef.current) return;

      logger.logInfo('batch-embedding-status.retrying', {
        assetId,
        attempt: retryCount + 1,
        maxRetries,
      });
      retryCountsRef.current.set(assetId, retryCount + 1);

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
          // Update status to processing, next poll will check if it's ready
          setState((prev) => ({
            ...prev,
            statuses: {
              ...prev.statuses,
              [assetId]: {
                hasEmbedding: false,
                status: 'processing',
              },
            },
          }));
        }
      } catch (error) {
        console.error(`Failed to retry embedding for asset ${assetId}:`, error);

        // If retry fails, it will be picked up in the next poll
        // and potentially retried again if under max retries
      }

      retryTimersRef.current.delete(assetId);
    }, retryDelay);

    retryTimersRef.current.set(assetId, timer);
  }, [maxRetries, retryDelay]);

  // Manual retry function for user-triggered retries
  const retryAsset = useCallback(async (assetId: string) => {
    retryCountsRef.current.set(assetId, 0); // Reset retry count for manual retry

    setState((prev) => ({
      ...prev,
      statuses: {
        ...prev.statuses,
        [assetId]: {
          hasEmbedding: false,
          status: 'processing',
        },
      },
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

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate embedding');
      }
    } catch (error) {
      console.error(`Manual retry failed for asset ${assetId}:`, error);

      setState((prev) => ({
        ...prev,
        statuses: {
          ...prev.statuses,
          [assetId]: {
            hasEmbedding: false,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        },
      }));
    }
  }, []);

  // Main polling effect
  useEffect(() => {
    if (!enabled || assetIds.length === 0) return;

    isActiveRef.current = true;

    // Initial check
    checkBatchStatus();

    // Set up polling interval
    const startPolling = () => {
      // Clear existing timer
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }

      pollingTimerRef.current = setInterval(() => {
        if (isActiveRef.current) {
          checkBatchStatus();
        }
      }, pollInterval);
    };

    startPolling();

    return () => {
      isActiveRef.current = false;

      // Clear polling timer
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }

      // Clear all retry timers
      retryTimersRef.current.forEach((timer) => clearTimeout(timer));
      retryTimersRef.current.clear();
    };
  }, [enabled, assetIds.length, pollInterval, checkBatchStatus]);

  // Reset when asset IDs change significantly
  useEffect(() => {
    setState({
      statuses: {},
      isPolling: false,
      completedCount: 0,
      failedCount: 0,
      totalCount: assetIds.length,
    });
    retryCountsRef.current.clear();
  }, [assetIds.join(',')]); // Only reset if the actual IDs change

  return {
    ...state,
    retryAsset,
    assetsNeedingWork: assetsNeedingMonitoring().length,
    progressPercentage: state.totalCount > 0
      ? Math.round(((state.completedCount + state.failedCount) / state.totalCount) * 100)
      : 0,
  };
}
