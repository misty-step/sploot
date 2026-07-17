import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { TAG } from '@sploot/common';

/**
 * Route-level tests for the complete-library export surface.
 *
 * External seams (Clerk request auth, Prisma, blob object fetch) are mocked;
 * everything between the route handler and those seams — service, policy,
 * zip streaming, manifest generation — runs for real.
 */

interface FakeExportRow {
  id: string;
  ownerUserId: string;
  status: string;
  snapshotAt: Date;
  expiresAt: Date;
  manifestVersion: string;
  totalAssets: number;
  totalOriginalBytes: bigint;
  partBoundaries: Array<{ index: number; afterId: string | null; count: number; bytes: number }>;
  servedParts: number[];
  failures: Record<string, Array<{ assetId: string; archivePath: string; reason: string }>>;
  egressBytes: bigint;
  manifestMetadataBytes: bigint;
  createdAt: Date;
  updatedAt: Date;
  manifestFinalizedAt: Date | null;
  manifestFinalizedSummary: Record<string, unknown> | null;
  manifestFinalizedArtifact: string | null;
}

interface FakeAsset {
  id: string;
  ownerUserId: string;
  blobUrl: string;
  mime: string;
  size: number;
  checksumSha256: string;
  width: number | null;
  height: number | null;
  favorite: boolean;
  phash: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const state = vi.hoisted(() => ({
  users: new Set<string>(),
  exports: new Map<string, FakeExportRow>(),
  assets: [] as FakeAsset[],
  assetTags: [] as Array<{ assetId: string; tagName: string }>,
  tags: [] as Array<{ ownerUserId: string; name: string; color: string | null }>,
  nextExportId: 1,
  executeRawCalls: [] as unknown[][],
}));

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
}));

