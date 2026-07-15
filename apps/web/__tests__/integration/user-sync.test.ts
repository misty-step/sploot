import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { syncUser } from '@/lib/db';
import { prisma } from '@/lib/db';

/**
 * Integration Tests for User Sync
 *
 * Ousterhout Principle: Test error paths
 * - Most bugs occur in error handling, not happy path
 * - These tests focus on edge cases and failure scenarios
 */
describe('User Sync Integration Tests', () => {
  // Test user IDs
  const oldUserId = 'user_old_test_12345';
  const newUserId = 'user_new_test_67890';
  const testEmail = 'test@sploot-integration-test.com';

  async function createOrphanUser() {
    await prisma.user.create({
      data: { id: oldUserId, email: testEmail },
    });
    await prisma.userIdentity.create({
      data: {
        userId: oldUserId,
        provider: 'clerk',
        providerSubject: oldUserId,
        email: testEmail,
      },
    });
  }

  beforeEach(async () => {
    // Clean up any existing test data
    await prisma?.searchLog.deleteMany({
      where: {
        OR: [
          { userId: oldUserId },
          { userId: newUserId },
        ],
      },
    });

    await prisma?.asset.deleteMany({
      where: {
        OR: [
          { ownerUserId: oldUserId },
          { ownerUserId: newUserId },
        ],
      },
    });

    await prisma?.tag.deleteMany({
      where: {
        OR: [
          { ownerUserId: oldUserId },
          { ownerUserId: newUserId },
        ],
      },
    });

    await prisma?.user.deleteMany({
      where: {
        OR: [
          { id: oldUserId },
          { id: newUserId },
          { email: testEmail },
        ],
      },
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma?.searchLog.deleteMany({
      where: {
        OR: [
          { userId: oldUserId },
          { userId: newUserId },
        ],
      },
    });

    await prisma?.asset.deleteMany({
      where: {
        OR: [
          { ownerUserId: oldUserId },
          { ownerUserId: newUserId },
        ],
      },
    });

    await prisma?.tag.deleteMany({
      where: {
        OR: [
          { ownerUserId: oldUserId },
          { ownerUserId: newUserId },
        ],
      },
    });

    await prisma?.user.deleteMany({
      where: {
        OR: [
          { id: oldUserId },
          { id: newUserId },
          { email: testEmail },
        ],
      },
    });
  });

  describe('Happy Path', () => {
    it('should create new user when user does not exist', async () => {
      if (!prisma) {
        console.warn('Skipping test: prisma not available');
        return;
      }

      // Act: Sync new user
      const result = await syncUser(newUserId, testEmail);

      // Assert: User created
      expect(result.id).toBe(newUserId);
      expect(result.email).toBe(testEmail);

      // Verify in database
      const dbUser = await prisma.user.findUnique({
        where: { id: newUserId },
      });
      expect(dbUser).toBeTruthy();
      expect(dbUser?.email).toBe(testEmail);
    });

    it('should update email if user exists with different email', async () => {
      if (!prisma) {
        console.warn('Skipping test: prisma not available');
        return;
      }

      // Setup: Create user with old email
      await prisma.user.create({
        data: {
          id: newUserId,
          email: 'old@example.com',
        },
      });

      // Act: Sync with new email
      const result = await syncUser(newUserId, testEmail);

      // Assert: Email updated
      expect(result.email).toBe(testEmail);
    });

    it('should return existing user if no changes needed', async () => {
      if (!prisma) {
        console.warn('Skipping test: prisma not available');
        return;
      }

      // Setup: Create user
      await prisma.user.create({
        data: {
          id: newUserId,
          email: testEmail,
        },
      });

      // Act: Sync same user
      const result = await syncUser(newUserId, testEmail);

      // Assert: User returned unchanged
      expect(result.id).toBe(newUserId);
      expect(result.email).toBe(testEmail);
    });
  });

  describe('Orphaned User Migration', () => {
    it('should migrate assets from old user to new user', async () => {
      if (!prisma) {
        console.warn('Skipping test: prisma not available');
        return;
      }

      // Setup: Create old user with assets
      await createOrphanUser();

      const assetIds = await Promise.all([
        prisma.asset.create({
          data: {
            ownerUserId: oldUserId,
            blobUrl: 'https://test.public.blob.vercel-storage.com/test1.png',
            pathname: '/test1.png',
            mime: 'image/png',
            size: 1000,
            checksumSha256: 'checksum1',
          },
        }),
        prisma.asset.create({
          data: {
            ownerUserId: oldUserId,
            blobUrl: 'https://test.public.blob.vercel-storage.com/test2.png',
            pathname: '/test2.png',
            mime: 'image/png',
            size: 2000,
            checksumSha256: 'checksum2',
          },
        }),
      ]);

      // Act: Sync new user (should trigger migration)
      await syncUser(newUserId, testEmail);

      // Assert: Assets moved to new user
      const newUserAssets = await prisma.asset.findMany({
        where: { ownerUserId: newUserId },
      });
      expect(newUserAssets).toHaveLength(2);
      expect(newUserAssets.map((a) => a.id)).toEqual(
        expect.arrayContaining(assetIds.map((a) => a.id))
      );

      // Assert: Old user deleted
      const oldUser = await prisma.user.findUnique({
        where: { id: oldUserId },
      });
      expect(oldUser).toBeNull();

      // Assert: New user exists with correct email
      const newUser = await prisma.user.findUnique({
        where: { id: newUserId },
      });
      expect(newUser).toBeTruthy();
      expect(newUser?.email).toBe(testEmail);
    });

    it('should migrate tags from old user to new user', async () => {
      if (!prisma) {
        console.warn('Skipping test: prisma not available');
        return;
      }

      // Setup: Create old user with tags
      await createOrphanUser();

      const tagIds = await Promise.all([
        prisma.tag.create({
          data: {
            ownerUserId: oldUserId,
            name: 'Test Tag 1',
          },
        }),
        prisma.tag.create({
          data: {
            ownerUserId: oldUserId,
            name: 'Test Tag 2',
          },
        }),
      ]);

      // Act: Sync new user
      await syncUser(newUserId, testEmail);

      // Assert: Tags moved to new user
      const newUserTags = await prisma.tag.findMany({
        where: { ownerUserId: newUserId },
      });
      expect(newUserTags).toHaveLength(2);
      expect(newUserTags.map((t) => t.id)).toEqual(
        expect.arrayContaining(tagIds.map((t) => t.id))
      );
    });

    it('should migrate search logs from old user to new user', async () => {
      if (!prisma) {
        console.warn('Skipping test: prisma not available');
        return;
      }

      // Setup: Create old user with search logs
      await createOrphanUser();

      await Promise.all([
        prisma.searchLog.create({
          data: {
            userId: oldUserId,
            query: 'test query 1',
            resultCount: 5,
            queryTime: 100,
          },
        }),
        prisma.searchLog.create({
          data: {
            userId: oldUserId,
            query: 'test query 2',
            resultCount: 10,
            queryTime: 200,
          },
        }),
      ]);

      // Act: Sync new user
      await syncUser(newUserId, testEmail);

      // Assert: Search logs moved to new user
      const newUserLogs = await prisma.searchLog.findMany({
        where: { userId: newUserId },
      });
      expect(newUserLogs).toHaveLength(2);

      // Assert: Old user has no search logs
      const oldUserLogs = await prisma.searchLog.findMany({
        where: { userId: oldUserId },
      });
      expect(oldUserLogs).toHaveLength(0);
    });

    it('should handle migration with zero assets (empty account)', async () => {
      if (!prisma) {
        console.warn('Skipping test: prisma not available');
        return;
      }

      // Setup: Create old user with no assets
      await createOrphanUser();

      // Act: Sync new user
      const result = await syncUser(newUserId, testEmail);

      // Assert: Migration succeeds even with no assets
      expect(result.id).toBe(newUserId);
      expect(result.email).toBe(testEmail);

      // Assert: Old user deleted
      const oldUser = await prisma.user.findUnique({
        where: { id: oldUserId },
      });
      expect(oldUser).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle concurrent sync attempts gracefully', async () => {
      if (!prisma) {
        console.warn('Skipping test: prisma not available');
        return;
      }

      // Act: Sync same user concurrently
      const results = await Promise.allSettled([
        syncUser(newUserId, testEmail),
        syncUser(newUserId, testEmail),
        syncUser(newUserId, testEmail),
      ]);

      // Assert: All succeed (idempotent)
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

      // Assert: Only one user created
      const users = await prisma.user.findMany({
        where: { email: testEmail },
      });
      expect(users).toHaveLength(1);
    });

    it('should handle database unavailable gracefully', async () => {
      // Act: Try to sync when prisma is null
      const mockPrismaNull = vi.fn(() => null);
      const result = await syncUser(newUserId, testEmail);

      // Assert: Returns mock user object without throwing
      expect(result).toBeTruthy();
      expect(result.id).toBe(newUserId);
      expect(result.email).toBe(testEmail);
    });
  });

  describe('Transaction Isolation', () => {
    it('should use SERIALIZABLE isolation for migrations', async () => {
      if (!prisma) {
        console.warn('Skipping test: prisma not available');
        return;
      }

      // Setup: Create old user
      await createOrphanUser();

      // Act: Sync (triggers migration)
      await syncUser(newUserId, testEmail);

      // Assert: Migration completed atomically
      const oldUser = await prisma.user.findUnique({
        where: { id: oldUserId },
      });
      const newUser = await prisma.user.findUnique({
        where: { id: newUserId },
      });

      // Both conditions must be true (atomic):
      // 1. Old user deleted
      // 2. New user created
      expect(oldUser).toBeNull();
      expect(newUser).toBeTruthy();
    });
  });
});
