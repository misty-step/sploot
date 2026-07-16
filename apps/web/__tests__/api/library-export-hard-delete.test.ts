import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const OWNER = 'export-delete-owner';
const snapshotAt = new Date('2026-07-15T12:00:00.000Z');
const asset = {
  id: 'asset-delete-me',
  ownerUserId: OWNER,
  size: 3,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  deletedAt: null as Date | null,
  shareSlug: 'share-delete-me',
};

const state = vi.hoisted(() => ({
  exports: new Map<string, any>(),
  nextId: 1,
}));
const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
}));

vi.mock('@/lib/auth/request-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/enrollment/enrollment-policy', () => ({
  acquireEnrollmentIdentityWriterLock: vi.fn(async () => undefined),
  assertEnrolledUser: vi.fn(async () => undefined),
  enrollmentResponseForError: vi.fn(() => null),
  enrollmentUnavailableResponse: vi.fn(() => new Response(null, { status: 503 })),
}));
vi.mock('@/lib/cache', () => ({ getCacheService: () => ({ clear: vi.fn() }) }));
vi.mock('@/lib/slug-cache', () => ({ invalidateSlugCache: vi.fn(async () => undefined) }));
vi.mock('@/lib/with-observability', () => ({ withObservability: (handler: unknown) => handler }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const fakePrisma = vi.hoisted(() => {
  const db: any = {
    user: { findUnique: async () => ({ id: OWNER }) },
    asset: {
      findFirst: async ({ where }: any) =>
        where.id === asset.id && where.ownerUserId === OWNER && asset.deletedAt === null
          ? { ...asset }
          : null,
      findMany: async ({ where, take }: any) => {
        if (where.ownerUserId !== OWNER || asset.deletedAt !== null) return [];
        if (where.createdAt?.lte && asset.createdAt > where.createdAt.lte) return [];
        if (where.id?.gt && !(asset.id > where.id.gt)) return [];
        return [{ id: asset.id, size: asset.size }].slice(0, take ?? 1000);
      },
      delete: async () => {
        asset.deletedAt = new Date();
        return { ...asset };
      },
    },
    assetTag: { deleteMany: async () => ({ count: 0 }) },
    assetEmbedding: { deleteMany: async () => ({ count: 0 }) },
    libraryExport: {
      deleteMany: async () => ({ count: 0 }),
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
        const row = {
          id: 'export-' + state.nextId++,
          createdAt: new Date(),
          updatedAt: new Date(),
          servedParts: [],
          failures: {},
          egressBytes: BigInt(0),
          ...data,
        };
        state.exports.set(row.id, row);
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of state.exports.values()) {
          if (where.ownerUserId && row.ownerUserId !== where.ownerUserId) continue;
          if (where.status && row.status !== where.status) continue;
          Object.assign(row, data, { updatedAt: new Date() });
          count += 1;
        }
        return { count };
      },
    },
    $transaction: async (fn: any) => fn(db),
  };
  return db;
});
vi.mock('@/lib/db', () => ({ prisma: fakePrisma }));

import { DELETE as assetDelete } from '@/app/api/assets/[id]/route';
import { GET as partGet } from '@/app/api/library/export/[exportId]/parts/[partIndex]/route';
import { GET as manifestGet } from '@/app/api/library/export/[exportId]/manifest/route';
import { createOrReuseExport } from '@/lib/export/export-service';

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function request(url: string, init?: RequestInit) {
  return new NextRequest('http://localhost:3000' + url, init);
}

beforeEach(() => {
  state.exports.clear();
  state.nextId = 1;
  asset.deletedAt = null;
  mocks.authenticateRequest.mockResolvedValue({
    status: 'authenticated',
    principal: {
      userId: OWNER,
      provider: 'qa-local',
      providerSubject: OWNER,
      source: 'qa-local',
      credentialKind: 'qa-local',
    },
    syncStatus: 'success',
  });
});

describe('permanent asset deletion and export snapshots', () => {
  it('invalidates the snapshot and returns terminal responses for later downloads', async () => {
    const { export: created } = await createOrReuseExport(OWNER);

    const deleted = await assetDelete(
      request('/api/assets/' + asset.id + '?permanent=true', { method: 'DELETE' }),
      context({ id: asset.id }),
    );
    expect(deleted.status).toBe(200);
    expect(state.exports.get(created.id).status).toBe('canceled');

    const part = await partGet(
      request('/api/library/export/' + created.id + '/parts/0'),
      context({ exportId: created.id, partIndex: '0' }),
    );
    expect(part.status).toBe(410);
    expect((await part.json()).code).toBe('export_unavailable');

    const manifest = await manifestGet(
      request('/api/library/export/' + created.id + '/manifest'),
      context({ exportId: created.id }),
    );
    expect(manifest.status).toBe(410);
    expect((await manifest.json()).code).toBe('export_unavailable');
  });
});
