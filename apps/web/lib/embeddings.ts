import Replicate from 'replicate';
import { getCacheService } from './cache';
import { getRuntimeGate } from './runtime-gates';
import {
  acquireEmbeddingDailyBudget,
  acquireEmbeddingRateLimit,
  releaseEmbeddingRateLimit,
  type EmbeddingDailyBudgetReason,
  type EmbeddingRateLimitLease,
  type EmbeddingRateLimitReason,
} from './embedding-rate-limit';
import { ENROLLMENT_UNAVAILABLE_CODE } from './enrollment/enrollment-policy';

// Updated to working CLIP model (SigLIP model was deprecated)
export const CLIP_MODEL =
  'krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4';
export const DEFAULT_TIMEOUT = 20000;

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimension: number;
  processingTime: number;
}

interface EmbeddingServiceConfig {
  apiToken: string;
  userId: string;
  model?: string;
  timeout?: number;
}

export interface EmbeddingService {
  embedText(query: string): Promise<EmbeddingResult>;
  embedImage(imageUrl: string, checksum?: string): Promise<EmbeddingResult>;
  embedBatch(
    items: Array<{ type: 'text' | 'image'; content: string }>
  ): Promise<EmbeddingResult[]>;
}

export class EmbeddingError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

export type EmbeddingAdmissionReason =
  | EmbeddingRateLimitReason
  | EmbeddingDailyBudgetReason;

export class EmbeddingAdmissionError extends EmbeddingError {
  readonly code: 'enrollment_unavailable' | undefined;
  constructor(
    public reason: EmbeddingAdmissionReason,
    public retryAfterSec?: number
  ) {
    const unavailable = reason === 'limiter_unavailable';
    super(
      unavailable
        ? 'Embedding admission is temporarily unavailable'
        : 'Embedding generation is rate limited',
      unavailable ? 503 : 429,
      true
    );
    this.code = unavailable ? ENROLLMENT_UNAVAILABLE_CODE : undefined;
    this.name = 'EmbeddingAdmissionError';
  }
}

/**
 * Service for generating embeddings using Replicate's SigLIP model.
 * Handles both text and image embeddings with automatic caching.
 * Each paid admission permits exactly one provider prediction attempt.
 */
class ReplicateEmbeddingService implements EmbeddingService {
  private replicate: Replicate;
  private userId: string;
  private model: string;
  private timeout: number;

  constructor(config: EmbeddingServiceConfig) {
    this.replicate = new Replicate({
      auth: config.apiToken,
    });
    this.userId = config.userId;
    this.model = config.model || CLIP_MODEL;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
  }

