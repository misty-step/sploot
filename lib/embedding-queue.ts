import { logger } from '@/lib/observability-logger';

/**
 * Embedding Queue Manager
 * Manages background embedding generation with retry logic and persistence
 */
export interface EmbeddingQueueItem {
  assetId: string;
  blobUrl: string;
  checksum: string;
  priority: number; // 0 = high, 1 = normal
  retryCount: number;
  addedAt: number;
  lastAttempt?: number;
  error?: string;
  errorType?: 'rate_limit' | 'network' | 'invalid_image' | 'server' | 'unknown';
  isUserTriggered?: boolean; // Track if this was user-triggered vs background
  permanentlyFailed?: boolean; // For errors that shouldn't be retried
}

export type QueueEventType = 'added' | 'processing' | 'completed' | 'failed' | 'retry';

export interface QueueEvent {
  type: QueueEventType;
  item: EmbeddingQueueItem;
  timestamp: number;
}

type QueueListener = (event: QueueEvent) => void;

/**
 * EmbeddingQueueManager handles background embedding generation
 * with retry logic, persistence, and concurrency control
 */
export class EmbeddingQueueManager {
  private queue: EmbeddingQueueItem[] = [];
  private processing = new Map<string, Promise<void>>();
  private listeners = new Set<QueueListener>();
  private isRunning = false;
  private persistKey = 'sploot_embedding_queue';

  // Configuration
  private readonly MAX_CONCURRENT = 2; // Replicate API rate limits
  private readonly MAX_RETRIES_USER = 5; // More retries for user-triggered
  private readonly MAX_RETRIES_BACKGROUND = 3; // Fewer retries for background
  private readonly BASE_RETRY_DELAY = 1000; // Start with 1s, then 2s, 4s, 8s, 16s
  private readonly MAX_BACKOFF_DELAY = 16000; // Cap at 16s

  constructor() {
    this.loadFromStorage();
    // Start processing if there are items in queue
    if (this.queue.length > 0) {
      this.start();
    }
  }

  /**
   * Add an item to the embedding queue
   */
  addToQueue(item: Omit<EmbeddingQueueItem, 'retryCount' | 'addedAt'> & { isUserTriggered?: boolean }): void {
    const queueItem: EmbeddingQueueItem = {
      ...item,
      retryCount: 0,
      addedAt: Date.now(),
      isUserTriggered: item.isUserTriggered || false,
    };

    // Check if already in queue or processing
    if (this.isInQueue(item.assetId) || this.processing.has(item.assetId)) {
      logger.logInfo('embedding-queue.duplicate', { assetId: item.assetId });
      return;
    }

    // Add to queue based on priority
    if (item.priority === 0) {
      this.queue.unshift(queueItem); // High priority goes to front
    } else {
      this.queue.push(queueItem); // Normal priority goes to back
    }

    this.persistToStorage();
    this.notifyListeners({ type: 'added', item: queueItem, timestamp: Date.now() });

    // Start processing if not already running
    if (!this.isRunning) {
      this.start();
    }
  }

  /**
   * Remove an item from the queue
   */
  removeFromQueue(assetId: string): boolean {
    const index = this.queue.findIndex(item => item.assetId === assetId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.persistToStorage();
      return true;
    }
    return false;
  }

  /**
   * Get current queue status
   */
  getStatus(): {
    queued: number;
    processing: number;
    items: EmbeddingQueueItem[];
  } {
    return {
      queued: this.queue.length,
      processing: this.processing.size,
      items: [...this.queue],
    };
  }

  /**
   * Check if an asset is in the queue
   */
  isInQueue(assetId: string): boolean {
    return this.queue.some(item => item.assetId === assetId);
  }

  /**
   * Check if an asset is currently being processed
   */
  isProcessing(assetId: string): boolean {
    return this.processing.has(assetId);
  }

  /**
   * Start processing the queue
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.processQueue();
  }

  /**
   * Stop processing the queue
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Process items in the queue with concurrency control
   */
  private async processQueue(): Promise<void> {
    while (this.isRunning && (this.queue.length > 0 || this.processing.size > 0)) {
      // Start new processing up to concurrency limit
      while (
        this.queue.length > 0 &&
        this.processing.size < this.MAX_CONCURRENT &&
        this.isRunning
      ) {
        const item = this.queue.shift();
        if (!item) break;

        const processingPromise = this.processItem(item)
          .finally(() => {
            this.processing.delete(item.assetId);
          });

        this.processing.set(item.assetId, processingPromise);
      }

      // Wait for at least one to complete before continuing
      if (this.processing.size > 0) {
        await Promise.race(this.processing.values());
      }
    }

    // Queue is empty and nothing is processing
    this.isRunning = false;
  }

