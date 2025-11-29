/**
 * Upload Queue Service
 *
 * Manages upload queue with:
 * - Concurrency control with adaptive adjustment
 * - Retry queue with exponential backoff
 * - Queue processing with parallel execution
 *
 * Deep module: Simple enqueue/processQueue interface hides complex
 * scheduling logic, adaptive concurrency, and retry queue management.
 */

import { logger } from '@/lib/logger';

export interface QueueItem<T = any> {
  id: string;
  data: T;
  retryCount: number;
  addedAt: number;
}

export interface QueueStats {
  successful: number;
  failed: number;
  pending: number;
  retrying: number;
}

export interface QueueConfig {
  /** Base concurrency limit (default: 6) */
  baseConcurrency?: number;
  /** Minimum concurrency limit (default: 2) */
  minConcurrency?: number;
  /** Maximum concurrency limit (default: 8) */
  maxConcurrency?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Backoff delays in milliseconds (default: [1000, 3000, 9000]) */
  backoffDelays?: number[];
  /** Failure rate threshold to reduce concurrency (default: 0.2 = 20%) */
  failureRateThreshold?: number;
  /** Success rate threshold to increase concurrency (default: 0.95 = 95%) */
  successRateThreshold?: number;
}

export type UploadHandler<T, R> = (item: T) => Promise<R>;
export type ProgressCallback = (stats: QueueStats) => void;

/**
 * Service for managing upload queue with concurrency control and retries
 *
 * Processes items in parallel up to concurrency limit, adapts concurrency based
 * on failure rate, and retries failed items with exponential backoff.
 */
export class UploadQueueService<T = any, R = any> {
  private queue: QueueItem<T>[] = [];
  private retryQueue: QueueItem<T>[] = [];
  private activeUploads = new Set<Promise<void>>();
  private stats: QueueStats = {
    successful: 0,
    failed: 0,
    pending: 0,
    retrying: 0,
  };
  private currentConcurrency: number;
  private readonly config: Required<QueueConfig>;
  private progressCallback?: ProgressCallback;

  constructor(config?: QueueConfig) {
    this.config = {
      baseConcurrency: config?.baseConcurrency ?? 6,
      minConcurrency: config?.minConcurrency ?? 2,
      maxConcurrency: config?.maxConcurrency ?? 8,
      maxRetries: config?.maxRetries ?? 3,
      backoffDelays: config?.backoffDelays ?? [1000, 3000, 9000],
      failureRateThreshold: config?.failureRateThreshold ?? 0.2,
      successRateThreshold: config?.successRateThreshold ?? 0.95,
    };
    this.currentConcurrency = this.config.baseConcurrency;
  }

  /**
   * Enqueues an item for upload
   *
   * @param id - Unique identifier for the item
   * @param data - Item data to upload
   */
  enqueue(id: string, data: T): void {
    const item: QueueItem<T> = {
      id,
      data,
      retryCount: 0,
      addedAt: Date.now(),
    };
    this.queue.push(item);
    this.stats.pending++;
    this.notifyProgress();
  }

  /**
   * Enqueues multiple items for upload
   *
   * @param items - Array of {id, data} tuples
   */
  enqueueBatch(items: Array<{ id: string; data: T }>): void {
    for (const item of items) {
      this.enqueue(item.id, item.data);
    }
  }

  /**
   * Processes the queue with the provided upload handler
   *
   * @param handler - Async function to handle each upload
   * @param onProgress - Optional callback for progress updates
   * @returns Promise that resolves when all items are processed
   */
  async processQueue(
    handler: UploadHandler<T, R>,
    onProgress?: ProgressCallback
  ): Promise<void> {
    this.progressCallback = onProgress;
    this.resetStats();

    logger.debug(
      `[UploadQueue] Starting batch upload of ${this.queue.length} items with concurrency: ${this.currentConcurrency}`
    );

    // Process all items with concurrency control
    while (this.queue.length > 0) {
      // Adaptive concurrency adjustment
      this.adjustConcurrency();

      // Fill up to concurrency limit
      while (this.queue.length > 0 && this.activeUploads.size < this.currentConcurrency) {
        const item = this.queue.shift()!;
        this.stats.pending--;

        const uploadPromise = this.processItem(item, handler).finally(() => {
          this.activeUploads.delete(uploadPromise);
        });
        this.activeUploads.add(uploadPromise);
      }

      // Wait for at least one slot to free up
      if (this.activeUploads.size >= this.currentConcurrency && this.queue.length > 0) {
        await Promise.race(Array.from(this.activeUploads));
      }
    }

    // Wait for all remaining uploads to complete
    if (this.activeUploads.size > 0) {
      await Promise.all(Array.from(this.activeUploads));
    }

    // Process retry queue with exponential backoff
    if (this.retryQueue.length > 0) {
      logger.debug(
        `[UploadQueue] Processing retry queue with ${this.retryQueue.length} items`
      );
      await this.processRetryQueue(handler);
    }

    logger.debug(
      `[UploadQueue] Batch complete - Success: ${this.stats.successful}, Failed: ${this.stats.failed}`
    );
  }

