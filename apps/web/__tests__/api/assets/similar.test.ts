import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const prisma = {
    asset: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    assetTag: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };

  return {
    prisma,
    getAuth: vi.fn(),
    vectorSearch: vi.fn(),
  };
});

vi.mock("@/lib/auth/server", () => ({
  getAuth: mocks.getAuth,
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma,
  vectorSearch: mocks.vectorSearch,
}));

import { GET } from "@/app/api/assets/[id]/similar/route";

function request(id: string, searchParams: Record<string, string> = {}) {
  const url = new URL(`http://localhost:3000/api/assets/${id}/similar`);
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return {
    req: new NextRequest(url),
    context: { params: Promise.resolve({ id }) },
  };
}

function neighbor(id: string, distance: number) {
  return {
    id,
    blob_url: `https://blob/${id}.png`,
    thumbnail_url: null,
    pathname: `pile/${id}.png`,
    mime: "image/png",
    width: 100,
    height: 100,
    favorite: false,
    size: 1234,
    created_at: new Date("2026-07-01T00:00:00Z"),
    distance,
  };
}

async function boundaryBody(response: Response): Promise<Record<string, unknown>> {
  return JSON.parse(JSON.stringify(await response.json())) as Record<string, unknown>;
}

describe("GET /api/assets/[id]/similar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuth.mockResolvedValue({ userId: "user-123" });
    mocks.prisma.asset.findMany.mockResolvedValue([]);
    mocks.prisma.assetTag.findMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getAuth.mockResolvedValue({ userId: null });
    const { req, context } = request("asset-1");
    const res = await GET(req, context);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the source asset is not found", async () => {
    mocks.prisma.asset.findFirst.mockResolvedValue(null);
    const { req, context } = request("missing");
    const res = await GET(req, context);
    expect(res.status).toBe(404);
  });

  it("flags source-unembedded when the source has no ready embedding", async () => {
    mocks.prisma.asset.findFirst.mockResolvedValue({ phash: null });
    mocks.prisma.$queryRaw.mockResolvedValue([]);

    const { req, context } = request("asset-1");
    const res = await GET(req, context);
    const body = await boundaryBody(res);

    expect(res.status).toBe(200);
    expect(body).toEqual({ results: [], reason: "source-unembedded" });
    expect(mocks.vectorSearch).not.toHaveBeenCalled();
  });

  it("flags no-neighbors when embedded but nothing else matches", async () => {
    mocks.prisma.asset.findFirst.mockResolvedValue({ phash: null });
    mocks.prisma.$queryRaw.mockResolvedValue([{ image_embedding: "[0.1,0.2,0.3]" }]);
    // vectorSearch returns only the source asset, which is filtered out.
    mocks.vectorSearch.mockResolvedValue([neighbor("asset-1", 1)]);

    const { req, context } = request("asset-1");
    const res = await GET(req, context);
    const body = await boundaryBody(res);

    expect(res.status).toBe(200);
    expect(body).toEqual({ results: [], reason: "no-neighbors" });
  });

  it("always returns the top-N neighbors with no minimum-similarity floor", async () => {
    mocks.prisma.asset.findFirst.mockResolvedValue({ phash: null });
    mocks.prisma.$queryRaw.mockResolvedValue([{ image_embedding: "[0.1,0.2,0.3]" }]);
    mocks.vectorSearch.mockResolvedValue([
      neighbor("asset-1", 1), // the source, filtered out
      neighbor("near", 0.92),
      neighbor("distant", 0.01), // near-zero similarity must still appear
    ]);

    const { req, context } = request("asset-1", { limit: "12" });
    const res = await GET(req, context);
    const body = await boundaryBody(res);

    expect(res.status).toBe(200);
    expect(body).toEqual({
      results: [
        {
          id: "near",
          blobUrl: "https://blob/near.png",
          thumbnailUrl: null,
          pathname: "pile/near.png",
          filename: "near.png",
          mime: "image/png",
          size: 1234,
          width: 100,
          height: 100,
          favorite: false,
          createdAt: "2026-07-01T00:00:00.000Z",
          embeddingStatus: "ready",
          similarity: 0.92,
          relevance: 92,
          tags: [],
        },
        {
          id: "distant",
          blobUrl: "https://blob/distant.png",
          thumbnailUrl: null,
          pathname: "pile/distant.png",
          filename: "distant.png",
          mime: "image/png",
          size: 1234,
          width: 100,
          height: 100,
          favorite: false,
          createdAt: "2026-07-01T00:00:00.000Z",
          embeddingStatus: "ready",
          similarity: 0.01,
          relevance: 1,
          tags: [],
        },
      ],
      reason: null,
    });

    // vectorSearch must be called without a positive threshold.
    const [, , options] = mocks.vectorSearch.mock.calls[0];
    expect(options?.threshold ?? 0).toBe(0);
  });
});
