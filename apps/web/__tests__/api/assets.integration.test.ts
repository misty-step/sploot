import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  getAuthWithUser: vi.fn(),
  requireUserIdWithSync: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  getAuthWithUser: auth.getAuthWithUser,
  requireUserIdWithSync: auth.requireUserIdWithSync,
}));

import { GET } from "@/app/api/assets/route";
import { prisma, upsertAssetEmbedding } from "@/lib/db";

const OWNER_ID = "shuffle-owner-user";
const OTHER_ID = "shuffle-other-user";

function request(searchParams: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/assets");
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }

  return new NextRequest(url);
}

async function deleteUser(id: string) {
  await prisma.user.deleteMany({ where: { id } });
}

describe("GET /api/assets seeded shuffle integration", () => {
  beforeAll(async () => {
    if (!prisma) {
      throw new Error(
        "DATABASE_URL is required for assets shuffle integration tests",
      );
    }
  });

  beforeEach(async () => {
    auth.getAuthWithUser.mockResolvedValue({
      userId: OWNER_ID,
      syncStatus: "synced",
      syncError: null,
    });

    await deleteUser(OWNER_ID);
    await deleteUser(OTHER_ID);

    await prisma.user.createMany({
      data: [
        { id: OWNER_ID, email: "shuffle-owner@sploot.test" },
        { id: OTHER_ID, email: "shuffle-other@sploot.test" },
      ],
    });

    await prisma.asset.createMany({
      data: [
        asset("shuffle-a", OWNER_ID, "a.png", 1, BigInt("1")),
        asset("shuffle-b", OWNER_ID, "b.png", 2, BigInt("9000000000000")),
        asset("shuffle-c", OWNER_ID, "c.png", 3, BigInt("10000000000000")),
        asset("shuffle-d", OWNER_ID, "d.png", 4, BigInt("20000000000000")),
        asset(
          "shuffle-other",
          OTHER_ID,
          "other.png",
          5,
          BigInt("15000000000000"),
        ),
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await deleteUser(OWNER_ID);
    await deleteUser(OTHER_ID);
  });

  it("returns a deterministic private shuffle for the same seed and limit", async () => {
    const params = {
      sortBy: "shuffle",
      shuffleSeed: "424242",
      limit: "3",
      offset: "0",
    };

    const first = await GET(request(params), { params: Promise.resolve({}) });
    const second = await GET(request(params), { params: Promise.resolve({}) });

    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.assets).toHaveLength(3);
    expect(firstBody.assets.map((asset: any) => asset.id)).toEqual(
      secondBody.assets.map((asset: any) => asset.id),
    );
    expect(firstBody.assets.map((asset: any) => asset.id)).not.toContain(
      "shuffle-other",
    );
    expect(firstBody.pagination).toEqual({
      total: 4,
      limit: 3,
      offset: 0,
      hasMore: true,
    });
  });

  // 048: the grid must source the stored thumbnail, not the full original. This
  // exercises the real shuffle SQL against pgvector so a missing/mistyped
  // `thumbnail_url` alias is caught (unit mocks + tsc cannot see raw-SQL columns).
  it("returns the stored thumbnailUrl on each shuffle tile", async () => {
    const res = await GET(
      request({ sortBy: "shuffle", shuffleSeed: "7", limit: "4", offset: "0" }),
      { params: Promise.resolve({}) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.assets.length).toBeGreaterThan(0);
    for (const tile of body.assets) {
      expect(tile.thumbnailUrl).toBe(
        `https://sploot-test.public.blob.vercel-storage.com/thumb-${tile.pathname}`,
      );
    }
  });

  it("uses seeded ring order over stable shuffle keys", async () => {
    const fullPage = await GET(
      request({
        sortBy: "shuffle",
        shuffleSeed: "1",
        limit: "4",
        offset: "0",
      }),
      { params: Promise.resolve({}) },
    );

    const wrappedPage = await GET(
      request({
        sortBy: "shuffle",
        shuffleSeed: "1",
        limit: "2",
        offset: "2",
      }),
      { params: Promise.resolve({}) },
    );

    const fullBody = await fullPage.json();
    const wrappedBody = await wrappedPage.json();

    expect(fullPage.status).toBe(200);
    expect(wrappedPage.status).toBe(200);
    expect(fullBody.assets.map((asset: any) => asset.id)).toEqual([
      "shuffle-c",
      "shuffle-d",
      "shuffle-a",
      "shuffle-b",
    ]);
    expect(wrappedBody.assets.map((asset: any) => asset.id)).toEqual([
      "shuffle-a",
      "shuffle-b",
    ]);
  });

  it("ranks embedded assets by similarity to embedded bangers in taste mode", async () => {
    await prisma.asset.updateMany({
      where: { id: { in: ["shuffle-b", "shuffle-c"] } },
      data: { favorite: true },
    });

    await Promise.all([
      upsertAssetEmbedding({
        assetId: "shuffle-a",
        modelName: "clip-test",
        modelVersion: "v1",
        dim: 512,
        embedding: vector512(0.95, 0.05),
      }),
      upsertAssetEmbedding({
        assetId: "shuffle-b",
        modelName: "clip-test",
        modelVersion: "v1",
        dim: 512,
        embedding: vector512(1, 0),
      }),
      upsertAssetEmbedding({
        assetId: "shuffle-c",
        modelName: "clip-test",
        modelVersion: "v1",
        dim: 512,
        embedding: vector512(0.9, 0.1),
      }),
      upsertAssetEmbedding({
        assetId: "shuffle-d",
        modelName: "clip-test",
        modelVersion: "v1",
        dim: 512,
        embedding: vector512(0, 1),
      }),
    ]);

    const response = await GET(
      request({
        sortBy: "taste",
        limit: "4",
        offset: "0",
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.taste).toEqual({
      status: "ready",
      embeddedBangerCount: 2,
      minimumBangerEmbeddings: 2,
    });
    expect(body.pagination).toMatchObject({
      total: 4,
      limit: 4,
      offset: 0,
      hasMore: false,
    });
    expect(body.assets.map((asset: any) => asset.id).slice(0, 3)).toEqual([
      "shuffle-a",
      "shuffle-b",
      "shuffle-c",
    ]);
    expect(body.assets.at(-1).id).toBe("shuffle-d");
    expect(body.assets[0].tasteScore).toBeGreaterThan(body.assets.at(-1).tasteScore);
  });
});

function asset(
  id: string,
  ownerUserId: string,
  filename: string,
  size: number,
  shuffleKey: bigint,
) {
  return {
    id,
    ownerUserId,
    blobUrl: `https://sploot-test.public.blob.vercel-storage.com/${filename}`,
    thumbnailUrl: `https://sploot-test.public.blob.vercel-storage.com/thumb-${filename}`,
    pathname: filename,
    mime: "image/png",
    size,
    checksumSha256: `${ownerUserId}-${filename}`,
    shuffleKey,
  };
}

function vector512(x: number, y: number) {
  const vector = Array.from({ length: 512 }, () => 0);
  vector[0] = x;
  vector[1] = y;
  return vector;
}
