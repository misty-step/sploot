import { describe, expect, it } from 'vitest';
import type {
  SearchResponse,
  SearchResultItem,
  UploadedAsset,
} from '../client.js';
import {
  parseSplootApiSearchResponse,
  parseSplootApiUploadResponse,
} from '@sploot/common/api-types';

const asset: UploadedAsset = {
  id: 'asset-1',
  blobUrl: 'https://blob.test/asset-1.png',
  thumbnailUrl: null,
};

const searchResult: SearchResultItem = {
  id: asset.id,
  blobUrl: asset.blobUrl,
  thumbnailUrl: asset.thumbnailUrl,
  similarity: 0.95,
  relevance: 95,
};

type PrivateOrVectorKeys = Extract<
  keyof SearchResultItem,
  'ownerUserId' | 'embeddingVector' | 'image_embedding' | 'total_count'
>;
const noPrivateOrVectorKeys: PrivateOrVectorKeys extends never ? true : false = true;
type UploadPrivateOrEmbeddingKeys = Extract<
  keyof UploadedAsset,
  'embedding' | 'embeddingError' | 'embeddingVector' | 'modelName' | 'modelVersion' | 'dim' | 'updatedAt' | 'pathname' | 'filename' | 'mimeType' | 'checksum' | 'phash' | 'nearDuplicate' | 'needsEmbedding'
>;
const noUploadPrivateOrEmbeddingKeys: UploadPrivateOrEmbeddingKeys extends never ? true : false = true;

describe('MCP public DTO types', () => {
  it('compile against the canonical safe upload and search DTOs', () => {
    const response: SearchResponse = {
      results: [searchResult],
      query: 'cat',
      total: 1,
      limit: 30,
      requestedLimit: 30,
      threshold: 0.2,
      requestedThreshold: 0.2,
      processingTime: 1,
    };

    expect(response.results[0]).toEqual(searchResult);
    expect(noPrivateOrVectorKeys).toBe(true);
    expect(noUploadPrivateOrEmbeddingKeys).toBe(true);
  });

  it('uses the common runtime parser to reject unknown, nested, and unsafe shapes', () => {
    const search = {
      results: [searchResult],
      query: 'cat',
      total: 1,
      limit: 1,
      requestedLimit: 1,
      threshold: 0.2,
      requestedThreshold: 0.2,
      processingTime: 1,
    };
    expect(parseSplootApiSearchResponse({ ...search, __proto__: { leaked: true } })).toBeNull();
    expect(parseSplootApiSearchResponse(JSON.parse('{"results":[],"query":"cat","total":0,"limit":0,"requestedLimit":0,"threshold":0.2,"requestedThreshold":0.2,"processingTime":1,"__proto__":{}}'))).toBeNull();
    expect(parseSplootApiSearchResponse({ ...search, extra: true })).toBeNull();

    const upload = {
      success: true,
      isDuplicate: false,
      asset,
      message: 'Upload successful',
    };
    expect(parseSplootApiUploadResponse({
      ...upload,
      asset: { ...asset, metadata: { provider: 'private' } },
    })).toBeNull();
    const unsafe = Object.create({ success: true });
    unsafe.isDuplicate = false;
    unsafe.asset = asset;
    unsafe.message = 'Upload successful';
    expect(parseSplootApiUploadResponse(unsafe)).toBeNull();
  });
});
