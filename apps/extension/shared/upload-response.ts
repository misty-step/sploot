import type { SplootApiUploadResponse } from '@sploot/common';

export interface UploadResult {
  assetId: string;
  blobUrl: string;
  thumbnailUrl: string;
  isDuplicate: boolean;
}

export function toUploadResult(response: SplootApiUploadResponse): UploadResult {
  if (!('asset' in response) || response.success !== true) {
    throw new Error(response.error || 'Upload failed');
  }

  return {
    assetId: response.asset.id,
    blobUrl: response.asset.blobUrl,
    thumbnailUrl: response.asset.thumbnailUrl ?? response.asset.blobUrl,
    isDuplicate: response.isDuplicate ?? false,
  };
}
