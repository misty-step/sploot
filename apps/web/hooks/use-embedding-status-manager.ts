'use client';

import { pooledFetch } from '@/lib/connection-pool';
import { logger } from '@/lib/observability-logger';

/**
 * Centralized manager for embedding status checks.
 * Replaces individual polling with batched requests to prevent connection exhaustion.
 *
 * Problem: 54 files = 36 requests/second = browser crash
 * Solution: Single manager, batched requests = 1 request/2 seconds
 */

interface EmbeddingStatus {
  hasEmbedding: boolean;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error?: string;
  retryCount?: number;
}

type StatusCallback = (status: EmbeddingStatus) => void;
type UnsubscribeFn = () => void;

class EmbeddingStatusManager {
  private static instance: EmbeddingStatusManager;

  // Subscriber management
  private subscribers = new Map<string, Set<StatusCallback>>();

  // Status cache
  private statuses = new Map<string, EmbeddingStatus>();

  // Batch management
  private batchTimer: NodeJS.Timeout | null = null;
  private pendingBatch = new Set<string>();

  // Configuration
  private readonly BATCH_SIZE = 50; // Max items per request
  private readonly BATCH_INTERVAL = 5000; // 5 seconds between batches (SSE handles real-time)
  private readonly MAX_RETRIES = 10;
  private readonly RETRY_DELAY = 10000; // 10 seconds before retry (less aggressive with SSE)

