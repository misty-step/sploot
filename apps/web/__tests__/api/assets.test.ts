import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const prisma = {
    asset: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    assetTag: {
      findMany: vi.fn(),
    },
    assetEmbedding: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };

  return {
    prisma,
    getAuthWithUser: vi.fn(),
    requireUserIdWithSync: vi.fn(),
    getDbFingerprint: vi.fn(),
  };
});

vi.mock("@/lib/auth/server", () => ({
  getAuthWithUser: mocks.getAuthWithUser,
  requireUserIdWithSync: mocks.requireUserIdWithSync,
}));

vi.mock("@/lib/db-fingerprint", () => ({
  getDbFingerprint: mocks.getDbFingerprint,
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma,
  upsertAssetEmbedding: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  getCacheService: () => ({
    clear: vi.fn(),
  }),
}));

vi.mock("@/lib/embeddings", () => ({
  createEmbeddingService: vi.fn(),
  EmbeddingError: class EmbeddingError extends Error {},
}));

vi.mock("@/lib/runtime-gates", () => ({
  getRuntimeGate: vi.fn((name: string) => ({
    enabled: name === "uploads",
    message: `${name} disabled in contract test`,
  })),
  runtimeGateResponse: vi.fn(() =>
    new Response(JSON.stringify({ error: "runtime gate disabled" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    }),
  ),
}));

vi.mock("@/lib/quota/storage-quota-policy", () => ({
  reserveUploadBytes: vi.fn().mockResolvedValue({ id: "reservation-1" }),
  releaseStorageQuotaReservation: vi.fn().mockResolvedValue(undefined),
  storageQuotaError: vi.fn(),
  StorageQuotaExceededError: class StorageQuotaExceededError extends Error {},
}));

import { GET, POST } from "@/app/api/assets/route";

function request(searchParams: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/assets");
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }

  return new NextRequest(url);
}

function uploadRequest() {
  return new NextRequest("http://localhost:3000/api/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      blobUrl: "https://blob.test/upload.png",
      pathname: "memes/upload.png",
      filename: "upload.png",
      mimeType: "image/png",
      size: 4096,
      checksum: "checksum-upload",
      width: 800,
      height: 600,
    }),
  });
}

async function boundaryBody(response: Response): Promise<Record<string, unknown>> {
  return JSON.parse(JSON.stringify(await response.json())) as Record<string, unknown>;
}