  async embedText(query: string): Promise<EmbeddingResult> {
    const startTime = Date.now();

    // Check cache first
    const cache = getCacheService();
    const cachedEmbedding = await cache.getTextEmbedding(query, this.model);
    if (cachedEmbedding) {
      return {
        embedding: cachedEmbedding,
        model: this.model,
        dimension: cachedEmbedding.length,
        processingTime: Date.now() - startTime,
      };
    }

    try {
      const result = await this.withPaidAdmission(() =>
        this.withTimeout(
          (signal) =>
            this.replicate.run(
              this.model as `${string}/${string}:${string}`,
              {
                input: {
                  text: query,
                },
                wait: { mode: 'poll' },
                signal,
              }
            ),
          `Embedding text: ${query.substring(0, 50)}...`
        )
      );

      const embedding = Array.isArray(result)
        ? result
        : (result as any).embedding;

      if (!embedding || !Array.isArray(embedding)) {
        throw new EmbeddingError(
          'Invalid embedding response from model',
          502,
          false
        );
      }

      // Cache the result
      await cache.setTextEmbedding(query, embedding, this.model);

      return {
        embedding,
        model: this.model,
        dimension: embedding.length,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      throw this.normalizeError(error, 'text');
    }
  }

  /**
   * Generate embeddings for image from URL.
   * Uses checksum for cache key when available for better deduplication.
   * @throws {EmbeddingError} If embedding generation fails
   */
  async embedImage(
    imageUrl: string,
    checksum?: string
  ): Promise<EmbeddingResult> {
    const startTime = Date.now();

    // Check cache first if we have a checksum
    const cache = getCacheService();
    if (checksum) {
      const cachedEmbedding = await cache.getImageEmbedding(checksum);
      if (cachedEmbedding) {
        return {
          embedding: cachedEmbedding,
          model: this.model,
          dimension: cachedEmbedding.length,
          processingTime: Date.now() - startTime,
        };
      }
    }

    try {
      const result = await this.withPaidAdmission(() =>
        this.withTimeout(
          (signal) =>
            this.replicate.run(
              this.model as `${string}/${string}:${string}`,
              {
                input: {
                  image: imageUrl,
                },
                wait: { mode: 'poll' },
                signal,
              }
            ),
          `Embedding image from: ${imageUrl.substring(0, 50)}...`
        )
      );

      const embedding = Array.isArray(result)
        ? result
        : (result as any).embedding;

      if (!embedding || !Array.isArray(embedding)) {
        throw new EmbeddingError(
          'Invalid embedding response from model',
          502,
          false
        );
      }

      // Cache the result
      if (checksum) {
        await cache.setImageEmbedding(checksum, embedding);
      }

      return {
        embedding,
        model: this.model,
        dimension: embedding.length,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      throw this.normalizeError(error, 'image');
    }
  }

  async embedBatch(
    items: Array<{ type: 'text' | 'image'; content: string }>
  ): Promise<EmbeddingResult[]> {
    const results = await Promise.all(
      items.map(async (item) => {
        if (item.type === 'text') {
          return this.embedText(item.content);
        } else {
          return this.embedImage(item.content);
        }
      })
    );

    return results;
  }

  private async withPaidAdmission<T>(operation: () => Promise<T>): Promise<T> {
    const rateLimit = await acquireEmbeddingRateLimit(this.userId);
    if (!rateLimit.allowed) {
      throw new EmbeddingAdmissionError(
        rateLimit.reason ?? 'limiter_unavailable',
        rateLimit.retryAfterSec
      );
    }

    const lease: EmbeddingRateLimitLease | null = rateLimit.lease ?? null;
    if (!lease) {
      throw new EmbeddingAdmissionError('limiter_unavailable', 30);
    }

    try {
      const dailyBudget = await acquireEmbeddingDailyBudget();
      if (!dailyBudget.allowed) {
        throw new EmbeddingAdmissionError(
          dailyBudget.reason ?? 'limiter_unavailable',
          dailyBudget.retryAfterSec
        );
      }

      return await operation();
    } finally {
      await releaseEmbeddingRateLimit(lease);
    }
  }

  private async withTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    context: string
  ): Promise<T> {
    const controller = new AbortController();

    if (!this.timeout || this.timeout <= 0) {
      return operation(controller.signal);
    }

    const timeoutError = new EmbeddingError(
      `${context} timed out after ${this.timeout}ms`,
      504,
      true
    );
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort(timeoutError);
    }, this.timeout);

    try {
      const result = await operation(controller.signal);
      if (timedOut) {
        throw timeoutError;
      }
      return result;
    } catch (error) {
      if (timedOut) {
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private normalizeError(error: unknown, context: string): EmbeddingError {
    if (error instanceof EmbeddingError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const status = (error as any)?.status ?? (error as any)?.statusCode;

    if (typeof status === 'number') {
      if (status >= 400 && status < 500 && status !== 429) {
        return new EmbeddingError(
          `Embedding ${context} failed: ${message}`,
          status,
          false
        );
      }

      return new EmbeddingError(
        `Embedding ${context} failed: ${message}`,
        status,
        true
      );
    }

    if (message.toLowerCase().includes('timeout')) {
      return new EmbeddingError(
        `Embedding ${context} timed out: ${message}`,
        504,
        true
      );
    }

    return new EmbeddingError(
      `Embedding ${context} failed: ${message}`,
      500,
      true
    );
  }
}

/**
 * Factory function to create embedding service instance.
 * @throws {EmbeddingError} If API token not configured
 */
export function createEmbeddingService(userId: string): EmbeddingService {
  const embeddingGate = getRuntimeGate('embeddings');
  if (!embeddingGate.enabled) {
    throw new EmbeddingError(embeddingGate.message, 503, true);
  }

  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!apiToken || apiToken === 'your_replicate_token_here') {
    throw new EmbeddingError('Replicate API token not configured');
  }

  if (!userId) {
    throw new EmbeddingError('Embedding user identity is required', 500, false);
  }

  return new ReplicateEmbeddingService({ apiToken, userId });
}

/**
 * Normalize embedding vector to unit length for cosine similarity.
 */
export function normalizeEmbedding(embedding: number[]): number[] {
  const magnitude = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0)
  );

  if (magnitude === 0) {
    return embedding;
  }

  return embedding.map((val) => val / magnitude);
}

/**
 * Calculate cosine similarity between two embedding vectors.
 * Returns value between -1 and 1, where 1 indicates identical direction.
 * @throws {Error} If vectors have different dimensions
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimension');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);

  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}