vi.mock('@/lib/auth/request-auth', () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function matchesSnapshot(asset: FakeAsset, where: any): boolean {
  if (asset.ownerUserId !== where.ownerUserId) return false;
  if (where.createdAt?.lte && asset.createdAt > where.createdAt.lte) return false;
  if (where.OR) {
    const ok = where.OR.some((clause: any) => {
      if ('deletedAt' in clause) {
        if (clause.deletedAt === null) return asset.deletedAt === null;
        if (clause.deletedAt?.gt) {
          return asset.deletedAt !== null && asset.deletedAt > clause.deletedAt.gt;
        }
      }
      return false;
    });
    if (!ok) return false;
  }
  if (where.id?.gt && !(asset.id > where.id.gt)) return false;
  return true;
}

const fakePrisma = vi.hoisted(() => {
  const prismaLike: any = {
    user: {
      findUnique: async ({ where }: any) =>
        state.users.has(where.id) ? { id: where.id } : null,
    },
    libraryExport: {
      findMany: async ({ where, skip = 0, take, select }: any) => {
        const rows = [...state.exports.values()].filter((row) => {
          if (where.ownerUserId && row.ownerUserId !== where.ownerUserId) return false;
          if (where.status?.not && row.status === where.status.not) return false;
          return true;
        }).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(skip, take ? skip + take : undefined);
        return rows.map((row) => select ? { id: row.id } : { ...row });
      },
      findFirst: async ({ where }: any) => {
        for (const row of state.exports.values()) {
          if (where.id && row.id !== where.id) continue;
          if (where.ownerUserId && row.ownerUserId !== where.ownerUserId) continue;
          if (where.status && row.status !== where.status) continue;
          return { ...row };
        }
        return null;
      },
      create: async ({ data }: any) => {
        for (const row of state.exports.values()) {
          if (row.ownerUserId === data.ownerUserId && row.status === 'active') {
            const err: any = new Error('unique violation');
            err.code = 'P2002';
            throw err;
          }
        }
        const row: FakeExportRow = {
          id: `exp-${state.nextExportId++}`,
          servedParts: [],
          failures: {},
          egressBytes: BigInt(0),
          manifestMetadataBytes: BigInt(0),
          createdAt: new Date(),
          updatedAt: new Date(),
          manifestFinalizedAt: null,
          manifestFinalizedSummary: null,
          manifestFinalizedArtifact: null,
          ...data,
        };
        state.exports.set(row.id, row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const row = state.exports.get(where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        // Mirrors documented Prisma/Postgres semantics: filters (including
        // comparison operators) and atomic increment/decrement apply per row.
        // The body is synchronous, so like a row-locked UPDATE it can never
        // interleave with another updateMany mid-application.
        let count = 0;
        for (const row of state.exports.values()) {
          if (where.id && row.id !== where.id) continue;
          if (where.ownerUserId && row.ownerUserId !== where.ownerUserId) continue;
          if (where.status && typeof where.status === 'string' && row.status !== where.status) continue;
          if (where.status?.in && !where.status.in.includes(row.status)) continue;
          if (where.status?.notIn && where.status.notIn.includes(row.status)) continue;
          if (where.manifestFinalizedAt === null && row.manifestFinalizedAt !== null) continue;
          if (where.expiresAt?.gt !== undefined && !(row.expiresAt > where.expiresAt.gt)) continue;
          if (where.egressBytes?.lte !== undefined && !(row.egressBytes <= where.egressBytes.lte))
            continue;
          if (where.egressBytes?.gte !== undefined && !(row.egressBytes >= where.egressBytes.gte))
            continue;
          const applied: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(data)) {
            if (value && typeof value === 'object' && 'increment' in (value as object)) {
              applied[key] = (row as any)[key] + (value as any).increment;
            } else if (value && typeof value === 'object' && 'decrement' in (value as object)) {
              applied[key] = (row as any)[key] - (value as any).decrement;
            } else {
              applied[key] = value;
            }
          }
          Object.assign(row, applied, { updatedAt: new Date() });
          count += 1;
        }
        return { count };
      },
      aggregate: async ({ where }: any) => {
        let sum: bigint | null = null;
        for (const row of state.exports.values()) {
          if (where.ownerUserId && row.ownerUserId !== where.ownerUserId) continue;
          if (where.id?.not && row.id === where.id.not) continue;
          if (where.updatedAt?.gte !== undefined && !(row.updatedAt >= where.updatedAt.gte))
            continue;
          sum = (sum ?? BigInt(0)) + row.egressBytes;
        }
        return { _sum: { egressBytes: sum } };
      },
      deleteMany: async ({ where }: any) => {
        let count = 0;
        for (const [id, row] of state.exports) {
          if (where.ownerUserId && row.ownerUserId !== where.ownerUserId) continue;
          if (where.id?.in && !where.id.in.includes(id)) continue;
          if (where.expiresAt?.lt && !(row.expiresAt < where.expiresAt.lt)) continue;
          state.exports.delete(id);
          count += 1;
        }
        return { count };
      },
    },
    asset: {
      count: async ({ where }: any) => state.assets.filter((asset) => matchesSnapshot(asset, where)).length,
      findMany: async ({ where, orderBy, take, select }: any) => {
        void orderBy;
        const rows = state.assets
          .filter((asset) => matchesSnapshot(asset, where))
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .slice(0, take ?? undefined);
        return rows.map((asset) => {
          if (!select) return { ...asset };
          const out: any = {};
          for (const key of Object.keys(select)) out[key] = (asset as any)[key];
          return out;
        });
      },
    },
    assetTag: {
      findMany: async ({ where }: any) =>
        state.assetTags
          .filter((at) => where.assetId.in.includes(at.assetId))
          .map((at) => ({ assetId: at.assetId, tag: { name: at.tagName } })),
    },
    tag: {
      findMany: async ({ where }: any) =>
        state.tags
          .filter((tag) => tag.ownerUserId === where.ownerUserId)
          .map((tag) => ({ name: tag.name, color: tag.color })),
    },
    $transaction: async (fn: any) => fn(prismaLike),
    $executeRaw: async (...args: unknown[]) => {
      state.executeRawCalls.push(args);
      return 1;
    },
  };
  return prismaLike;
});

vi.mock('@/lib/db', () => ({
  prisma: fakePrisma,
}));

import { GET as listGet, POST as createPost } from '@/app/api/library/export/route';
import { DELETE as exportDelete, GET as statusGet } from '@/app/api/library/export/[exportId]/route';
import { GET as partGet } from '@/app/api/library/export/[exportId]/parts/[partIndex]/route';
import { GET as manifestGet } from '@/app/api/library/export/[exportId]/manifest/route';
import { estimateManifestEgressBytesForExport, streamExportManifest } from '@/lib/export/export-manifest';
import {
  EXPORT_TTL_MS,
  estimatePartEgressBytes,
  exportEgressAllowance,
  exportEgressWindowAllowance,
  type ExportPartBoundary,
} from '@/lib/export/export-policy';

const USER = 'user-owner';
const OTHER = 'user-other';
const BLOB_HOST = 'https://abc.public.blob.vercel-storage.com';

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function authAs(userId: string) {
  mocks.authenticateRequest.mockResolvedValue({
    status: 'authenticated',
    principal: { userId, provider: 'clerk', providerSubject: userId, source: 'clerk-request', credentialKind: 'cookie-or-bearer' },
    syncStatus: 'skipped',
  });
}

function unauthenticated() {
  mocks.authenticateRequest.mockResolvedValue({ status: 'unauthenticated', reason: 'clerk-unauthorized' });
}

const assetBytes: Record<string, Uint8Array> = {};

function seedAsset(id: string, ownerUserId: string, bytes: Uint8Array, overrides: Partial<FakeAsset> = {}) {
  assetBytes[`${BLOB_HOST}/${ownerUserId}/${id}.png`] = bytes;
  state.assets.push({
    id,
    ownerUserId,
    blobUrl: `${BLOB_HOST}/${ownerUserId}/${id}.png`,
    mime: 'image/png',
    size: bytes.length,
    checksumSha256: sha256Hex(bytes),
    width: 2,
    height: 2,
    favorite: false,
    phash: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  });
}

function stubBlobFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      const bytes = assetBytes[url];
      if (!bytes) return new Response(null, { status: 404 });
      return new Response(bytes, { status: 200 });
    }),
  );
}

function request(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, init as any);
}

function ctx(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

async function createExport(): Promise<any> {
  const response = await createPost(request('/api/library/export', { method: 'POST' }), ctx({}));
  expect([200, 201]).toContain(response.status);
  return (await response.json()).export;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  state.users = new Set([USER, OTHER]);
  state.exports.clear();
  state.assets = [];
  state.assetTags = [];
  state.tags = [];
  state.nextExportId = 1;
  state.executeRawCalls = [];
  for (const key of Object.keys(assetBytes)) delete assetBytes[key];
  authAs(USER);
  stubBlobFetch();
});

