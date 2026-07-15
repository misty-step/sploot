import Replicate from 'replicate';
import { EMBEDDING_DIMENSION } from '@sploot/common';
import { getCacheService } from './cache';
import { getRuntimeGate } from './runtime-gates';
import {
  acquireEmbeddingAdmissionReservation,
  refundEmbeddingAdmissionCapacity,
  releaseEmbeddingRateLimit,
  type EmbeddingRateLimitLease,
} from './embedding-rate-limit';
import {
  EmbeddingAdmissionError,
  type EmbeddingAdmissionReason,
} from './embedding-admission';
import {
  attachEmbeddingProviderLease,
  getEmbeddingProviderLease,
  EmbeddingError,
  EmbeddingProviderCircuitOpenError,
  EmbeddingProviderRateLimitError,
  EmbeddingProviderUnavailableError,
  EmbeddingConfigurationError,
} from './embedding-errors';
import {
  acquireEmbeddingProviderAdmission,
  getEmbeddingProviderCircuit,
  isCircuitOpeningAdmissionReason,
  recordEmbeddingAdmissionFailure,
  recordEmbeddingProviderFailure,
  recordEmbeddingProviderSuccess,
  type EmbeddingProviderCircuitLease,
} from './embedding-resilience';

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

interface ReplicateResponseEnvelope {
  status?: unknown;
  statusCode?: unknown;
  headers?: unknown;
}

interface ReplicateErrorEnvelope extends ReplicateResponseEnvelope {
  response?: ReplicateResponseEnvelope;
  retryAfter?: unknown;
  retryAfterSec?: unknown;
}

function asReplicateErrorEnvelope(error: unknown): ReplicateErrorEnvelope {
  return error && typeof error === 'object'
    ? (error as ReplicateErrorEnvelope)
    : {};
}

export interface EmbeddingService {
  embedText(query: string): Promise<EmbeddingResult>;
  embedImage(imageUrl: string, checksum?: string): Promise<EmbeddingResult>;
  embedBatch(
    items: Array<{ type: 'text' | 'image'; content: string }>
  ): Promise<EmbeddingResult[]>;
}