  /**
   * Process a single item with smart retry logic
   */
  private async processItem(item: EmbeddingQueueItem): Promise<void> {
    // Skip if permanently failed
    if (item.permanentlyFailed) {
      logger.logInfo('embedding-queue.skip-permanently-failed', { assetId: item.assetId });
      this.notifyListeners({ type: 'failed', item, timestamp: Date.now() });
      return;
    }

    item.lastAttempt = Date.now();
    this.notifyListeners({ type: 'processing', item, timestamp: Date.now() });

    try {
      // Call the generate-embedding endpoint
      const response = await fetch(`/api/assets/${item.assetId}/generate-embedding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorType = this.classifyError(response.status, errorData);
        throw {
          message: errorData.error || `HTTP ${response.status}`,
          status: response.status,
          type: errorType,
          data: errorData
        };
      }

      // Success! Notify listeners
      this.notifyListeners({ type: 'completed', item, timestamp: Date.now() });
      logger.logInfo('embedding-queue.success', { assetId: item.assetId });

    } catch (error: any) {
      console.error(`[EmbeddingQueue] Failed to generate embedding for ${item.assetId}:`, error);

      // Classify the error
      const errorType = error.type || this.classifyErrorFromException(error);
      item.error = error.message || String(error);
      item.errorType = errorType;

      // Apply smart retry strategy based on error type
      const shouldRetry = this.shouldRetryError(item, errorType);

      if (shouldRetry) {
        const delay = this.calculateRetryDelay(item, errorType);
        const maxRetries = item.isUserTriggered ? this.MAX_RETRIES_USER : this.MAX_RETRIES_BACKGROUND;

        logger.logInfo('embedding-queue.retry-scheduled', {
          assetId: item.assetId,
          delayMs: delay,
          attempt: item.retryCount,
          maxRetries,
          errorType,
        });

        // Re-add to queue after delay
        setTimeout(() => {
          if (!this.isInQueue(item.assetId) && !this.processing.has(item.assetId)) {
            this.queue.push(item);
            this.persistToStorage();
            this.notifyListeners({ type: 'retry', item, timestamp: Date.now() });

            if (!this.isRunning) {
              this.start();
            }
          }
        }, delay);
      } else {
        // No retry - permanent failure or max retries reached
        if (errorType === 'invalid_image') {
          item.permanentlyFailed = true;
        }
        this.notifyListeners({ type: 'failed', item, timestamp: Date.now() });
        console.error(`[EmbeddingQueue] ${item.permanentlyFailed ? 'Permanently failed' : 'Max retries reached'} for ${item.assetId}`);
      }
    }

    // Persist current state
    this.persistToStorage();
  }

  /**
   * Classify error type based on status code and error data
   */
  private classifyError(status: number, errorData: any): EmbeddingQueueItem['errorType'] {
    // Rate limit error
    if (status === 429) {
      return 'rate_limit';
    }

    // Server errors
    if (status >= 500) {
      return 'server';
    }

    // Invalid image errors (400 Bad Request with specific messages)
    if (status === 400) {
      const errorMessage = errorData.error?.toLowerCase() || '';
      if (errorMessage.includes('invalid') || errorMessage.includes('corrupt') ||
          errorMessage.includes('unsupported') || errorMessage.includes('format')) {
        return 'invalid_image';
      }
    }

    // Network-related errors
    if (status === 0 || status === 408 || status === 504) {
      return 'network';
    }

    return 'unknown';
  }

  /**
   * Classify error type from exception
   */
  private classifyErrorFromException(error: any): EmbeddingQueueItem['errorType'] {
    const message = error.message?.toLowerCase() || '';

    // Network errors
    if (message.includes('network') || message.includes('fetch') ||
        message.includes('timeout') || message.includes('connect')) {
      return 'network';
    }

    return 'unknown';
  }

  /**
   * Determine if we should retry based on error type and retry count
   */
  private shouldRetryError(item: EmbeddingQueueItem, errorType: EmbeddingQueueItem['errorType']): boolean {
    const maxRetries = item.isUserTriggered ? this.MAX_RETRIES_USER : this.MAX_RETRIES_BACKGROUND;

    // Invalid images should never be retried
    if (errorType === 'invalid_image') {
      return false;
    }

    // Rate limits don't count against retry count
    if (errorType === 'rate_limit') {
      return true; // Always retry rate limits (they don't increment retry count)
    }

    // Network errors get one immediate retry, then follow normal backoff
    if (errorType === 'network' && item.retryCount === 0) {
      // Don't increment retry count for first network error
      return true;
    }

    // Increment retry count for counted retries
    // Note: rate_limit is already handled above with early return
    if (!(errorType === 'network' && item.retryCount === 0)) {
      item.retryCount++;
    }

    return item.retryCount < maxRetries;
  }

  /**
   * Calculate retry delay based on error type and retry count
   */
  private calculateRetryDelay(item: EmbeddingQueueItem, errorType: EmbeddingQueueItem['errorType']): number {
    // Rate limit: Wait longer (30 seconds)
    if (errorType === 'rate_limit') {
      return 30000; // 30 seconds for rate limits
    }

    // Network error: Immediate retry for first attempt
    if (errorType === 'network' && item.retryCount === 0) {
      return 100; // Nearly immediate retry for first network error
    }

    // Standard exponential backoff: 1s, 2s, 4s, 8s, 16s
    const backoffMultiplier = Math.pow(2, Math.min(item.retryCount, 4));
    const delay = this.BASE_RETRY_DELAY * backoffMultiplier;

    return Math.min(delay, this.MAX_BACKOFF_DELAY);
  }

  /**
   * Subscribe to queue events
   */
  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of an event
   */
  private notifyListeners(event: QueueEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[EmbeddingQueue] Listener error:', error);
      }
    });
  }

  /**
   * Persist queue to localStorage
   */
  private persistToStorage(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const data = JSON.stringify({
          queue: this.queue,
          timestamp: Date.now(),
        });
        localStorage.setItem(this.persistKey, data);
      }
    } catch (error) {
      console.error('[EmbeddingQueue] Failed to persist queue:', error);
    }
  }

  /**
   * Load queue from localStorage
   */
  private loadFromStorage(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const data = localStorage.getItem(this.persistKey);
        if (data) {
          const parsed = JSON.parse(data);
          // Only restore queue if it's less than 1 hour old
          if (parsed.timestamp && Date.now() - parsed.timestamp < 3600000) {
            this.queue = parsed.queue || [];
            logger.logInfo('embedding-queue.restored', {
              restoredCount: this.queue.length,
            });
          } else {
            // Clear old data
            localStorage.removeItem(this.persistKey);
          }
        }
      }
    } catch (error) {
      console.error('[EmbeddingQueue] Failed to load queue from storage:', error);
      // Clear corrupted data
      try {
        localStorage.removeItem(this.persistKey);
      } catch {}
    }
  }

  /**
   * Clear the entire queue
   */
  clear(): void {
    this.queue = [];
    this.persistToStorage();
  }

  /**
   * Get failed items for manual retry
   */
  getFailedItems(): EmbeddingQueueItem[] {
    const maxRetries = this.MAX_RETRIES_BACKGROUND; // Use lower threshold for failed items
    return this.queue.filter(item =>
      item.permanentlyFailed ||
      (item.retryCount >= maxRetries && !item.isUserTriggered) ||
      (item.retryCount >= this.MAX_RETRIES_USER && item.isUserTriggered)
    );
  }

  /**
   * Retry all failed items (except permanently failed)
   */
  retryFailed(): void {
    const failed = this.getFailedItems();
    failed.forEach(item => {
      // Skip permanently failed items (invalid images)
      if (!item.permanentlyFailed) {
        item.retryCount = 0;
        item.error = undefined;
        item.errorType = undefined;
        item.isUserTriggered = true; // Manual retry is user-triggered
      }
    });
    this.persistToStorage();
    if (!this.isRunning && failed.length > 0) {
      this.start();
    }
  }
}

// Singleton instance
let queueManagerInstance: EmbeddingQueueManager | null = null;

/**
 * Get the singleton queue manager instance
 */
export function getEmbeddingQueueManager(): EmbeddingQueueManager {
  if (!queueManagerInstance) {
    queueManagerInstance = new EmbeddingQueueManager();
  }
  return queueManagerInstance;
}

/**
 * Helper to add an asset to the embedding queue
 */
export function queueEmbeddingGeneration(
  assetId: string,
  blobUrl: string,
  checksum: string,
  priority: number = 1,
  isUserTriggered: boolean = false
): void {
  const manager = getEmbeddingQueueManager();
  manager.addToQueue({ assetId, blobUrl, checksum, priority, isUserTriggered });
}