describe('POST /api/library/export', () => {
  it('requires auth', async () => {
    unauthenticated();
    const response = await createPost(request('/api/library/export', { method: 'POST' }), ctx({}));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('creates a bounded, versioned export session covering the whole library', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1, 2, 3]));
    seedAsset('asset-b', USER, new Uint8Array([4, 5, 6, 7]));
    // Another tenant's asset must never leak into this export.
    seedAsset('asset-x', OTHER, new Uint8Array([9]));
    // Soft-deleted assets are excluded from the snapshot.
    seedAsset('asset-del', USER, new Uint8Array([8]), { deletedAt: new Date('2026-07-02T00:00:00Z') });

    const response = await createPost(request('/api/library/export', { method: 'POST' }), ctx({}));
    expect(response.status).toBe(201);
    const { export: view, reused } = await response.json();

    expect(reused).toBe(false);
    expect(view.manifestVersion).toBe('1.0');
    expect(view.status).toBe('active');
    expect(view.totals).toEqual({ assets: 2, originalBytes: 7 });
    expect(view.partCount).toBe(1);
    expect(view.parts).toHaveLength(1);
    expect(view.parts[0]).toMatchObject({ index: 0, count: 2, bytes: 7, served: false });
    expect(view.complete).toBe(false);
    // expiresAt is anchored to the snapshot instant, exactly one TTL later.
    expect(new Date(view.expiresAt).getTime() - new Date(view.snapshotAt).getTime()).toBe(EXPORT_TTL_MS);
    expect(view.downloads.manifest).toBe(`/api/library/export/${view.id}/manifest`);
    expect(view.downloads.parts).toEqual([`/api/library/export/${view.id}/parts/0`]);
  });

  it('remains available with zero gates beyond enrollment — no quota, billing, or upload-gate checks', async () => {
    // The fake prisma exposes no quota/billing tables at all; if the route
    // consulted them it would throw. Export must stay readable under
    // over-quota, delinquent, or canceled-subscription accounts.
    seedAsset('asset-a', USER, new Uint8Array([1]));
    const response = await createPost(request('/api/library/export', { method: 'POST' }), ctx({}));
    expect(response.status).toBe(201);
  });

  it('reuses the existing active export instead of multiplying cost', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1, 2]));
    const first = await createExport();
    const response = await createPost(request('/api/library/export', { method: 'POST' }), ctx({}));
    expect(response.status).toBe(200);
    const { export: second, reused } = await response.json();
    expect(reused).toBe(true);
    expect(second.id).toBe(first.id);
  });

  it('force replaces the active export with a fresh snapshot', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1, 2]));
    const first = await createExport();
    const response = await createPost(
      request('/api/library/export', {
        method: 'POST',
        body: JSON.stringify({ force: true }),
        headers: { 'content-type': 'application/json' },
      }),
      ctx({}),
    );
    expect(response.status).toBe(201);
    const { export: second, reused } = await response.json();
    expect(reused).toBe(false);
    expect(second.id).not.toBe(first.id);
    expect(state.exports.get(first.id)!.status).toBe('superseded');
  });

  it('caps retained sessions during a force-create burst', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1]));
    await createExport();
    for (let index = 0; index < 40; index += 1) {
      const response = await createPost(
        request('/api/library/export', {
          method: 'POST',
          body: JSON.stringify({ force: true }),
          headers: { 'content-type': 'application/json' },
        }),
        ctx({}),
      );
      expect(response.status).toBe(201);
    }
    const rows = [...state.exports.values()];
    expect(rows.filter((row) => row.status === 'active')).toHaveLength(1);
    expect(rows.length).toBeLessThanOrEqual(32);
  });

  it('creates a valid zero-part export for an empty library', async () => {
    const view = await createExport();
    expect(view.totals).toEqual({ assets: 0, originalBytes: 0 });
    expect(view.partCount).toBe(0);
    expect(view.complete).toBe(true);
  });
});

describe('GET /api/library/export and /:exportId', () => {
  it('returns the active export for resume, and null when none', async () => {
    let response = await listGet(request('/api/library/export'), ctx({}));
    expect(response.status).toBe(200);
    expect((await response.json()).export).toBeNull();

    seedAsset('asset-a', USER, new Uint8Array([1]));
    const created = await createExport();
    response = await listGet(request('/api/library/export'), ctx({}));
    expect((await response.json()).export.id).toBe(created.id);
  });

  it('never exposes another tenant export', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1]));
    const created = await createExport();

    authAs(OTHER);
    const response = await statusGet(
      request(`/api/library/export/${created.id}`),
      ctx({ exportId: created.id }),
    );
    expect(response.status).toBe(404);
  });

  it('reports progress from server-verified served parts', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1, 2, 3]));
    const created = await createExport();
    state.exports.get(created.id)!.servedParts = [0];

    const response = await statusGet(
      request(`/api/library/export/${created.id}`),
      ctx({ exportId: created.id }),
    );
    const { export: view } = await response.json();
    expect(view.parts[0].served).toBe(true);
    expect(view.complete).toBe(true);
  });

  it('derives expired status for the UI', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1]));
    const created = await createExport();
    state.exports.get(created.id)!.expiresAt = new Date(Date.now() - 1000);

    const response = await statusGet(
      request(`/api/library/export/${created.id}`),
      ctx({ exportId: created.id }),
    );
    expect((await response.json()).export.status).toBe('expired');
  });
});