export { EmbeddingAdmissionError } from './embedding-admission';
export type { EmbeddingAdmissionReason } from './embedding-admission';
export {
  EmbeddingError,
  EmbeddingProviderCircuitOpenError,
  EmbeddingProviderRateLimitError,
  EmbeddingProviderUnavailableError,
  EmbeddingConfigurationError,
} from './embedding-errors';

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
      const admitted = await this.withPaidAdmission(() =>
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
        ).then((result) => this.validateProviderOutput(result, 'text'))
      );
      const embedding = admitted.value;

      await recordEmbeddingProviderSuccess(admitted.lease);

      // Cache the result
      await cache.setTextEmbedding(query, embedding, this.model);

      return {
        embedding,
        model: this.model,
        dimension: embedding.length,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      const normalized = this.normalizeError(error, 'text');
      if (
        normalized instanceof EmbeddingAdmissionError &&
        isCircuitOpeningAdmissionReason(normalized.reason)
      ) {
        await recordEmbeddingAdmissionFailure(
          normalized.reason,
          normalized.retryAfterSec
        );
      }
      if (
        normalized instanceof EmbeddingProviderRateLimitError ||
        normalized instanceof EmbeddingProviderUnavailableError
      ) {
        const lease = getEmbeddingProviderLease(normalized);
        if (lease) {
          await recordEmbeddingProviderFailure(
            lease,
            normalized.reason,
            normalized.retryAfterSec
          );
        }
      }
      throw normalized;
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
      const cachedEmbedding = await cache.getImageEmbedding(checksum, this.model);
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
      const admitted = await this.withPaidAdmission(() =>
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
        ).then((result) => this.validateProviderOutput(result, 'image'))
      );
      const embedding = admitted.value;

      await recordEmbeddingProviderSuccess(admitted.lease);

      // Cache the result
      if (checksum) {
        await cache.setImageEmbedding(checksum, this.model, embedding);
      }

      return {
        embedding,
        model: this.model,
        dimension: embedding.length,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      const normalized = this.normalizeError(error, 'image');
      if (
        normalized instanceof EmbeddingAdmissionError &&
        isCircuitOpeningAdmissionReason(normalized.reason)
      ) {
        await recordEmbeddingAdmissionFailure(
          normalized.reason,
          normalized.retryAfterSec
        );
      }
      if (
        normalized instanceof EmbeddingProviderRateLimitError ||
        normalized instanceof EmbeddingProviderUnavailableError
      ) {
        const lease = getEmbeddingProviderLease(normalized);
        if (lease) {
          await recordEmbeddingProviderFailure(
            lease,
            normalized.reason,
            normalized.retryAfterSec
          );
        }
      }
      throw normalized;
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

  private async withPaidAdmission<T>(
    operation: () => Promise<T>
  ): Promise<{ value: T; lease: EmbeddingProviderCircuitLease }> {
    // Read the shared circuit before taking any local/minute/daily capacity.
    // A recovery probe is acquired only after those denials have passed, so a
    // user/global/daily denial cannot strand a probe lease.
    const providerCircuit = await getEmbeddingProviderCircuit();
    if (!providerCircuit.available) {
      throw new EmbeddingAdmissionError(
        'limiter_unavailable',
        providerCircuit.retryAfterSec
      );
    }
    if (providerCircuit.open) {
      throw new EmbeddingProviderCircuitOpenError(providerCircuit.retryAfterSec);
    }

    let reservedLease: EmbeddingRateLimitLease | undefined;
    let reservationRefundRequired = false;
    try {
      const admissionReservation = await acquireEmbeddingAdmissionReservation(this.userId);
      if (!admissionReservation.allowed || !admissionReservation.reservation) {
        throw new EmbeddingAdmissionError(
          admissionReservation.reason ?? 'limiter_unavailable',
          admissionReservation.retryAfterSec
        );
      }

      const { lease, dailyReservation } = admissionReservation.reservation;
      reservedLease = lease;
      const providerAdmission = await acquireEmbeddingProviderAdmission();
      if (!providerAdmission.allowed || !providerAdmission.lease) {
        // The circuit can open after the paid reservation commits. Refund the
        // exact minute/day/month reservation that was actually persisted.
        reservationRefundRequired = true;
        await refundEmbeddingAdmissionCapacity(lease, dailyReservation);
        reservationRefundRequired = false;
        if (providerAdmission.reason === 'provider_rate_limit') {
          throw new EmbeddingProviderCircuitOpenError(
            providerAdmission.retryAfterSec
          );
        }
        throw new EmbeddingAdmissionError(
          'limiter_unavailable',
          providerAdmission.retryAfterSec
        );
      }

      try {
        return {
          value: await operation(),
          lease: providerAdmission.lease,
        };
      } catch (error) {
        attachEmbeddingProviderLease(error, providerAdmission.lease);
        throw error;
      }
    } finally {
      if (!reservationRefundRequired) {
        await releaseEmbeddingRateLimit(reservedLease);
      }
    }
  }

  private validateProviderOutput(result: unknown, context: string): number[] {
    const embedding = Array.isArray(result)
      ? result
      : result && typeof result === 'object' && 'embedding' in result
        ? (result as { embedding?: unknown }).embedding
        : undefined;

    if (
      !Array.isArray(embedding) ||
      embedding.length !== EMBEDDING_DIMENSION ||
      embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value))
    ) {
      throw new EmbeddingProviderUnavailableError(
        `Invalid ${context} embedding response from model`,
      );
    }

    return embedding;
  }

  private async withTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    context: string
  ): Promise<T> {
    const controller = new AbortController();

    if (!this.timeout || this.timeout <= 0) {
      return operation(controller.signal);
    }

    const timeoutError = new EmbeddingProviderUnavailableError(
      `${context} timed out after ${this.timeout}ms`,
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

  private normalizeError(
    error: unknown,
    context: string
  ): EmbeddingError {
    if (error instanceof EmbeddingAdmissionError) {
      return error;
    }

    if (error instanceof EmbeddingProviderRateLimitError || error instanceof EmbeddingProviderUnavailableError) {
      return error;
    }

    if (error instanceof EmbeddingError) {
      return error;
    }

    // Replicate's ApiError keeps the HTTP response under `response`; retain
    // that provider contract here so real 429/5xx outcomes do not fall
    // through to the generic unavailable path.
    const envelope = asReplicateErrorEnvelope(error);
    const response = envelope.response;
    const status =
      envelope.status ??
      envelope.statusCode ??
      response?.status ??
      response?.statusCode;
    const message =
      error instanceof Error
        ? error.message
        : typeof status === 'number'
          ? `provider returned HTTP ${status}`
          : String(error);

    if (typeof status === 'number') {
      if (status === 429) {
        const rateLimited = new EmbeddingProviderRateLimitError(
          this.retryAfterSeconds(error)
        );
        const lease = getEmbeddingProviderLease(error);
        if (lease) attachEmbeddingProviderLease(rateLimited, lease);
        return rateLimited;
      }

      if (status >= 500) {
        const unavailable = new EmbeddingProviderUnavailableError(
          `Embedding ${context} failed: ${message}`,
          this.retryAfterSeconds(error),
        );
        const lease = getEmbeddingProviderLease(error);
        if (lease) attachEmbeddingProviderLease(unavailable, lease);
        return unavailable;
      }

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
      const unavailable = new EmbeddingProviderUnavailableError(
        `Embedding ${context} timed out: ${message}`,
      );
      const lease = getEmbeddingProviderLease(error);
      if (lease) attachEmbeddingProviderLease(unavailable, lease);
      return unavailable;
    }

    const unavailable = new EmbeddingProviderUnavailableError(
      `Embedding ${context} failed: ${message}`,
    );
    const lease = getEmbeddingProviderLease(error);
    if (lease) attachEmbeddingProviderLease(unavailable, lease);
    return unavailable;
  }

  private retryAfterSeconds(error: unknown): number | undefined {
    const response = (error as { response?: { headers?: unknown } })?.response;
    const value = (error as { retryAfterSec?: unknown })?.retryAfterSec;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
    const retryAfter = (error as { retryAfter?: unknown })?.retryAfter;
    if (typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0) {
      return retryAfter;
    }
    const headers = response?.headers as
      | { get?: (name: string) => unknown; [key: string]: unknown }
      | undefined;
    const responseRetryAfter = typeof headers?.get === 'function'
      ? headers.get('retry-after')
      : headers?.['retry-after'] ?? headers?.['Retry-After'];
    const retryAfterText = typeof responseRetryAfter === 'string'
      ? responseRetryAfter.trim()
      : undefined;
    const parsedResponseRetryAfter = retryAfterText === undefined
      ? responseRetryAfter
      : Number(retryAfterText);
    if (
      typeof parsedResponseRetryAfter === 'number' &&
      Number.isFinite(parsedResponseRetryAfter) &&
      parsedResponseRetryAfter > 0
    ) {
      return parsedResponseRetryAfter;
    }
    if (retryAfterText) {
      const retryAtMs = Date.parse(retryAfterText);
      if (Number.isFinite(retryAtMs) && retryAtMs > Date.now()) {
        return Math.max(1, Math.ceil((retryAtMs - Date.now()) / 1000));
      }
    }
    return undefined;
  }
}

/**
 * Factory function to create embedding service instance.
 * @throws {EmbeddingError} If API token not configured
 */
export function createEmbeddingService(userId: string): EmbeddingService {
  const embeddingGate = getRuntimeGate('embeddings');
  if (!embeddingGate.enabled) {
    throw new EmbeddingConfigurationError(embeddingGate.message);
  }

  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!apiToken || apiToken === 'your_replicate_token_here') {
    throw new EmbeddingConfigurationError('Replicate API token not configured');
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