describe("GET /api/assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getAuthWithUser.mockResolvedValue({
      userId: "user-123",
      syncStatus: "synced",
      syncError: null,
    });
    mocks.getDbFingerprint.mockReturnValue({ host: "test-db", hash: "abc123" });
    mocks.prisma.asset.count.mockResolvedValue(2);
    mocks.prisma.asset.findMany.mockResolvedValue([]);
    mocks.prisma.assetTag.findMany.mockResolvedValue([]);
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(2) }])
      .mockResolvedValueOnce([
        {
          id: "asset-b",
          blobUrl: "https://blob.test/b.png",
          thumbnailUrl: "https://blob.test/thumb-b.png",
          pathname: "memes/b.png",
          mime: "image/png",
          width: 640,
          height: 480,
          favorite: false,
          size: 2048,
          createdAt: new Date("2026-05-15T12:00:00.000Z"),
          updatedAt: new Date("2026-05-15T12:00:00.000Z"),
          embeddingId: null,
          embeddingModelName: null,
          embeddingModelVersion: null,
          embeddingStatus: null,
          embeddingCreatedAt: null,
        },
        {
          id: "asset-a",
          blobUrl: "https://blob.test/a.png",
          pathname: "memes/a.png",
          mime: "image/png",
          width: 320,
          height: 240,
          favorite: true,
          size: 1024,
          createdAt: new Date("2026-05-14T12:00:00.000Z"),
          updatedAt: new Date("2026-05-14T12:00:00.000Z"),
          embeddingId: null,
          embeddingModelName: null,
          embeddingModelVersion: null,
          embeddingStatus: null,
          embeddingCreatedAt: null,
        },
      ]);
  });

  it("returns a seeded shuffle page for the authenticated user", async () => {
    const response = await GET(
      request({
        sortBy: "shuffle",
        shuffleSeed: "500000",
        limit: "2",
        offset: "0",
      }),
      { params: Promise.resolve({}) },
    );
    const body = await boundaryBody(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      assets: [
        {
          id: "asset-b",
          blobUrl: "https://blob.test/b.png",
          thumbnailUrl: "https://blob.test/thumb-b.png",
          pathname: "memes/b.png",
          filename: "memes/b.png",
          mime: "image/png",
          size: 2048,
          width: 640,
          height: 480,
          favorite: false,
          createdAt: "2026-05-15T12:00:00.000Z",
          tags: [],
        },
        {
          id: "asset-a",
          blobUrl: "https://blob.test/a.png",
          pathname: "memes/a.png",
          filename: "memes/a.png",
          mime: "image/png",
          size: 1024,
          width: 320,
          height: 240,
          favorite: true,
          createdAt: "2026-05-14T12:00:00.000Z",
          thumbnailUrl: null,
          tags: [],
        },
      ],
      pagination: {
        total: 2,
        limit: 2,
        offset: 0,
        hasMore: false,
      },
    });
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);

    const [countQueryParts, ...countBindings] =
      mocks.prisma.$queryRaw.mock.calls[0];
    const [segmentQueryParts, ...segmentBindings] =
      mocks.prisma.$queryRaw.mock.calls[1];
    const countSql = countQueryParts.join("");
    const segmentSql = segmentQueryParts.join("");
    const bindingValues = [...countBindings, ...segmentBindings].map((value) =>
      typeof value === "bigint" ? value.toString() : String(value),
    );

    expect(countSql).toContain("COUNT(*)::bigint");
    expect(countSql).toContain("a.shuffle_key >=");
    expect(segmentSql).toContain("ORDER BY a.shuffle_key ASC, a.id ASC");
    expect(segmentSql).not.toContain("ORDER BY RANDOM()");
    expect(segmentSql).not.toContain("CASE WHEN");
    expect(bindingValues).toContain("4611686018427387903");
    expect(mocks.prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it("returns the normal list with the browser asset fields", async () => {
    mocks.prisma.asset.findMany.mockResolvedValueOnce([
      {
        id: "asset-normal",
        blobUrl: "https://blob.test/normal.png",
        thumbnailUrl: null,
        pathname: "memes/normal.png",
        mime: "image/png",
        size: 512,
        width: 128,
        height: 96,
        favorite: false,
        createdAt: new Date("2026-05-18T12:00:00.000Z"),
        updatedAt: new Date("2026-05-18T12:00:00.000Z"),
        embedding: {
          assetId: "asset-normal",
          modelName: "private-provider",
          modelVersion: "private-version",
          dim: 768,
          status: "ready",
          error: "provider poison",
          createdAt: new Date("2026-05-18T12:01:00.000Z"),
          updatedAt: new Date("2026-05-18T12:02:00.000Z"),
        },
        tags: [],
      },
    ]);

    const response = await GET(request({ sortBy: "createdAt" }), {
      params: Promise.resolve({}),
    });
    const body = await boundaryBody(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      assets: [{
        id: "asset-normal",
        blobUrl: "https://blob.test/normal.png",
        thumbnailUrl: null,
        pathname: "memes/normal.png",
        filename: "memes/normal.png",
        mime: "image/png",
        size: 512,
        width: 128,
        height: 96,
        favorite: false,
        createdAt: "2026-05-18T12:00:00.000Z",
        tags: [],
      }],
      pagination: { total: 2, limit: 50, offset: 0, hasMore: false },
    });
    expect(body.assets[0]).not.toHaveProperty("embedding");
    expect(body.assets[0]).not.toHaveProperty("embeddingError");
    expect(body.assets[0]).not.toHaveProperty("modelName");
    expect(body.assets[0]).not.toHaveProperty("updatedAt");
  });

  it("requires shuffleSeed when sortBy is shuffle", async () => {
    const response = await GET(request({ sortBy: "shuffle" }), {
      params: Promise.resolve({}),
    });
    const body = await boundaryBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe("shuffleSeed is required when sortBy=shuffle.");
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("orders non-shuffle assets by shared sort fields", async () => {
    const response = await GET(
      request({
        sortBy: "size",
        sortOrder: "asc",
        limit: "10",
        offset: "0",
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { size: "asc" },
        // 048: the regular-list path must SELECT the thumbnail so the grid can
        // serve it directly instead of optimizing the full original.
        select: expect.objectContaining({ thumbnailUrl: true }),
      }),
    );
  });

  it("supports pathname sorting for name UI order", async () => {
    const response = await GET(
      request({
        sortBy: "pathname",
        sortOrder: "desc",
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { pathname: "desc" },
      }),
    );
  });

  it("rejects unsupported sortBy values instead of coercing to createdAt", async () => {
    const response = await GET(request({ sortBy: "favorite" }), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "Invalid sortBy parameter. Must be one of: createdAt, updatedAt, size, pathname, shuffle, taste.",
    );
    expect(mocks.prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it("returns typed taste metadata when the user has insufficient embedded bangers", async () => {
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(1) }]);

    const response = await GET(
      request({
        sortBy: "taste",
        limit: "10",
        offset: "0",
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assets).toEqual([]);
    expect(body.pagination).toEqual({
      total: 0,
      limit: 10,
      offset: 0,
      hasMore: false,
    });
    expect(body.taste).toEqual({
      status: "insufficient_bangers",
      embeddedBangerCount: 1,
      minimumBangerEmbeddings: 2,
    });
    expect(mocks.prisma.asset.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.asset.count).not.toHaveBeenCalled();
  });

  it("returns taste-ranked assets with taste scores when enough bangers are embedded", async () => {
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(2) }])
      .mockResolvedValueOnce([
        {
          id: "asset-near",
          blobUrl: "https://blob.test/near.png",
          pathname: "memes/near.png",
          mime: "image/png",
          width: 640,
          height: 480,
          favorite: false,
          size: 2048,
          createdAt: new Date("2026-05-15T12:00:00.000Z"),
          updatedAt: new Date("2026-05-15T12:00:00.000Z"),
          tasteScore: 0.8764,
          embeddingId: "asset-near",
          embeddingModelName: "clip",
          embeddingModelVersion: "v1",
          embeddingStatus: "ready",
          embeddingCreatedAt: new Date("2026-05-15T12:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([{ count: BigInt(1) }]);

    const response = await GET(
      request({
        sortBy: "taste",
        limit: "10",
        offset: "0",
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assets).toEqual([
      expect.objectContaining({
        id: "asset-near",
        tasteScore: 0.876,
        embeddingStatus: "ready",
      }),
    ]);
    expect(body.pagination.total).toBe(1);
    expect(body.taste).toEqual({
      status: "ready",
      embeddedBangerCount: 2,
      minimumBangerEmbeddings: 2,
    });
    expect(mocks.prisma.asset.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.asset.count).not.toHaveBeenCalled();
  });

  it("rejects shuffleSeed outside the supported range", async () => {
    const response = await GET(
      request({
        sortBy: "shuffle",
        shuffleSeed: "1000001",
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "Invalid shuffleSeed parameter. Must be integer 0-1000000.",
    );
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("rejects shuffleSeed outside shuffle sort mode", async () => {
    const response = await GET(request({ shuffleSeed: "500000" }), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "shuffleSeed is only supported when sortBy=shuffle.",
    );
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(mocks.prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it("rejects limit values outside the documented bounds", async () => {
    const response = await GET(request({ limit: "101" }), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid limit parameter. Must be integer 1-100.");
    expect(mocks.prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it("rejects malformed integer query parameters", async () => {
    const response = await GET(request({ limit: "10lol" }), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid limit parameter. Must be integer 1-100.");
    expect(mocks.prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it("returns the duplicate upload through the upload response contract", async () => {
    mocks.requireUserIdWithSync.mockResolvedValue("user-123");
    mocks.prisma.asset.findFirst.mockResolvedValue({
      id: "existing-asset",
      blobUrl: "https://blob.test/existing.png",
      pathname: "memes/existing.png",
      mime: "image/png",
      size: 1024,
      width: 320,
      height: 240,
      favorite: true,
      createdAt: new Date("2026-05-10T12:00:00.000Z"),
      embedding: {
        status: "unavailable",
        dim: 768,
        modelName: "provider-secret",
        modelVersion: "billing-version",
        error: "raw-provider-error",
        retryCount: 9,
      },
      tags: [],
    });

    const response = await POST(uploadRequest(), { params: Promise.resolve({}) });
    const body = await boundaryBody(response);

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['asset', 'duplicate', 'message']);
    expect(body).toEqual({
      asset: {
        id: "existing-asset",
        blobUrl: "https://blob.test/existing.png",
        pathname: "memes/existing.png",
        filename: "existing.png",
        mime: "image/png",
        size: 1024,
        width: 320,
        height: 240,
      favorite: true,
      createdAt: "2026-05-10T12:00:00.000Z",
      thumbnailUrl: null,
    },
      message: "Asset already exists",
      duplicate: true,
    });
  });

  it("returns the created upload through the upload response contract", async () => {
    mocks.requireUserIdWithSync.mockResolvedValue("user-123");
    mocks.prisma.asset.findFirst.mockResolvedValue(null);
    mocks.prisma.asset.create.mockResolvedValue({
      id: "created-asset",
      blobUrl: "https://blob.test/upload.png",
      pathname: "memes/upload.png",
      mime: "image/png",
      size: 4096,
      width: 800,
      height: 600,
      favorite: false,
      createdAt: new Date("2026-05-16T12:00:00.000Z"),
      embedding: {
        status: "unavailable",
        dim: 768,
        modelName: "provider-secret",
        modelVersion: "billing-version",
        error: "raw-provider-error",
        retryCount: 9,
      },
      tags: [{ tag: { id: "tag-1", name: "reaction" } }],
    });

    const response = await POST(uploadRequest(), { params: Promise.resolve({}) });
    const body = await boundaryBody(response);

    expect(response.status).toBe(201);
    expect(Object.keys(body).sort()).toEqual(['asset', 'message']);
    expect(body).toEqual({
      asset: {
        id: "created-asset",
        blobUrl: "https://blob.test/upload.png",
        pathname: "memes/upload.png",
        filename: "memes/upload.png",
        mime: "image/png",
        size: 4096,
        width: 800,
        height: 600,
        favorite: false,
        createdAt: "2026-05-16T12:00:00.000Z",
        embeddingStatus: "unavailable",
        tags: [{ id: "tag-1", name: "reaction" }],
        thumbnailUrl: null,
      },
      message: "Asset created successfully",
    });
    expect(body.asset).not.toHaveProperty("embeddingError");
    expect(body.asset).not.toHaveProperty("embedding");
  });
});