describe('DELETE /api/library/export/:exportId', () => {
  it('cancels an active export', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1]));
    const created = await createExport();

    const response = await exportDelete(
      request(`/api/library/export/${created.id}`, { method: 'DELETE' }),
      ctx({ exportId: created.id }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ canceled: true });
    expect(state.exports.get(created.id)!.status).toBe('canceled');
  });

  it('is tenant-scoped', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1]));
    const created = await createExport();
    authAs(OTHER);
    const response = await exportDelete(
      request(`/api/library/export/${created.id}`, { method: 'DELETE' }),
      ctx({ exportId: created.id }),
    );
    expect(response.status).toBe(404);
    expect(state.exports.get(created.id)!.status).toBe('active');
  });
});

describe('GET /api/library/export/:exportId/parts/:partIndex', () => {
  it('streams a zip part whose entries byte-match the library originals', async () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([5, 6, 7]);
    seedAsset('asset-a', USER, a);
    seedAsset('asset-b', USER, b);
    const created = await createExport();

    const response = await partGet(
      request(`/api/library/export/${created.id}/parts/0`),
      ctx({ exportId: created.id, partIndex: '0' }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toContain('attachment');

    const zipBytes = new Uint8Array(await response.arrayBuffer());
    const unzipped = unzipSync(zipBytes);
    expect(Object.keys(unzipped).sort()).toEqual(['assets/asset-a.png', 'assets/asset-b.png']);
    expect(new Uint8Array(unzipped['assets/asset-a.png'])).toEqual(a);
    expect(new Uint8Array(unzipped['assets/asset-b.png'])).toEqual(b);

    // The server, not the client, records that the part was fully served.
    expect(state.executeRawCalls.length).toBeGreaterThan(0);
  });

  it('is tenant-scoped and bounded to real part indexes', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1]));
    const created = await createExport();

    authAs(OTHER);
    let response = await partGet(
      request(`/api/library/export/${created.id}/parts/0`),
      ctx({ exportId: created.id, partIndex: '0' }),
    );
    expect(response.status).toBe(404);

    authAs(USER);
    response = await partGet(
      request(`/api/library/export/${created.id}/parts/5`),
      ctx({ exportId: created.id, partIndex: '5' }),
    );
    expect(response.status).toBe(404);
    response = await partGet(
      request(`/api/library/export/${created.id}/parts/-1`),
      ctx({ exportId: created.id, partIndex: '-1' }),
    );
    expect(response.status).toBe(404);
  });

  it('answers 410 once expired or canceled — capabilities expire safely', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1]));
    const created = await createExport();
    state.exports.get(created.id)!.expiresAt = new Date(Date.now() - 1000);

    let response = await partGet(
      request(`/api/library/export/${created.id}/parts/0`),
      ctx({ exportId: created.id, partIndex: '0' }),
    );
    expect(response.status).toBe(410);
    expect((await response.json()).code).toBe('export_expired');

    state.exports.get(created.id)!.expiresAt = new Date(Date.now() + 1000_000);
    state.exports.get(created.id)!.status = 'canceled';
    response = await partGet(
      request(`/api/library/export/${created.id}/parts/0`),
      ctx({ exportId: created.id, partIndex: '0' }),
    );
    expect(response.status).toBe(410);
    expect((await response.json()).code).toBe('export_unavailable');
  });

  it('refuses further egress once the cost bound is spent', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1]));
    const created = await createExport();
    const row = state.exports.get(created.id)!;
    row.egressBytes = exportEgressAllowance(row.totalOriginalBytes, row.totalAssets, row.manifestMetadataBytes) + BigInt(1);

    const response = await partGet(
      request(`/api/library/export/${created.id}/parts/0`),
      ctx({ exportId: created.id, partIndex: '0' }),
    );
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe('export_egress_exhausted');
  });
});

