/**
 * Distributed Queue with Priority and Deadletter Handling
 *
 * Manages multiple priority queues for efficient processing of upload tasks
 * with automatic retry, exponential backoff, and deadletter queue for failures.
 *
 * Priority levels:
 * - urgent: User-initiated retries (highest priority)
 * - normal: Regular upload operations
 * - background: Batch operations (lowest priority)
 * - dead: Permanent failures for analysis
 */

export type QueuePriority = 'urgent' | 'normal' | 'background';
export type ErrorType = 'rate_limit' | 'network' | 'server' | 'invalid' | 'unknown';

export interface QueueItem<T = any> {
  id: string;
  data: T;
  priority: QueuePriority;
  retryCount: number;
  addedAt: number;
  lastAttempt?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface DeadLetterItem<T = any> extends QueueItem<T> {
  failedAt: number;
  errorType: ErrorType;
  finalError: string;
}

export interface QueueMetrics {
  urgent: number;
  normal: number;
  background: number;
  dead: number;
  processing: number;
  successCount: number;
  failureCount: number;
  avgProcessingTime: number;
}

/**
 * Priority Queue implementation using a min-heap
 */
class PriorityQueue<T> {
  private items: Array<{ item: T; priority: number; sequence: number }> = [];
  private sequenceCounter: number = 0;

  constructor(private basePriority: number) {}

  enqueue(item: T, additionalPriority: number = 0): void {
    const priority = this.basePriority + additionalPriority;
    this.items.push({ item, priority, sequence: this.sequenceCounter++ });
    this.bubbleUp(this.items.length - 1);
  }

  dequeue(): T | undefined {
    if (this.isEmpty()) return undefined;

    const result = this.items[0].item;
    const last = this.items.pop()!;

    if (!this.isEmpty()) {
      this.items[0] = last;
      this.sinkDown(0);
    }

    return result;
  }

  peek(): T | undefined {
    return this.items[0]?.item;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const current = this.items[index];
      const parent = this.items[parentIndex];

      // Compare priority first, then sequence for FIFO order
      if (current.priority > parent.priority ||
          (current.priority === parent.priority && current.sequence >= parent.sequence)) {
        break;
      }

      [this.items[index], this.items[parentIndex]] = [parent, current];
      index = parentIndex;
    }
  }

  private sinkDown(index: number): void {
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;

      // Compare with left child
      if (left < this.items.length) {
        const leftItem = this.items[left];
        const smallestItem = this.items[smallest];
        if (leftItem.priority < smallestItem.priority ||
            (leftItem.priority === smallestItem.priority && leftItem.sequence < smallestItem.sequence)) {
          smallest = left;
        }
      }

      // Compare with right child
      if (right < this.items.length) {
        const rightItem = this.items[right];
        const smallestItem = this.items[smallest];
        if (rightItem.priority < smallestItem.priority ||
            (rightItem.priority === smallestItem.priority && rightItem.sequence < smallestItem.sequence)) {
          smallest = right;
        }
      }

      if (smallest === index) break;

      [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
      index = smallest;
    }
  }
}

/**
 * Distributed Queue with multiple priority levels
 */
export class DistributedQueue<T = any> {
  private queues = {
    urgent: new PriorityQueue<QueueItem<T>>(0),      // Priority 0 (highest)
    normal: new PriorityQueue<QueueItem<T>>(10),     // Priority 10
    background: new PriorityQueue<QueueItem<T>>(20), // Priority 20 (lowest)
    dead: new Map<string, DeadLetterItem<T>>()       // Permanent failures
  };

  private processing = new Set<string>();
  private metrics = {
    successCount: 0,
    failureCount: 0,
    totalProcessingTime: 0,
    processedCount: 0
  };

  private readonly MAX_RETRIES: Record<QueuePriority, number> = {
    urgent: 10,      // Try harder for user-initiated
    normal: 5,       // Standard retry count
    background: 3    // Don't waste resources on background
  };

  private readonly BACKOFF_MULTIPLIER: Record<ErrorType, number> = {
    rate_limit: 5,     // Slow down significantly for rate limits
    network: 2,        // Standard exponential backoff
    server: 3,         // Server issues need more time
    invalid: Infinity, // Never retry invalid data
    unknown: 2         // Default backoff
  };

  private readonly BASE_BACKOFF_MS = 1000; // 1 second base
  private readonly MAX_BACKOFF_MS = 60000; // 1 minute max

  constructor(
    private executor: (item: QueueItem<T>) => Promise<void>,
    private errorClassifier?: (error: any) => ErrorType
  ) {}

  /**
   * Add item to queue with specified priority
   */
  enqueue(data: T, priority: QueuePriority = 'normal', metadata?: Record<string, any>): string {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const item: QueueItem<T> = {
      id,
      data,
      priority,
      retryCount: 0,
      addedAt: Date.now(),
      metadata
    };

    // Add to appropriate queue based on priority
    this.queues[priority].enqueue(item, -item.addedAt); // Use negative timestamp for FIFO within priority

    return id;
  }

  /**
   * Process next item from queues
   */
  async processNext(): Promise<boolean> {
    // Check urgent queue first (always process if available)
    if (!this.queues.urgent.isEmpty()) {
      const item = this.queues.urgent.dequeue()!;
      await this.processItem(item, 'urgent');
      return true;
    }

    // Then check normal queue with 80% probability
    if (!this.queues.normal.isEmpty() && Math.random() < 0.8) {
      const item = this.queues.normal.dequeue()!;
      await this.processItem(item, 'normal');
      return true;
    }

    // Background gets remaining capacity (20%)
    if (!this.queues.background.isEmpty()) {
      const item = this.queues.background.dequeue()!;
      await this.processItem(item, 'background');
      return true;
    }

    return false; // No items to process
  }

