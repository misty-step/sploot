import Replicate from 'replicate';
import { getCacheService } from './cache';

// Updated to working CLIP model (SigLIP model was deprecated)
export const CLIP_MODEL = 'krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4';
export const EMBEDDING_DIMENSION = 768; // CLIP embedding dimension
export const MAX_RETRY_ATTEMPTS = 3;
export const DEFAULT_TIMEOUT = 30000;

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimension: number;
  processingTime: number;
}

export interface EmbeddingServiceConfig {
  apiToken: string;
  model?: string;
  timeout?: number;
  retryAttempts?: number;
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

/**
 * Service for generating embeddings using Replicate's SigLIP model.
 * Handles both text and image embeddings with automatic caching and retry logic.
 */
export class ReplicateEmbeddingService {
  private replicate: Replicate;
  private model: string;
  private timeout: number;
  private retryAttempts: number;

  constructor(config: EmbeddingServiceConfig) {
    this.replicate = new Replicate({
      auth: config.apiToken,
    });
    this.model = config.model || CLIP_MODEL;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.retryAttempts = config.retryAttempts || MAX_RETRY_ATTEMPTS;
  }

  async embedText(query: string): Promise<EmbeddingResult> {
    const startTime = Date.now();

    // Check cache first
    const cache = getCacheService();
    const cachedEmbedding = await cache.getTextEmbedding(query);
    if (cachedEmbedding) {
      return {
        embedding: cachedEmbedding,
        model: this.model,
        dimension: cachedEmbedding.length,
        processingTime: Date.now() - startTime,
      };
    }

    try {
      const result = await this.withRetry(
        async () => {
          const output = await this.replicate.run(
            this.model as `${string}/${string}:${string}`,
            {
              input: {
                text: query,
              },
            }
          );
          return output;
        },
        `Embedding text: ${query.substring(0, 50)}...`
      );

      const embedding = Array.isArray(result) ? result : (result as any).embedding;

      if (!embedding || !Array.isArray(embedding)) {
        throw new EmbeddingError('Invalid embedding response from model');
      }

      // Cache the result
      await cache.setTextEmbedding(query, embedding);

      return {
        embedding,
        model: this.model,
        dimension: embedding.length,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      if (error instanceof EmbeddingError) {
        throw error;
      }

      // Error generating text embedding
      throw new EmbeddingError(
        `Failed to generate text embedding: ${(error as Error).message}`,
        500,
        true
      );
    }
  }

  /**
   * Generate embeddings for image from URL.
   * Uses checksum for cache key when available for better deduplication.
   * @throws {EmbeddingError} If embedding generation fails after retries
   */
  async embedImage(imageUrl: string, checksum?: string): Promise<EmbeddingResult> {
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
      const result = await this.withRetry(
        async () => {
          const output = await this.replicate.run(
            this.model as `${string}/${string}:${string}`,
            {
              input: {
                image: imageUrl,
              },
            }
          );
          return output;
        },
        `Embedding image from: ${imageUrl.substring(0, 50)}...`
      );

      const embedding = Array.isArray(result) ? result : (result as any).embedding;

      if (!embedding || !Array.isArray(embedding)) {
        throw new EmbeddingError('Invalid embedding response from model');
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
      if (error instanceof EmbeddingError) {
        throw error;
      }

      // Error generating image embedding
      throw new EmbeddingError(
        `Failed to generate image embedding: ${(error as Error).message}`,
        500,
        true
      );
    }
  }

  async embedBatch(items: Array<{ type: 'text' | 'image'; content: string }>): Promise<EmbeddingResult[]> {
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

  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Retry attempt failed

        if (
          error instanceof EmbeddingError &&
          !error.retryable ||
          attempt === this.retryAttempts
        ) {
          break;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}

/**
 * Factory function to create embedding service instance.
 * @throws {EmbeddingError} If API token not configured
 */
export function createEmbeddingService(): ReplicateEmbeddingService {
  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!apiToken || apiToken === 'your_replicate_token_here') {
    throw new EmbeddingError('Replicate API token not configured');
  }

  return new ReplicateEmbeddingService({ apiToken });
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

  return embedding.map(val => val / magnitude);
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