describe('egress bound — durable reservation admission', () => {
  function partReserve(created: any): bigint {
    const row = state.exports.get(created.id)!;
    return estimatePartEgressBytes(row.partBoundaries[0] as ExportPartBoundary);
  }

  async function getPart(created: any, index = 0) {
    return partGet(
      request(`/api/library/export/${created.id}/parts/${index}`),
      ctx({ exportId: created.id, partIndex: String(index) }),
    );
  }

  async function getManifest(created: any) {
    return manifestGet(
      request(`/api/library/export/${created.id}/manifest`),
      ctx({ exportId: created.id }),
    );
  }

  it('charges the reservation before streaming and settles to actual bytes on clean completion', async () => {
    seedAsset('asset-a', USER, new Uint8Array(1024).fill(3));
    const created = await createExport();
    const row = state.exports.get(created.id)!;

    const response = await getPart(created);
    expect(response.status).toBe(200);
    const zipBytes = new Uint8Array(await response.arrayBuffer());

    // Fully-delivered part: the conservative reservation was refunded down to
    // the exact bytes streamed — no double-charge, no free bytes.
    expect(row.egressBytes).toBe(BigInt(zipBytes.length));
    expect(row.egressBytes > BigInt(0)).toBe(true);
  });

  it('keeps the full reservation charged when the client aborts mid-stream', async () => {
    seedAsset('asset-a', USER, new Uint8Array(256 * 1024).fill(7));
    const created = await createExport();
    const row = state.exports.get(created.id)!;
    const reserve = partReserve(created);

    const response = await getPart(created);
    expect(response.status).toBe(200);
    await response.body!.cancel();
    await new Promise((resolve) => setTimeout(resolve, 25));

    // Aborted delivery: the reservation stays spent and the part is not served.
    expect(row.egressBytes).toBe(reserve);
    expect(row.servedParts).toEqual([]);
  });

  it('refunds a part reservation when the post-admission fence denies before bytes', async () => {
    seedAsset('asset-post-admission-part', USER, new Uint8Array([1, 2, 3]));
    const created = await createExport();
    const row = state.exports.get(created.id)!;
    const originalUpdateMany = fakePrisma.libraryExport.updateMany;
    fakePrisma.libraryExport.updateMany = async (args: any) => {
      const result = await originalUpdateMany(args);
      if (args.data?.egressBytes?.increment && row.status === 'active') row.status = 'canceled';
      return result;
    };
    try {
      const response = await getPart(created);
      expect(response.status).toBe(410);
      expect((await response.json()).code).toBe('export_unavailable');
      expect(row.egressBytes).toBe(BigInt(0));
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    } finally {
      fakePrisma.libraryExport.updateMany = originalUpdateMany;
    }
  });

  it('admits exactly to the boundary and refuses one byte beyond it', async () => {
    seedAsset('asset-a', USER, new Uint8Array(100).fill(1));
    const created = await createExport();
    const row = state.exports.get(created.id)!;
    const allowance = exportEgressAllowance(row.totalOriginalBytes, row.totalAssets, row.manifestMetadataBytes);
    const reserve = partReserve(created);

    // One byte past the exact fit: refused before any bytes stream.
    row.egressBytes = allowance - reserve + BigInt(1);
    let response = await getPart(created);
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe('export_egress_exhausted');

    // Exact fit: admitted.
    row.egressBytes = allowance - reserve;
    response = await getPart(created);
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    expect(row.egressBytes <= allowance).toBe(true);
  });

  it('concurrent part requests cannot collectively reserve beyond the allowance', async () => {
    seedAsset('asset-a', USER, new Uint8Array(100).fill(1));
    const created = await createExport();
    const row = state.exports.get(created.id)!;
    const allowance = exportEgressAllowance(row.totalOriginalBytes, row.totalAssets, row.manifestMetadataBytes);
    row.egressBytes = allowance - partReserve(created); // budget fits exactly one

    const [first, second] = await Promise.all([getPart(created), getPart(created)]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 429]);
    for (const response of [first, second]) {
      if (response.status === 200) await response.arrayBuffer();
    }
    expect(row.egressBytes <= allowance).toBe(true);
  });

  it('mixed manifest and part admissions share one budget and cannot jointly exceed it', async () => {
    seedAsset('asset-a', USER, new Uint8Array(100).fill(1));
    const created = await createExport();
    const row = state.exports.get(created.id)!;
    const allowance = exportEgressAllowance(row.totalOriginalBytes, row.totalAssets, row.manifestMetadataBytes);
    const manifestReserve = await estimateManifestEgressBytesForExport(row);
    // Headroom fits either request alone, but not both.
    row.egressBytes = allowance - partReserve(created) - manifestReserve + BigInt(1);

    const [part, manifest] = await Promise.all([getPart(created), getManifest(created)]);
    const statuses = [part.status, manifest.status].sort();
    expect(statuses).toEqual([200, 429]);
    for (const response of [part, manifest]) {
      if (response.status === 200) await response.arrayBuffer();
    }
    expect(row.egressBytes <= allowance).toBe(true);
  });

  it('manifest downloads settle to actual bytes like parts do', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1, 2, 3]));
    const created = await createExport();
    const row = state.exports.get(created.id)!;

    const response = await getManifest(created);
    expect(response.status).toBe(200);
    const body = await response.arrayBuffer();
    expect(row.egressBytes).toBe(BigInt(body.byteLength));
  });

  it('lifecycle cycling cannot mint fresh egress: the rolling tenant window refuses further downloads', async () => {
    seedAsset('asset-a', USER, new Uint8Array(100).fill(1));
    // Two prior sessions in the window, each fully spent to the per-export cap.
    const first = await createExport();
    const firstRow = state.exports.get(first.id)!;
    firstRow.egressBytes = exportEgressAllowance(firstRow.totalOriginalBytes, firstRow.totalAssets, firstRow.manifestMetadataBytes);
    firstRow.status = 'superseded';
    firstRow.updatedAt = new Date();

    const second = await createExport();
    const secondRow = state.exports.get(second.id)!;
    secondRow.egressBytes = exportEgressAllowance(secondRow.totalOriginalBytes, secondRow.totalAssets, secondRow.manifestMetadataBytes);
    secondRow.status = 'superseded';
    secondRow.updatedAt = new Date();

    // Window allowance = 2 × per-export allowance: already fully consumed.
    const third = await createExport();
    expect(
      exportEgressWindowAllowance(secondRow.totalOriginalBytes, secondRow.totalAssets, secondRow.manifestMetadataBytes),
    ).toBe(exportEgressAllowance(secondRow.totalOriginalBytes, secondRow.totalAssets, secondRow.manifestMetadataBytes) * BigInt(2));

    let response = await getPart(third);
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe('export_egress_window_exhausted');

    response = await getManifest(third);
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe('export_egress_window_exhausted');
  });

  it('the window slides: export never becomes permanently unavailable and data is never held hostage', async () => {
    seedAsset('asset-a', USER, new Uint8Array(100).fill(1));
    const first = await createExport();
    const firstRow = state.exports.get(first.id)!;
    firstRow.egressBytes = exportEgressAllowance(firstRow.totalOriginalBytes, firstRow.totalAssets, firstRow.manifestMetadataBytes) * BigInt(2);
    firstRow.status = 'superseded';
    // Spent long ago — outside the rolling window.
    firstRow.updatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);

    const fresh = await createExport();
    const response = await getPart(fresh);
    expect(response.status).toBe(200);
    await response.arrayBuffer();
  });
});