  /**
   * Process all available items
   */
  async processAll(concurrency: number = 3): Promise<void> {
    const workers = Array(concurrency).fill(null).map(async () => {
      while (await this.processNext()) {
        // Continue processing until no items remain
      }
    });

    await Promise.all(workers);
  }

  /**
   * Process a single item
   */
  private async processItem(item: QueueItem<T>, priority: QueuePriority): Promise<void> {
    // Mark as processing
    this.processing.add(item.id);
    item.lastAttempt = Date.now();

    const startTime = Date.now();

    try {
      await this.executor(item);

      // Success - update metrics
      this.recordSuccess(item, Date.now() - startTime);
      this.processing.delete(item.id);

    } catch (error) {
      // Failure - handle retry or move to deadletter
      this.processing.delete(item.id);
      await this.handleFailure(item, error as Error, priority);
    }
  }

  /**
   * Handle item failure
   */
  private async handleFailure(item: QueueItem<T>, error: Error, priority: QueuePriority): Promise<void> {
    const errorType = this.classifyError(error);
    const maxRetries = this.MAX_RETRIES[priority];

    item.error = error.message;
    item.retryCount++;

    // Check if should move to deadletter
    if (item.retryCount >= maxRetries || errorType === 'invalid') {
      // Move to dead letter queue
      const deadItem: DeadLetterItem<T> = {
        ...item,
        failedAt: Date.now(),
        errorType,
        finalError: error.message
      };

      this.queues.dead.set(item.id, deadItem);
      this.metrics.failureCount++;

      console.error(`[DistributedQueue] Item ${item.id} moved to deadletter after ${item.retryCount} retries:`, error);

    } else {
      // Calculate backoff and requeue
      const backoff = this.calculateBackoff(item.retryCount, errorType);

      logger.logInfo('distributed-queue.retry', {
        itemId: item.id,
        attempt: item.retryCount,
        delayMs: backoff,
        errorType,
      });

      // Schedule requeue after backoff
      setTimeout(() => {
        this.queues[priority].enqueue(item, item.retryCount * 1000); // Add priority penalty for retries
      }, backoff);
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(retryCount: number, errorType: ErrorType): number {
    const multiplier = this.BACKOFF_MULTIPLIER[errorType];
    if (multiplier === Infinity) return Infinity;

    const backoff = this.BASE_BACKOFF_MS * Math.pow(2, retryCount - 1) * multiplier;
    return Math.min(backoff, this.MAX_BACKOFF_MS);
  }

  /**
   * Classify error type
   */
  private classifyError(error: Error): ErrorType {
    if (this.errorClassifier) {
      return this.errorClassifier(error);
    }

    const message = error.message.toLowerCase();

    if (message.includes('rate limit') || message.includes('too many')) {
      return 'rate_limit';
    }
    if (message.includes('network') || message.includes('fetch')) {
      return 'network';
    }
    if (message.includes('500') || message.includes('server')) {
      return 'server';
    }
    if (message.includes('invalid') || message.includes('bad request')) {
      return 'invalid';
    }

    return 'unknown';
  }

  /**
   * Record successful processing
   */
  private recordSuccess(item: QueueItem<T>, processingTime: number): void {
    this.metrics.successCount++;
    this.metrics.totalProcessingTime += processingTime;
    this.metrics.processedCount++;
  }

  /**
   * Get queue metrics
   */
  getMetrics(): QueueMetrics {
    return {
      urgent: this.queues.urgent.size(),
      normal: this.queues.normal.size(),
      background: this.queues.background.size(),
      dead: this.queues.dead.size,
      processing: this.processing.size,
      successCount: this.metrics.successCount,
      failureCount: this.metrics.failureCount,
      avgProcessingTime: this.metrics.processedCount > 0
        ? this.metrics.totalProcessingTime / this.metrics.processedCount
        : 0
    };
  }

  /**
   * Get items from dead letter queue
   */
  getDeadLetterItems(): DeadLetterItem<T>[] {
    return Array.from(this.queues.dead.values());
  }

  /**
   * Retry a dead letter item
   */
  retryDeadLetterItem(id: string): boolean {
    const deadItem = this.queues.dead.get(id);
    if (!deadItem) return false;

    // Reset retry count and move back to urgent queue
    const item: QueueItem<T> = {
      ...deadItem,
      retryCount: 0,
      error: undefined,
      priority: 'urgent' // Retry with urgent priority
    };

    this.queues.dead.delete(id);
    this.queues.urgent.enqueue(item, 0);

    return true;
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue(): number {
    const count = this.queues.dead.size;
    this.queues.dead.clear();
    return count;
  }

  /**
   * Get queue sizes
   */
  getQueueSizes(): Record<QueuePriority | 'dead' | 'processing', number> {
    return {
      urgent: this.queues.urgent.size(),
      normal: this.queues.normal.size(),
      background: this.queues.background.size(),
      dead: this.queues.dead.size,
      processing: this.processing.size
    };
  }

  /**
   * Check if all queues are empty
   */
  isEmpty(): boolean {
    return this.queues.urgent.isEmpty() &&
           this.queues.normal.isEmpty() &&
           this.queues.background.isEmpty() &&
           this.processing.size === 0;
  }
}

// Export singleton helper for global queue
let globalQueueInstance: DistributedQueue | null = null;

export function getGlobalQueue<T = any>(
  executor?: (item: QueueItem<T>) => Promise<void>
): DistributedQueue<T> {
  if (!globalQueueInstance && executor) {
    globalQueueInstance = new DistributedQueue(executor);
  }
  if (!globalQueueInstance) {
    throw new Error('Global queue not initialized. Provide executor on first call.');
  }
  return globalQueueInstance as DistributedQueue<T>;
}
