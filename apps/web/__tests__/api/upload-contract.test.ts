import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  ingestImage: vi.fn(),
  uploadGateEnabled: true,
}));

vi.mock('@/lib/auth/request-auth', () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock('@/lib/auth/api', () => ({
  isUnauthorizedAuthError: () => false,
  unauthorizedResponse: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
}));

vi.mock('@/lib/env', () => ({ blobConfigured: true }));

vi.mock('@/lib/upload/ingest-image', () => ({
  ingestImage: mocks.ingestImage,
}));

vi.mock('@/lib/runtime-gates', () => ({
  getRuntimeGate: () => ({
    name: 'uploads',
    enabled: mocks.uploadGateEnabled,
    code: 'uploads_disabled',
    message: 'Uploads are temporarily paused',
  }),
  runtimeGateResponse: () => Response.json(
    { error: 'Uploads are temporarily paused' },
    { status: 503 },
  ),
}));

vi.mock('@/lib/quota/storage-quota-policy', () => ({
  storageQuotaError: vi.fn(),
  StorageQuotaExceededError: class StorageQuotaExceededError extends Error {},
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('next/navigation', () => ({ unstable_rethrow: vi.fn() }));
vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: unknown) => handler,
}));

import { POST } from '@/app/api/upload/route';

function uploadRequest(): NextRequest {
  const form = new FormData();
  form.append('file', new File(['image-bytes'], 'asset.png', { type: 'image/png' }));
  return new NextRequest('http://localhost:3000/api/upload', {
    method: 'POST',
    body: form,
  });
}

function boundaryBody(response: Response): Promise<Record<string, unknown>> {
  return response.json().then((body: unknown) => JSON.parse(JSON.stringify(body)) as Record<string, unknown>);
}

function ingestedAsset() {
  return {
    id: 'asset-upload',
    blobUrl: 'https://blob.test/upload.png',
    thumbnailUrl: 'https://blob.test/upload-thumb.png',
  };
}

function expectedAsset() {
  return {
    id: 'asset-upload',
    blobUrl: 'https://blob.test/upload.png',
    thumbnailUrl: 'https://blob.test/upload-thumb.png',
  };
}

describe('POST /api/upload public JSON contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue({
      status: 'authenticated',
      principal: { userId: 'user-1' },
    });
    mocks.uploadGateEnabled = true;
  });

  it('serializes created multipart uploads through the canonical public asset DTO', async () => {
    mocks.ingestImage.mockResolvedValue({ kind: 'created', asset: ingestedAsset() });

    const response = await POST(uploadRequest());
    const body = await boundaryBody(response);

    expect(response.status).toBe(201);
    expect(Object.keys(body).sort()).toEqual(['asset', 'isDuplicate', 'message', 'success']);
    expect(body).toEqual({
      success: true,
      isDuplicate: false,
      asset: expectedAsset(),
      message: 'Upload successful',
    });
  });

  it('serializes duplicate multipart uploads through the same DTO and status contract', async () => {
    mocks.ingestImage.mockResolvedValue({ kind: 'duplicate', asset: ingestedAsset() });

    const response = await POST(uploadRequest());
    const body = await boundaryBody(response);

    expect(response.status).toBe(409);
    expect(Object.keys(body).sort()).toEqual(['asset', 'isDuplicate', 'message', 'success']);
    expect(body).toEqual({
      success: true,
      isDuplicate: true,
      asset: expectedAsset(),
      message: 'This image already exists in your library',
    });
  });

  it('keeps invalid multipart errors explicit and JSON-safe', async () => {
    mocks.ingestImage.mockResolvedValue({
      kind: 'invalid',
      error: { userMessage: 'invalid image', statusCode: 422 },
    });

    const response = await POST(uploadRequest());
    const body = await boundaryBody(response);

    expect(response.status).toBe(422);
    expect(Object.keys(body)).toEqual(['success', 'error']);
    expect(body).toEqual({ success: false, error: 'invalid image' });
  });

  it('keeps missing-file errors explicit', async () => {
    const response = await POST(new NextRequest('http://localhost:3000/api/upload', { method: 'POST', body: new FormData() }));
    const body = await boundaryBody(response);

    expect(response.status).toBe(400);
    expect(Object.keys(body).sort()).toEqual(['error', 'success']);
    expect(body).toEqual({ success: false, error: 'No file provided' });
  });
});
