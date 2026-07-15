import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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
  createdAt: Date;
  updatedAt: Date;
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
          createdAt: new Date(),
          updatedAt: new Date(),
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
        let count = 0;
        for (const row of state.exports.values()) {
          if (where.id && row.id !== where.id) continue;
          if (where.ownerUserId && row.ownerUserId !== where.ownerUserId) continue;
          if (where.status && row.status !== where.status) continue;
          Object.assign(row, data, { updatedAt: new Date() });
          count += 1;
        }
        return { count };
      },
      deleteMany: async ({ where }: any) => {
        let count = 0;
        for (const [id, row] of state.exports) {
          if (where.ownerUserId && row.ownerUserId !== where.ownerUserId) continue;
          if (where.expiresAt?.lt && !(row.expiresAt < where.expiresAt.lt)) continue;
          state.exports.delete(id);
          count += 1;
        }
        return { count };
      },
    },
    asset: {
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
import { EXPORT_TTL_MS, exportEgressAllowance } from '@/lib/export/export-policy';

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
    row.egressBytes = exportEgressAllowance(row.totalOriginalBytes) + BigInt(1);

    const response = await partGet(
      request(`/api/library/export/${created.id}/parts/0`),
      ctx({ exportId: created.id, partIndex: '0' }),
    );
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe('export_egress_exhausted');
  });
});

describe('GET /api/library/export/:exportId/manifest', () => {
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
