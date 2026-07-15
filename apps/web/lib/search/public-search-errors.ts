import type { SplootApiErrorCode } from '@sploot/common';
import { EmbeddingError } from '@/lib/embeddings';

export interface PublicSearchFailure {
  status: number;
  code: SplootApiErrorCode;
  message: string;
  retryable: boolean;
}

/** Convert provider/admission failures to the stable public search taxonomy. */
export function mapPublicEmbeddingError(error: unknown): PublicSearchFailure {
  const status = error instanceof EmbeddingError && error.statusCode === 429 ? 429 :
    error instanceof EmbeddingError && error.statusCode === 503 ? 503 : 500;
  if (status === 429) {
    return { status, code: 'rate_limited', message: 'Search is rate limited. Try again later.', retryable: true };
  }
  if (status === 503) {
    return { status, code: 'embeddings_disabled', message: 'Search is temporarily unavailable.', retryable: true };
  }
  return { status, code: 'server_error', message: 'Search is temporarily unavailable.', retryable: false };
}

export function publicSearchFailure(error: unknown): PublicSearchFailure {
  return mapPublicEmbeddingError(error);
}
