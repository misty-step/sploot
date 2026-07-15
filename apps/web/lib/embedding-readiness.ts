import type { SplootApiEmbeddingReadiness } from '@sploot/common';

export function embeddingReadinessLabel(status: SplootApiEmbeddingReadiness | undefined): string {
  switch (status ?? 'pending') {
    case 'ready': return 'embedding ready';
    case 'failed': return 'embedding failed';
    case 'unavailable': return 'embedding unavailable';
    case 'processing': return 'embedding processing';
    default: return 'embedding pending';
  }
}
