import { isVideoMimeType } from '@sploot/common';

export type EmbeddingMediaSkipReason = 'video_without_poster';

export interface EmbeddingMediaInput {
  mime: string;
  blobUrl: string;
  thumbnailUrl?: string | null;
}

export type EmbeddingMediaSelection =
  | {
      sourceUrl: string;
      sourceKind: 'blob' | 'thumbnail';
      skipReason?: never;
    }
  | {
      sourceUrl: null;
      sourceKind: 'unsupported';
      skipReason: EmbeddingMediaSkipReason;
    };

function normalizeEmbeddingMediaUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? candidate : null;
  } catch {
    return null;
  }
}

export function resolveEmbeddingMediaSource(
  input: EmbeddingMediaInput
): EmbeddingMediaSelection {
  const mime = input.mime ?? '';
  const thumbnailUrl = normalizeEmbeddingMediaUrl(input.thumbnailUrl);

  if (isVideoMimeType(mime) && !thumbnailUrl) {
    return {
      sourceUrl: null,
      sourceKind: 'unsupported',
      skipReason: 'video_without_poster',
    };
  }

  if (thumbnailUrl) {
    return {
      sourceUrl: thumbnailUrl,
      sourceKind: 'thumbnail',
    };
  }

  return {
    sourceUrl: input.blobUrl,
    sourceKind: 'blob',
  };
}
