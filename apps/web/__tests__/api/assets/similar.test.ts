import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const prisma = {
    asset: {
      findFirst: vi.fn(),
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

describe("GET /api/assets/[id]/similar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuth.mockResolvedValue({ userId: "user-123" });
    mocks.prisma.asset.findMany.mockResolvedValue([]);
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
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(body.reason).toBe("source-unembedded");
    expect(mocks.vectorSearch).not.toHaveBeenCalled();
  });

  it("flags no-neighbors when embedded but nothing else matches", async () => {
    mocks.prisma.asset.findFirst.mockResolvedValue({ phash: null });
    mocks.prisma.$queryRaw.mockResolvedValue([{ image_embedding: "[0.1,0.2,0.3]" }]);
    // vectorSearch returns only the source asset, which is filtered out.
    mocks.vectorSearch.mockResolvedValue([neighbor("asset-1", 1)]);

    const { req, context } = request("asset-1");
    const res = await GET(req, context);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(body.reason).toBe("no-neighbors");
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
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reason).toBeNull();
    const ids = body.results.map((r: { id: string }) => r.id);
    expect(ids).toEqual(["near", "distant"]);

    const distant = body.results.find((r: { id: string }) => r.id === "distant");
    expect(distant.similarity).toBeCloseTo(0.01);
    expect(distant.relevance).toBe(1);

    // vectorSearch must be called without a positive threshold.
    const [, , options] = mocks.vectorSearch.mock.calls[0];
    expect(options?.threshold ?? 0).toBe(0);
  });
});