describe('GET /api/library/export/:exportId/manifest', () => {
  it('keeps incomplete manifests active until parts finish, then finalizes', async () => {
    seedAsset('asset-early', USER, new Uint8Array([1, 2]));
    const created = await createExport();
    const early = await manifestGet(request('/api/library/export/' + created.id + '/manifest'), ctx({ exportId: created.id }));
    expect(early.status).toBe(200);
    expect(JSON.parse(await early.text()).complete).toBe(false);
    expect(state.exports.get(created.id)!.status).toBe('active');
    const part = await partGet(request('/api/library/export/' + created.id + '/parts/0'), ctx({ exportId: created.id, partIndex: '0' }));
    expect(part.status).toBe(200);
    await part.arrayBuffer();
    state.exports.get(created.id)!.servedParts = [0];
    const final = await manifestGet(request('/api/library/export/' + created.id + '/manifest'), ctx({ exportId: created.id }));
    expect(final.status).toBe(200);
    expect(JSON.parse(await final.text()).complete).toBe(true);
    expect(state.exports.get(created.id)!.status).toBe('complete');
  });

  it('replays the winner when concurrent finalization races at the CAS fence', async () => {
    seedAsset('asset-finalization-race', USER, new Uint8Array([1, 2]));
    const created = await createExport();
    state.exports.get(created.id)!.servedParts = [0];

    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    let finalizationCalls = 0;
    let bothReady!: () => void;
    const bothFinalizersReady = new Promise<void>((resolve) => { bothReady = resolve; });
    const originalUpdateMany = fakePrisma.libraryExport.updateMany;
    fakePrisma.libraryExport.updateMany = async (args: any) => {
      if (args.data?.status === 'complete') {
        finalizationCalls += 1;
        if (finalizationCalls === 2) bothReady();
        await barrier;
      }
      return originalUpdateMany(args);
    };

    try {
      const firstPromise = manifestGet(
        request('/api/library/export/' + created.id + '/manifest'),
        ctx({ exportId: created.id }),
      );
      const secondPromise = manifestGet(
        request('/api/library/export/' + created.id + '/manifest'),
        ctx({ exportId: created.id }),
      );
      await bothFinalizersReady;
      release();

      const [first, second] = await Promise.all([firstPromise, secondPromise]);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const [firstBody, secondBody] = await Promise.all([first.text(), second.text()]);
      expect(JSON.parse(firstBody).complete).toBe(true);
      expect(JSON.parse(secondBody).complete).toBe(true);
      expect(firstBody).toBe(secondBody);
      expect(state.exports.get(created.id)!.status).toBe('complete');
      expect(state.exports.get(created.id)!.manifestFinalizedArtifact).toBe(firstBody);
    } finally {
      release();
      fakePrisma.libraryExport.updateMany = originalUpdateMany;
    }
  });

  it('rejects a manifest at the durable replay boundary before response bytes', async () => {
    seedAsset('asset-too-large', USER, new Uint8Array([1]));
    const created = await createExport();
    // Keep every tag individually valid while making the aggregate manifest
    // exceed the durable replay bound.
    const hugeTags = Array.from({ length: 140_000 }, (_, index) => ({
      ownerUserId: USER,
      name: `tag-${String(index).padStart(6, '0')}-${'x'.repeat(110)}`,
      color: null,
    }));
    state.tags = hugeTags;
    state.assetTags.push({ assetId: 'asset-too-large', tagName: hugeTags[0].name });
    const response = await manifestGet(request('/api/library/export/' + created.id + '/manifest'), ctx({ exportId: created.id }));
    expect(response.status).toBe(413);
    expect(await response.text()).not.toContain('sploot-library-export');
    expect(state.exports.get(created.id)!.status).toBe('active');
    expect(state.exports.get(created.id)!.egressBytes).toBe(BigInt(0));
  });

  it('keeps the export active and omits terminal summary when artifact persistence fails', async () => {
    seedAsset('asset-persist-fail', USER, new Uint8Array([1]));
    const created = await createExport();
    state.exports.get(created.id)!.servedParts = [0];
    const originalUpdateMany = fakePrisma.libraryExport.updateMany;
    fakePrisma.libraryExport.updateMany = async (args: any) => {
      if (args.data?.status === 'complete') throw new Error('artifact persistence failed');
      return originalUpdateMany(args);
    };
    try {
      const stream = streamExportManifest({ row: state.exports.get(created.id)! as any });
      await expect(new Response(stream).text()).rejects.toThrow(/artifact persistence/i);
      expect(state.exports.get(created.id)!.status).toBe('active');
      expect(state.exports.get(created.id)!.manifestFinalizedSummary).toBeNull();
    } finally {
      fakePrisma.libraryExport.updateMany = originalUpdateMany;
    }

    const retry = new Response(streamExportManifest({ row: state.exports.get(created.id)! as any }));
    const retryBody = await retry.text();
    expect(JSON.parse(retryBody).complete).toBe(true);
    expect(state.exports.get(created.id)!.status).toBe('complete');
    expect(state.exports.get(created.id)!.manifestFinalizedArtifact).toBe(retryBody);
  });

  it('rejects a final manifest bound before claiming completion', async () => {
    seedAsset('asset-bound-fail', USER, new Uint8Array([1]));
    const created = await createExport();
    state.exports.get(created.id)!.servedParts = [0];
    const first = new Response(streamExportManifest({ row: state.exports.get(created.id)! as any }));
    const fullBody = await first.text();
    const row = state.exports.get(created.id)!;
    row.status = 'active';
    row.manifestFinalizedAt = null;
    row.manifestFinalizedSummary = null;
    row.manifestFinalizedArtifact = null;
    const retry = new Response(streamExportManifest({
      row: row as any,
      maxBytes: BigInt(new TextEncoder().encode(fullBody).byteLength - 1),
    }));
    await expect(retry.arrayBuffer()).rejects.toThrow(/reservation/);
    expect(row.status).toBe('active');
    expect(row.manifestFinalizedAt).toBeNull();
    expect(row.manifestFinalizedSummary).toBeNull();
    expect(row.manifestFinalizedArtifact).toBeNull();
  });

  it('refunds a manifest reservation when the post-admission fence denies before bytes', async () => {
    seedAsset('asset-post-admission-manifest', USER, new Uint8Array([1, 2, 3]));
    const created = await createExport();
    const row = state.exports.get(created.id)!;
    const originalUpdateMany = fakePrisma.libraryExport.updateMany;
    fakePrisma.libraryExport.updateMany = async (args: any) => {
      const result = await originalUpdateMany(args);
      if (args.data?.egressBytes?.increment && row.status === 'active') row.status = 'canceled';
      return result;
    };
    try {
      const response = await manifestGet(
        request('/api/library/export/' + created.id + '/manifest'),
        ctx({ exportId: created.id }),
      );
      expect(response.status).toBe(410);
      expect((await response.json()).code).toBe('export_unavailable');
      expect(row.egressBytes).toBe(BigInt(0));
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    } finally {
      fakePrisma.libraryExport.updateMany = originalUpdateMany;
    }
  });

  it('replays a finalized manifest byte-for-byte after mutable metadata changes', async () => {
    seedAsset('asset-replay', USER, new Uint8Array([1, 2]), { favorite: true });
    state.tags.push({ ownerUserId: USER, name: 'before', color: null });
    const created = await createExport();
    state.exports.get(created.id)!.servedParts = [0];
    const first = await manifestGet(request('/api/library/export/' + created.id + '/manifest'), ctx({ exportId: created.id }));
    const bytes = new Uint8Array(await first.arrayBuffer());
    state.tags[0].name = 'after';
    state.assets[0].favorite = false;
    const second = await manifestGet(request('/api/library/export/' + created.id + '/manifest'), ctx({ exportId: created.id }));
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(bytes);
  });

  it('streams a versioned manifest with complete portable metadata', async () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    seedAsset('asset-a', USER, a, { favorite: true, phash: 'abcd' });
    state.tags.push({ ownerUserId: USER, name: 'reaction', color: '#ff00ff' });
    state.assetTags.push({ assetId: 'asset-a', tagName: 'reaction' });

    const created = await createExport();
    state.exports.get(created.id)!.servedParts = [0];

    const response = await manifestGet(
      request(`/api/library/export/${created.id}/manifest`),
      ctx({ exportId: created.id }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const manifest = JSON.parse(await response.text());
    expect(manifest.manifest).toBe('sploot-library-export');
    expect(manifest.manifestVersion).toBe('1.0');
    expect(manifest.exportId).toBe(created.id);
    expect(manifest.complete).toBe(true);
    expect(manifest.incompleteReasons).toEqual([]);
    expect(manifest.totals).toMatchObject({ assets: 1, originalBytes: 4, parts: 1, failedObjects: 0 });
    expect(manifest.tags).toEqual([{ name: 'reaction', color: '#ff00ff' }]);
    expect(manifest.assets).toHaveLength(1);
    expect(manifest.assets[0]).toMatchObject({
      id: 'asset-a',
      archivePath: 'assets/asset-a.png',
      part: 0,
      mime: 'image/png',
      bytes: 4,
      sha256: sha256Hex(a),
      width: 2,
      height: 2,
      favorite: true,
      phash: 'abcd',
      tags: ['reaction'],
    });
  });

  it('reserves enough for user-controlled tag metadata', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    seedAsset('asset-a', USER, bytes);
    const longTag = 'x'.repeat(TAG.maxNameLength);
    state.tags.push({ ownerUserId: USER, name: longTag, color: null });
    state.assetTags.push({ assetId: 'asset-a', tagName: longTag });

    const created = await createExport();
    state.exports.get(created.id)!.servedParts = [0];
    const response = await manifestGet(
      request('/api/library/export/' + created.id + '/manifest'),
      ctx({ exportId: created.id }),
    );

    expect(response.status).toBe(200);
    const manifest = JSON.parse(await response.text());
    expect(manifest.tags).toEqual([{ name: longTag, color: null }]);
    expect(manifest.assets[0].tags).toEqual([longTag]);
  });

  it('propagates terminal bookkeeping failures instead of closing successfully', async () => {
    seedAsset('asset-bookkeeping', USER, new Uint8Array([1, 2]));
    const created = await createExport();
    const row = state.exports.get(created.id)!;
    row.servedParts = [0];
    const stream = streamExportManifest({
      row: row as any,
      onComplete: async () => {
        throw new Error('egress bookkeeping failed');
      },
    });
    await expect(new Response(stream).text()).rejects.toThrow(/bookkeeping/i);
  });

  it('fails closed when a client never drains manifest backpressure', async () => {
    seedAsset('asset-slow-manifest', USER, new Uint8Array([1, 2]));
    const created = await createExport();
    const row = state.exports.get(created.id)!;
    const stream = streamExportManifest({ row: row as any, backpressureTimeoutMs: 10 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const downstream = stream.getReader();
    await expect(downstream.read()).rejects.toThrow(/backpressure/i);
  });

  it('fails closed when deletion wins before manifest scan', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1, 2]));
    const created = await createExport();
    const row = state.exports.get(created.id)!;
    row.servedParts = [0];
    const originalFindFirst = fakePrisma.libraryExport.findFirst;
    let lifecycleProbe = 0;
    fakePrisma.libraryExport.findFirst = async (args: any) => {
      const current = await originalFindFirst(args);
      if (++lifecycleProbe === 1) {
        row.status = 'canceled';
        state.assets = [];
      }
      return current;
    };
    try {
      const stream = streamExportManifest({ row: row as any });
      await expect(new Response(stream).text()).rejects.toThrow(/unavailable/i);
    } finally {
      fakePrisma.libraryExport.findFirst = originalFindFirst;
    }
  });

  it('fails closed when deletion wins after the first manifest page', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1, 2]));
    seedAsset('asset-b', USER, new Uint8Array([3, 4]));
    const created = await createExport();
    const row = state.exports.get(created.id)!;
    row.servedParts = [0];
    const originalFindMany = fakePrisma.asset.findMany;
    let pageReads = 0;
    fakePrisma.asset.findMany = async (args: any) => {
      const page = await originalFindMany(args);
      if (++pageReads === 1) {
        row.status = 'canceled';
        state.assets = [];
      }
      return page;
    };
    try {
      const stream = streamExportManifest({ row: row as any });
      await expect(new Response(stream).text()).rejects.toThrow(/unavailable/i);
    } finally {
      fakePrisma.asset.findMany = originalFindMany;
    }
  });

  it('reports live membership separately when a planned asset disappears', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1, 2]));
    const created = await createExport();
    state.exports.get(created.id)!.servedParts = [0];
    state.assets = [];

    const response = await manifestGet(
      request('/api/library/export/' + created.id + '/manifest'),
      ctx({ exportId: created.id }),
    );
    expect(response.status).toBe(200);
    const manifest = await response.json();
    expect(manifest.complete).toBe(false);
    expect(manifest.incompleteReasons).toContain('snapshot_membership_changed');
    expect(manifest.totals).toMatchObject({ assets: 0, snapshotAssets: 1 });
    expect(manifest.assets).toEqual([]);
  });

  it('never claims completeness for undownloaded parts or failed objects', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1, 2]));
    const created = await createExport();
    // Part exists but has not been fully served, and one object went missing.
    state.exports.get(created.id)!.failures = {
      '0': [{ assetId: 'asset-a', archivePath: 'assets/asset-a.png', reason: 'object_missing' }],
    };

    const response = await manifestGet(
      request(`/api/library/export/${created.id}/manifest`),
      ctx({ exportId: created.id }),
    );
    const manifest = JSON.parse(await response.text());
    expect(manifest.complete).toBe(false);
    expect(manifest.incompleteReasons).toEqual(
      expect.arrayContaining(['parts_not_fully_downloaded', 'objects_missing_or_failed']),
    );
    expect(manifest.failures).toEqual([
      { assetId: 'asset-a', archivePath: 'assets/asset-a.png', reason: 'object_missing' },
    ]);
    expect(manifest.totals.failedObjects).toBe(1);
  });

  it('errors instead of streaming past its egress reservation', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1]));
    const created = await createExport();
    const row = state.exports.get(created.id)!;

    const { streamExportManifest } = await import('@/lib/export/export-manifest');
    const stream = streamExportManifest({ row: row as any, maxBytes: BigInt(16) });
    await expect(new Response(stream).arrayBuffer()).rejects.toThrow();
  });

  it('is tenant-scoped and honors expiry', async () => {
    seedAsset('asset-a', USER, new Uint8Array([1]));
    const created = await createExport();

    authAs(OTHER);
    let response = await manifestGet(
      request(`/api/library/export/${created.id}/manifest`),
      ctx({ exportId: created.id }),
    );
    expect(response.status).toBe(404);

    authAs(USER);
    state.exports.get(created.id)!.expiresAt = new Date(Date.now() - 1000);
    response = await manifestGet(
      request(`/api/library/export/${created.id}/manifest`),
      ctx({ exportId: created.id }),
    );
    expect(response.status).toBe(410);
  });
});
