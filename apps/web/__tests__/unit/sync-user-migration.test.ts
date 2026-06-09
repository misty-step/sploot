import { describe, expect, it, vi } from 'vitest';

type UserRecord = {
  id: string;
  email: string;
  role?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type AssetRecord = { id: string; ownerUserId: string };
type TagRecord = { id: string; ownerUserId: string; name: string };
type SearchLogRecord = {
  id: string;
  userId: string;
  query: string;
  resultCount: number;
  queryTime: number;
  createdAt?: Date;
};
type UserIdentityRecord = {
  id: string;
  userId: string;
  provider: string;
  providerSubject: string;
  email?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

const createState = () => ({
  users: [] as UserRecord[],
  assets: [] as AssetRecord[],
  tags: [] as TagRecord[],
  searchLogs: [] as SearchLogRecord[],
  identities: [] as UserIdentityRecord[],
});

describe('syncUser migration', () => {
  it('reparents all user data when email already exists', async () => {
    vi.resetModules();

    const state = createState();

    vi.doMock('@/lib/env', () => ({
      databaseConfigured: true,
      blobConfigured: false,
      clerkConfigured: false,
      replicateConfigured: false,
    }));

    vi.doMock('@prisma/client', () => {
      const Prisma = {
        sql: (...args: any[]) => args,
        join: (vals: any[]) => vals,
        empty: Symbol('empty'),
      };

      class PrismaClient {
        user = {
          findUnique: async ({ where }: any) => {
            if (where.id) return state.users.find((u) => u.id === where.id) ?? null;
            if (where.email) return state.users.find((u) => u.email === where.email) ?? null;
            return null;
          },
          create: async ({ data }: any) => {
            const record: UserRecord = {
              ...data,
              role: data.role ?? 'user',
              createdAt: data.createdAt ?? new Date(),
              updatedAt: data.updatedAt ?? new Date(),
            };
            state.users.push(record);
            return record;
          },
          delete: async ({ where }: any) => {
            const idx = state.users.findIndex((u) => u.id === where.id);
            if (idx === -1) throw new Error('user not found');
            const [removed] = state.users.splice(idx, 1);
            return removed;
          },
          update: async ({ where, data }: any) => {
            const user = state.users.find((u) => u.id === where.id);
            if (!user) throw new Error('user not found');
            Object.assign(user, data, { updatedAt: new Date() });
            return user;
          },
        };

        asset = {
          updateMany: async ({ where, data }: any) => {
            let count = 0;
            state.assets.forEach((asset, idx) => {
              if (asset.ownerUserId === where.ownerUserId) {
                state.assets[idx] = { ...asset, ...data };
                count++;
              }
            });
            return { count };
          },
        };

        tag = {
          updateMany: async ({ where, data }: any) => {
            let count = 0;
            state.tags.forEach((tag, idx) => {
              if (tag.ownerUserId === where.ownerUserId) {
                state.tags[idx] = { ...tag, ...data };
                count++;
              }
            });
            return { count };
          },
        };

        searchLog = {
          updateMany: async ({ where, data }: any) => {
            let count = 0;
            state.searchLogs.forEach((row, idx) => {
              if (row.userId === where.userId) {
                state.searchLogs[idx] = { ...row, ...data };
                count++;
              }
            });
            return { count };
          },
        };

        userIdentity = {
          upsert: async ({ where, update, create }: any) => {
            const unique = where.unique_provider_subject;
            const existing = state.identities.find(
              (identity) =>
                identity.provider === unique.provider &&
                identity.providerSubject === unique.providerSubject
            );

            if (existing) {
              Object.assign(existing, update, { updatedAt: new Date() });
              return existing;
            }

            const record: UserIdentityRecord = {
              id: `identity_${state.identities.length + 1}`,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...create,
            };
            state.identities.push(record);
            return record;
          },
        };

        $use() {
          // no-op for middleware stubs
        }

        async $transaction(fn: any) {
          return fn(this);
        }
      }

      return { PrismaClient, Prisma, __dbState: state };
    });

    const { syncUser } = await import('@/lib/db');
    const { __dbState } = await import('@prisma/client') as any;

    const email = 'phrazzld@pm.me';
    const oldUserId = 'user_old';
    const newUserId = 'user_new';

    __dbState.users.push({ id: oldUserId, email, role: 'user' });
    __dbState.assets.push({ id: 'asset1', ownerUserId: oldUserId });
    __dbState.tags.push({ id: 'tag1', ownerUserId: oldUserId, name: 'tags ftw' });
    __dbState.searchLogs.push({
      id: 'log1',
      userId: oldUserId,
      query: 'lolcats',
      resultCount: 1,
      queryTime: 5,
    });

    await syncUser(newUserId, email);

    const migratedUser = __dbState.users.find((u: UserRecord) => u.id === newUserId);

    expect(__dbState.users.find((u: UserRecord) => u.id === oldUserId)).toBeUndefined();
    expect(migratedUser?.email).toBe(email);
    expect(__dbState.assets.every((a: AssetRecord) => a.ownerUserId === newUserId)).toBe(true);
    expect(__dbState.tags.every((t: TagRecord) => t.ownerUserId === newUserId)).toBe(true);
    expect(__dbState.searchLogs.every((s: SearchLogRecord) => s.userId === newUserId)).toBe(true);
    expect(__dbState.identities).toContainEqual(expect.objectContaining({
      userId: newUserId,
      provider: 'clerk',
      providerSubject: newUserId,
      email,
    }));
  });
});
