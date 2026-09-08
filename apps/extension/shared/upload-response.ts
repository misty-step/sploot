import type { SplootApiUploadResponse } from '@sploot/common';

export interface UploadResult {
  assetId: string;
  blobUrl: string;
  thumbnailUrl: string;
  isDuplicate: boolean;
}

export function toUploadResult(response: SplootApiUploadResponse): UploadResult {
  if (response?.success !== true || !response.asset) {
    throw new Error(response?.error || 'Sploot did not confirm this save. Check your library before retrying.');
  }
  if (
    typeof response.asset.id !== 'string' || !response.asset.id
    || typeof response.asset.blobUrl !== 'string' || !response.asset.blobUrl
    || (response.isDuplicate !== undefined && typeof response.isDuplicate !== 'boolean')
  ) {
    throw new Error('Sploot returned an incomplete save receipt. Check your library before retrying.');
  }

  return {
    assetId: response.asset.id,
    blobUrl: response.asset.blobUrl,
    thumbnailUrl: response.asset.blobUrl,
    isDuplicate: response.isDuplicate ?? false,
  };
}
