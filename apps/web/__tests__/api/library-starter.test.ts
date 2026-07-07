import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  ingestImage: vi.fn(),
  upsertAssetEmbedding: vi.fn(),
  setTextEmbedding: vi.fn(),
  uploadGateEnabled: true,
  fetch: vi.fn(),
}));

vi.mock('@/lib/auth/request-auth', () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock('@/lib/upload/ingest-image', () => ({
  ingestImage: mocks.ingestImage,
}));

vi.mock('@/lib/db', () => ({
  prisma: {},
  upsertAssetEmbedding: mocks.upsertAssetEmbedding,
}));

vi.mock('@/lib/cache', () => ({
  getCacheService: () => ({ setTextEmbedding: mocks.setTextEmbedding }),
}));

vi.mock('@/lib/runtime-gates', () => ({
  getRuntimeGate: () => ({
    name: 'uploads',
    enabled: mocks.uploadGateEnabled,
    code: 'uploads_disabled',
    message: 'Uploads are temporarily paused',
  }),
  runtimeGateResponse: () =>
    Response.json({ error: 'Uploads are temporarily paused' }, { status: 503 }),
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '@/app/api/library/starter/route';
import manifest from '@/lib/starter-pile/manifest.json';
import { STARTER_PILE_TAG } from '@/lib/starter-pile';

function request(): NextRequest {
  return new NextRequest('http://localhost:3000/api/library/starter', { method: 'POST' });
}

function authed() {
  mocks.authenticateRequest.mockResolvedValue({
    status: 'authenticated',
    principal: { userId: 'user-1' },
  });
}

function fetchServesImages() {
  mocks.fetch.mockImplementation(async () =>
    new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })
  );
  vi.stubGlobal('fetch', mocks.fetch);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.uploadGateEnabled = true;
});

describe('POST /api/library/starter', () => {
  it('returns the stable 401 contract when unauthenticated', async () => {
    mocks.authenticateRequest.mockResolvedValue({ status: 'unauthenticated', reason: 'x' });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.ingestImage).not.toHaveBeenCalled();
  });

  it('returns 503 when the uploads runtime gate is disabled', async () => {
    authed();
    mocks.uploadGateEnabled = false;

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.ingestImage).not.toHaveBeenCalled();
  });

  it('seeds every manifest image with its precomputed embedding and warms the query cache', async () => {
    authed();
    fetchServesImages();
    mocks.ingestImage.mockImplementation(async ({ file }: { file: File }) => ({
      kind: 'created',
      asset: { id: `asset-${file.name}`, needsEmbedding: true },
    }));
    mocks.upsertAssetEmbedding.mockResolvedValue({});

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.seeded).toBe(manifest.images.length);
    expect(body.already).toBe(0);
    expect(body.suggestedQueries).toEqual(manifest.queries.map((q) => q.text));

    // Every image went through the real ingestion pipeline, tagged for
    // one-sweep deletability, without a sync Replicate call.
    expect(mocks.ingestImage).toHaveBeenCalledTimes(manifest.images.length);
    for (const call of mocks.ingestImage.mock.calls) {
      expect(call[0].userId).toBe('user-1');
      expect(call[0].tags).toEqual([STARTER_PILE_TAG]);
      // Vectors are precomputed and written directly below — the pipeline
      // must not schedule any Replicate embedding generation for these.
      expect(call[0].scheduleEmbeddings).toBe(false);
    }

    // Precomputed 768-dim vectors written directly — no embedding provider.
    expect(mocks.upsertAssetEmbedding).toHaveBeenCalledTimes(manifest.images.length);
    for (const call of mocks.upsertAssetEmbedding.mock.calls) {
      expect(call[0].dim).toBe(768);
      expect(call[0].embedding).toHaveLength(768);
    }

    // Suggested first queries are cache-warmed so the first search is
    // deterministic too.
    expect(mocks.setTextEmbedding).toHaveBeenCalledTimes(manifest.queries.length);
  });

  it('is idempotent: re-seeding reports already-present assets and still repairs embeddings', async () => {
    authed();
    fetchServesImages();
    mocks.ingestImage.mockImplementation(async ({ file }: { file: File }) => ({
      kind: 'duplicate',
      asset: { id: `asset-${file.name}`, needsEmbedding: false },
    }));
    mocks.upsertAssetEmbedding.mockResolvedValue({});

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.seeded).toBe(0);
    expect(body.already).toBe(manifest.images.length);
    // Upsert still runs: it is the cheap repair path if a previous seed died
    // between ingest and embedding write.
    expect(mocks.upsertAssetEmbedding).toHaveBeenCalledTimes(manifest.images.length);
  });
});