  /**
   * Gets current queue statistics
   */
  getStats(): Readonly<QueueStats> {
    return { ...this.stats };
  }

  /**
   * Clears the queue and resets stats
   */
  clear(): void {
    this.queue = [];
    this.retryQueue = [];
    this.activeUploads.clear();
    this.resetStats();
  }

  /**
   * Gets current concurrency limit
   */
  getConcurrency(): number {
    return this.currentConcurrency;
  }

  // Private methods

  private async processItem(
    item: QueueItem<T>,
    handler: UploadHandler<T, R>
  ): Promise<void> {
    try {
      await handler(item.data);
      this.stats.successful++;
      this.notifyProgress();
    } catch (error) {
      if (item.retryCount < this.config.maxRetries) {
        // Add to retry queue
        item.retryCount++;
        this.retryQueue.push(item);
        this.stats.retrying++;
        logger.debug(
          `[UploadQueue] Item ${item.id} added to retry queue (attempt ${item.retryCount}/${this.config.maxRetries})`
        );
      } else {
        // Max retries exhausted
        this.stats.failed++;
        logger.error(
          `[UploadQueue] Item ${item.id} failed permanently after ${this.config.maxRetries} retries:`,
          error
        );
      }
      this.notifyProgress();
    }
  }

  private async processRetryQueue(handler: UploadHandler<T, R>): Promise<void> {
    // Process retries sequentially with exponential backoff
    while (this.retryQueue.length > 0) {
      const item = this.retryQueue.shift()!;
      this.stats.retrying--;

      const delay = this.getBackoffDelay(item.retryCount);
      logger.debug(
        `[UploadQueue] Retrying item ${item.id} after ${delay}ms delay (attempt ${item.retryCount}/${this.config.maxRetries})`
      );

      // Wait for backoff delay
      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        await handler(item.data);
        this.stats.successful++;
        logger.debug(`[UploadQueue] Retry successful for item ${item.id}`);
      } catch (error) {
        if (item.retryCount < this.config.maxRetries) {
          // Still have retries left
          item.retryCount++;
          this.retryQueue.push(item);
          this.stats.retrying++;
        } else {
          // Max retries reached
          this.stats.failed++;
          logger.error(
            `[UploadQueue] Item ${item.id} failed permanently after ${this.config.maxRetries} retries:`,
            error
          );
        }
      }

      this.notifyProgress();
    }
  }

  private adjustConcurrency(): void {
    const { successful, failed } = this.stats;
    const total = successful + failed;

    // Only adjust every 10 uploads
    if (total === 0 || total % 10 !== 0) {
      return;
    }

    const failureRate = failed / total;
    const previousConcurrency = this.currentConcurrency;

    if (
      failureRate > this.config.failureRateThreshold &&
      this.currentConcurrency > this.config.minConcurrency
    ) {
      // Too many failures, reduce concurrency
      this.currentConcurrency = Math.max(
        this.config.minConcurrency,
        this.currentConcurrency - 1
      );
      logger.debug(
        `[UploadQueue] High failure rate ${(failureRate * 100).toFixed(0)}%, reducing concurrency ${previousConcurrency} → ${this.currentConcurrency}`
      );
    } else if (
      failureRate < 1 - this.config.successRateThreshold &&
      this.currentConcurrency < this.config.maxConcurrency
    ) {
      // Very few failures, increase concurrency
      this.currentConcurrency = Math.min(
        this.config.maxConcurrency,
        this.currentConcurrency + 1
      );
      logger.debug(
        `[UploadQueue] Low failure rate ${(failureRate * 100).toFixed(0)}%, increasing concurrency ${previousConcurrency} → ${this.currentConcurrency}`
      );
    }
  }

  private getBackoffDelay(retryCount: number): number {
    const index = Math.min(retryCount - 1, this.config.backoffDelays.length - 1);
    return this.config.backoffDelays[index] || this.config.backoffDelays[this.config.backoffDelays.length - 1];
  }

  private resetStats(): void {
    this.stats = {
      successful: 0,
      failed: 0,
      pending: this.queue.length,
      retrying: 0,
    };
  }

  private notifyProgress(): void {
    if (this.progressCallback) {
      this.progressCallback(this.getStats());
    }
  }
}

/**
 * Creates a singleton instance for default configuration
 */
let defaultService: UploadQueueService | null = null;

export function getUploadQueueService<T = any, R = any>(
  config?: QueueConfig
): UploadQueueService<T, R> {
  if (!defaultService) {
    defaultService = new UploadQueueService<T, R>(config);
  }
  return defaultService as UploadQueueService<T, R>;
}