  // Retry tracking
  private retryTimers = new Map<string, NodeJS.Timeout>();
  private retryCounts = new Map<string, number>();

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): EmbeddingStatusManager {
    if (!EmbeddingStatusManager.instance) {
      EmbeddingStatusManager.instance = new EmbeddingStatusManager();
    }
    return EmbeddingStatusManager.instance;
  }

  /**
   * Subscribe to status updates for an asset
   */
  subscribe(assetId: string, callback: StatusCallback): UnsubscribeFn {
    if (!assetId) {
      return () => {};
    }

    // Add subscriber
    if (!this.subscribers.has(assetId)) {
      this.subscribers.set(assetId, new Set());
    }
    this.subscribers.get(assetId)!.add(callback);

    // Add to pending batch for status check
    this.pendingBatch.add(assetId);
    this.scheduleBatch();

    // If we have cached status, send it immediately
    const cachedStatus = this.statuses.get(assetId);
    if (cachedStatus) {
      // Use setTimeout to avoid synchronous callback during subscribe
      setTimeout(() => callback(cachedStatus), 0);
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(assetId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(assetId);
          // No more subscribers for this asset, can remove from pending
          this.pendingBatch.delete(assetId);
        }
      }
    };
  }

  /**
   * Get current status for an asset (synchronous)
   */
  getStatus(assetId: string): EmbeddingStatus | undefined {
    return this.statuses.get(assetId);
  }

  /**
   * Manually trigger a retry for a specific asset
   */
  async triggerRetry(assetId: string): Promise<void> {
    // Reset retry count for manual retries
    this.retryCounts.set(assetId, 0);

    // Clear any existing retry timer
    const existingTimer = this.retryTimers.get(assetId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.retryTimers.delete(assetId);
    }

    // Update status to processing
    this.updateStatus(assetId, {
      hasEmbedding: false,
      status: 'processing',
    });

    try {
      const response = await pooledFetch(`/api/assets/${assetId}/generate-embedding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        priority: 'high',
      } as RequestInit & { priority: 'high' });

      if (!response.ok) {
        throw new Error(`Failed to generate embedding: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate embedding');
      }

      // Status will be updated in next batch check
      this.pendingBatch.add(assetId);
      this.scheduleBatch();

    } catch (error) {
      console.error(`Manual retry failed for asset ${assetId}:`, error);

      this.updateStatus(assetId, {
        hasEmbedding: false,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Schedule a batch check if not already scheduled
   */
  private scheduleBatch(): void {
    if (this.batchTimer || this.pendingBatch.size === 0) {
      return;
    }

    this.batchTimer = setTimeout(() => {
      this.processBatch();
      this.batchTimer = null;
    }, this.BATCH_INTERVAL);
  }

  /**
   * Process pending batch of status checks
   */
  private async processBatch(): Promise<void> {
    if (this.pendingBatch.size === 0) {
      return;
    }

    // Get assets that need checking (not already ready)
    const assetsToCheck = Array.from(this.pendingBatch).filter(id => {
      const status = this.statuses.get(id);
      // Check if not ready or if we have subscribers
      return !status?.hasEmbedding && this.subscribers.has(id);
    });

    if (assetsToCheck.length === 0) {
      this.pendingBatch.clear();
      return;
    }

    // Clear pending batch
    this.pendingBatch.clear();

    // Split into chunks
    const chunks: string[][] = [];
    for (let i = 0; i < assetsToCheck.length; i += this.BATCH_SIZE) {
      chunks.push(assetsToCheck.slice(i, i + this.BATCH_SIZE));
    }

    try {
      // Process all chunks in parallel
      const results = await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const response = await pooledFetch('/api/assets/batch/embedding-status', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ assetIds: chunk }),
              priority: 'low',
            } as RequestInit & { priority: 'low' });

            if (!response.ok) {
              console.error(`Batch status check failed: ${response.status}`);
              return null;
            }

            return response.json();
          } catch (error) {
            console.error('Error checking batch status:', error);
            return null;
          }
        })
      );

      // Process results
      for (const result of results) {
        if (result?.statuses) {
          for (const [assetId, status] of Object.entries(result.statuses as Record<string, any>)) {
            this.updateStatus(assetId, status);

            // Schedule retry for failed embeddings
            if (status.status === 'failed' && !status.hasEmbedding) {
              this.scheduleRetry(assetId);
            }
          }
        }
      }

      // Re-add assets that still need monitoring
      for (const id of assetsToCheck) {
        const status = this.statuses.get(id);
        if (!status?.hasEmbedding && this.subscribers.has(id)) {
          this.pendingBatch.add(id);
        }
      }

      // Schedule next batch if needed
      this.scheduleBatch();

    } catch (error) {
      console.error('Fatal error in batch processing:', error);

      // Re-add all assets for retry
      for (const id of assetsToCheck) {
        this.pendingBatch.add(id);
      }

      // Schedule retry with longer delay
      setTimeout(() => this.scheduleBatch(), 5000);
    }
  }

  /**
   * Update status and notify subscribers
   */
  private updateStatus(assetId: string, status: EmbeddingStatus): void {
    const previousStatus = this.statuses.get(assetId);
    this.statuses.set(assetId, status);

    // Notify subscribers if status changed
    const hasChanged = !previousStatus ||
                      previousStatus.status !== status.status ||
                      previousStatus.hasEmbedding !== status.hasEmbedding;

    if (hasChanged) {
      const callbacks = this.subscribers.get(assetId);
      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback(status);
          } catch (error) {
            console.error('Error in status callback:', error);
          }
        });
      }
    }
  }

  /**
   * Schedule automatic retry for failed embedding
   */
  private scheduleRetry(assetId: string): void {
    // Clear existing retry timer
    const existingTimer = this.retryTimers.get(assetId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const retryCount = this.retryCounts.get(assetId) || 0;
    if (retryCount >= this.MAX_RETRIES) {
      logger.logInfo('embedding-status-manager.max-retries', {
        assetId,
        maxRetries: this.MAX_RETRIES,
      });
      return;
    }

    const timer = setTimeout(async () => {
      logger.logInfo('embedding-status-manager.retrying', {
        assetId,
        attempt: retryCount + 1,
        maxRetries: this.MAX_RETRIES,
      });
      this.retryCounts.set(assetId, retryCount + 1);

      try {
        const response = await pooledFetch(`/api/assets/${assetId}/generate-embedding`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          priority: 'low',
        } as RequestInit & { priority: 'low' });

        if (!response.ok) {
          throw new Error(`Failed to generate embedding: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
          // Update status to processing, next batch will check if ready
          this.updateStatus(assetId, {
            hasEmbedding: false,
            status: 'processing',
          });

          // Add to next batch
          this.pendingBatch.add(assetId);
          this.scheduleBatch();
        }
      } catch (error) {
        console.error(`Failed to retry embedding for asset ${assetId}:`, error);
        // Will be retried again if under max retries
        this.pendingBatch.add(assetId);
        this.scheduleBatch();
      }

      this.retryTimers.delete(assetId);
    }, this.RETRY_DELAY);

    this.retryTimers.set(assetId, timer);
  }

  /**
   * Clear all state (useful for testing or cleanup)
   */
  clearAll(): void {
    // Clear all timers
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    this.retryTimers.forEach(timer => clearTimeout(timer));
    this.retryTimers.clear();

    // Clear all state
    this.subscribers.clear();
    this.statuses.clear();
    this.pendingBatch.clear();
    this.retryCounts.clear();
  }

  /**
   * Get statistics for monitoring
   */
  getStats(): {
    subscriberCount: number;
    statusCacheSize: number;
    pendingBatchSize: number;
    retryQueueSize: number;
  } {
    return {
      subscriberCount: this.subscribers.size,
      statusCacheSize: this.statuses.size,
      pendingBatchSize: this.pendingBatch.size,
      retryQueueSize: this.retryTimers.size,
    };
  }
}

// Export singleton instance getter
export function getEmbeddingStatusManager(): EmbeddingStatusManager {
  return EmbeddingStatusManager.getInstance();
}

// Export types
export type { EmbeddingStatus, StatusCallback, UnsubscribeFn };
