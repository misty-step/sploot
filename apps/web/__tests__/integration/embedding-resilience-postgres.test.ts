import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import {
  EMBEDDING_MAX_ATTEMPTS,
  EMBEDDING_TERMINAL_REVIVE_QUARANTINE_SECONDS,
  getEmbeddingProviderCircuit,
  deferEmbeddingAdmission,
  recordEmbeddingAdmissionFailure,
  acquireEmbeddingProviderAdmission,
} from '@/lib/embedding-resilience';
import { EmbeddingSchedulerService } from '@/lib/upload/embedding-scheduler-service';
import {
  acquireEmbeddingDailyBudget,
  acquireEmbeddingRateLimit,
  refundEmbeddingAdmissionCapacity,
  EMBEDDING_GLOBAL_CONCURRENCY_LIMIT,
} from '@/lib/embedding-rate-limit';
import { GET as processEmbeddings } from '@/app/api/cron/process-embeddings/route';
import { POST as generateEmbedding } from '@/app/api/assets/[id]/generate-embedding/route';
import { NextRequest } from 'next/server';
import {
  EmbeddingProviderRateLimitError,
  EmbeddingProviderUnavailableError,
} from '@/lib/embedding-errors';

const providerRun = vi.hoisted(() => vi.fn());
const reportCanaryError = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const authUser = vi.hoisted(() => ({ current: 'embedding-resilience-unauthenticated' }));

vi.mock('@/lib/auth/server', () => ({
  getAuth: vi.fn(async () => ({ userId: authUser.current })),
}));

vi.mock('replicate', () => ({
  default: class Replicate {
    run = providerRun;
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({
    authorization: 'Bearer embedding-resilience-cron-secret',
  })),
}));

vi.mock('@/lib/canary-reporter', () => ({
  reportCanaryError,
}));

const describeWithDatabase = process.env.DATABASE_URL && prisma
  ? describe.sequential
  : describe.skip;

describeWithDatabase('embedding resilience against isolated pgvector Postgres', () => {
  const userId = 'embedding-resilience-test-user';
  const secondUserId = 'embedding-resilience-second-user';
  const assetId = 'embedding-resilience-poison-asset';
  const secondAssetId = 'embedding-resilience-second-asset';
  const chainAssetIds = [
    'embedding-resilience-chain-a',
    'embedding-resilience-chain-b',
    'embedding-resilience-chain-c',
    'embedding-resilience-chain-500',
    'embedding-resilience-chain-503',
    'embedding-resilience-chain-timeout',
    'embedding-resilience-chain-poison',
    'embedding-resilience-chain-init-recovery',
    'embedding-resilience-chain-init-poison',
    'embedding-resilience-chain-null-init',
  ];
  const chainUserIds = [
    'embedding-resilience-chain-user-a',
    'embedding-resilience-chain-user-b',
    'embedding-resilience-chain-user-c',
    'embedding-resilience-chain-user-500',
    'embedding-resilience-chain-user-503',
    'embedding-resilience-chain-user-timeout',
    'embedding-resilience-chain-user-poison',
    'embedding-resilience-chain-user-init-recovery',
    'embedding-resilience-chain-user-init-poison',
    'embedding-resilience-chain-user-null-init',
  ];
  let chainCacheSuffix = 0;

  beforeEach(() => {
    chainCacheSuffix += 1;
    vi.stubEnv('REPLICATE_API_TOKEN', 'r8_isolated_test_token');
    vi.stubEnv('SPLOOT_EMBEDDINGS_ENABLED', 'true');
    providerRun.mockReset();
    reportCanaryError.mockClear();
    authUser.current = 'embedding-resilience-unauthenticated';
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    const allAssetIds = [assetId, secondAssetId, ...chainAssetIds];
    const allUserIds = [userId, secondUserId, ...chainUserIds];
    await prisma.assetEmbedding.deleteMany({ where: { assetId: { in: allAssetIds } } });
    await prisma.asset.deleteMany({ where: { id: { in: allAssetIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.embeddingRateLease.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.embeddingRateBucket.deleteMany({ where: { key: { startsWith: 'embedding:' } } });
    await prisma.embeddingProviderCircuit.deleteMany();
  });

  afterAll(async () => {
    await prisma.embeddingProviderCircuit.deleteMany();
  });

  async function seedChainAssets(): Promise<void> {
    await prisma.user.createMany({
      data: chainUserIds.map((id) => ({ id, email: `${id}@example.test` })),
    });
    await prisma.asset.createMany({
      data: chainAssetIds.map((id, index) => ({
        id,
        ownerUserId: chainUserIds[index],
        blobUrl: `https://embedding-resilience.public.blob.vercel-storage.com/${id}.jpg`,
        pathname: `${id}.jpg`,
        mime: 'image/jpeg',
        size: 1,
        checksumSha256: `${id}-checksum-${chainCacheSuffix}`,
      })),
    });
    await prisma.assetEmbedding.createMany({
      data: chainAssetIds.map((assetId) => ({
        assetId,
        modelName: 'pending',
        modelVersion: 'pending',
        dim: 0,
        status: 'pending',
      })),
    });
  }

  async function seedTerminalChainAsset(
    index: number,
    terminalAtMs: number
  ): Promise<void> {
    await seedChainAssets();
    await prisma.assetEmbedding.update({
      where: { assetId: chainAssetIds[index] },
      data: {
        status: 'failed',
        attemptCount: EMBEDDING_MAX_ATTEMPTS,
        nextAttemptAt: null,
        terminalAt: new Date(terminalAtMs),
        error: 'Embedding image failed: provider returned HTTP 429',
      },
    });
  }

  async function postGenerateEmbedding(index: number): Promise<Response> {
    const assetId = chainAssetIds[index];
    const response = await generateEmbedding(
      new NextRequest(`http://localhost/api/assets/${assetId}/generate-embedding`, {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: assetId }) }
    );
    // Flush the route's in-flight dedup cleanup timer under fake timers so a
    // later request for the same user/asset is not served a stale result.
    await vi.advanceTimersByTimeAsync(200);
    return response;
  }

  async function scheduleChainAsset(index: number): Promise<void> {
    await new EmbeddingSchedulerService().scheduleEmbedding({
      assetId: chainAssetIds[index],
      blobUrl: `https://embedding-resilience.public.blob.vercel-storage.com/${chainAssetIds[index]}.jpg`,
      checksum: `${chainAssetIds[index]}-checksum-${chainCacheSuffix}`,
      mode: 'sync',
      ownerUserId: chainUserIds[index],
    });
  }

  it('production admission denial opens one durable interval and suppresses concurrent circuit denials', async () => {
    const nowMs = Date.UTC(2026, 6, 14, 12, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    await seedChainAssets();
    const windowId = Math.floor(nowMs / 60_000);
    await prisma.embeddingRateBucket.upsert({
      where: { key: `embedding:rate:global:${windowId}` },
      create: {
        key: `embedding:rate:global:${windowId}`,
        count: 50,
        expiresAt: new Date(nowMs + 60_000),
      },
      update: { count: 50, expiresAt: new Date(nowMs + 60_000) },
    });

    await expect(scheduleChainAsset(0)).rejects.toMatchObject({
      statusCode: 429,
      reason: 'global_rate',
    });
    await Promise.all([
      expect(scheduleChainAsset(1)).rejects.toMatchObject({
        statusCode: 503,
        reason: 'provider_circuit_open',
      }),
      expect(scheduleChainAsset(2)).rejects.toMatchObject({
        statusCode: 503,
        reason: 'provider_circuit_open',
      }),
    ]);

    const row = await prisma.embeddingProviderCircuit.findUnique({
      where: { key: 'replicate-image' },
      select: { failureCount: true, generation: true, lastReason: true, lastFailureAt: true, lastAlertedAt: true, openUntil: true },
    });

    expect(row).toMatchObject({
      failureCount: 1,
      generation: 1,
      lastReason: 'global_rate',
      lastFailureAt: new Date(nowMs),
      lastAlertedAt: new Date(nowMs),
      openUntil: new Date(nowMs + 60_000),
    });
    await vi.waitFor(() => expect(reportCanaryError).toHaveBeenCalledTimes(1));
    expect(reportCanaryError).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'embedding-provider.circuit-open',
        error: expect.objectContaining({
          message: 'Embedding provider admission is throttled',
        }),
        metadata: expect.objectContaining({ reason: 'global_rate' }),
      }),
    );
    expect(JSON.stringify(reportCanaryError.mock.calls[0][0])).not.toContain('raw');
    expect(providerRun).not.toHaveBeenCalled();
  }, 30_000);

  it('defers on ordinary global concurrency saturation without opening the shared circuit', async () => {
    const nowMs = Date.UTC(2026, 6, 14, 22, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    await seedChainAssets();
    // Saturate the global in-flight cap with healthy work owned by other users.
    await prisma.embeddingRateLease.createMany({
      data: Array.from({ length: EMBEDDING_GLOBAL_CONCURRENCY_LIMIT }, (_, index) => ({
        id: `embedding-resilience-inflight-${index}`,
        userId: chainUserIds[index],
        expiresAt: new Date(nowMs + 60_000),
      })),
    });

    await expect(scheduleChainAsset(3)).rejects.toMatchObject({
      statusCode: 429,
      reason: 'global_concurrency',
    });

    // Only the denied asset is deferred; the durable circuit stays closed so
    // in-flight saturation cannot become a minutes-long global outage.
    await expect(
      prisma.embeddingProviderCircuit.findUnique({ where: { key: 'replicate-image' } }),
    ).resolves.toBeNull();
    expect((await getEmbeddingProviderCircuit(nowMs)).open).toBe(false);
    await expect(
      prisma.assetEmbedding.findUnique({
        where: { assetId: chainAssetIds[3] },
        select: { status: true, attemptCount: true, nextAttemptAt: true, terminalAt: true },
      }),
    ).resolves.toMatchObject({
      status: 'pending',
      attemptCount: 0,
      nextAttemptAt: new Date(nowMs + 180_000),
      terminalAt: null,
    });
    expect(reportCanaryError).not.toHaveBeenCalled();

    // The moment in-flight work completes, admission recovers for other assets.
    await prisma.embeddingRateLease.deleteMany({
      where: { id: { startsWith: 'embedding-resilience-inflight-' } },
    });
    providerRun.mockResolvedValueOnce(Array(768).fill(0.1));
    await scheduleChainAsset(4);
    await expect(
      prisma.assetEmbedding.findUnique({
        where: { assetId: chainAssetIds[4] },
        select: { status: true },
      }),
    ).resolves.toMatchObject({ status: 'ready' });
    expect(providerRun).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('refunds minute and daily accounting when a circuit opens after reservations', async () => {
    const nowMs = Date.UTC(2026, 6, 14, 12, 30, 0);
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);

    const rate = await acquireEmbeddingRateLimit(userId, nowMs);
    expect(rate.allowed).toBe(true);
    const daily = await acquireEmbeddingDailyBudget(nowMs);
    expect(daily.allowed).toBe(true);
    const windowId = Math.floor(nowMs / 60_000);
    const windowKeys = [
      `embedding:rate:user:${userId}:${windowId}`,
      `embedding:rate:global:${windowId}`,
    ];
    const before = await prisma.embeddingRateBucket.findMany({
      where: { key: { in: [...windowKeys, `embedding:daily:2026-07-14`] } },
      select: { key: true, count: true },
    });

    await recordEmbeddingAdmissionFailure('global_rate', 60, nowMs);
    await expect(acquireEmbeddingProviderAdmission(nowMs)).resolves.toMatchObject({
      allowed: false,
      reason: 'provider_rate_limit',
    });
    await refundEmbeddingAdmissionCapacity(rate.lease!, daily.reservation);

    const after = await prisma.embeddingRateBucket.findMany({
      where: { key: { in: [...windowKeys, `embedding:daily:2026-07-14`] } },
      select: { key: true, count: true },
    });
    expect(after).toEqual(before.map((row) => ({ ...row, count: row.count - 1 })));
    expect(await prisma.embeddingRateLease.count({ where: { id: rate.lease!.id } })).toBe(0);
  }, 30_000);

  it('production provider chain fences a stale probe failure after a newer probe succeeds', async () => {
    const nowMs = Date.UTC(2026, 6, 14, 12, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    await seedChainAssets();

    providerRun.mockRejectedValueOnce({ status: 429, retryAfterSec: 30 });
    await expect(scheduleChainAsset(0)).rejects.toMatchObject({
      statusCode: 429,
      cause: expect.objectContaining({
        name: 'EmbeddingProviderRateLimitError',
      }),
    });

    let rejectOld!: (reason?: unknown) => void;
    const oldProbe = new Promise<unknown>((_resolve, reject) => {
      rejectOld = reject;
    });
    vi.setSystemTime(nowMs + 31_000);
    providerRun.mockImplementationOnce(() => oldProbe);
    const oldInvocation = scheduleChainAsset(1).catch((error) => error);
    await vi.waitFor(() => expect(providerRun).toHaveBeenCalledTimes(2));

    vi.setSystemTime(nowMs + 92_000);
    providerRun.mockResolvedValueOnce(Array(768).fill(0.1));
    await scheduleChainAsset(2);
    rejectOld({ status: 503 });
    const oldError = await oldInvocation;

    expect(oldError).toMatchObject({
      statusCode: 503,
      cause: expect.objectContaining({
        name: 'EmbeddingProviderUnavailableError',
      }),
    });
    const row = await prisma.embeddingProviderCircuit.findUnique({
      where: { key: 'replicate-image' },
      select: { failureCount: true, generation: true, openUntil: true, lastReason: true },
    });
    expect(row).toEqual({
      failureCount: 0,
      generation: 2,
      openUntil: null,
      lastReason: null,
    });
    await expect(
      prisma.assetEmbedding.findUnique({
        where: { assetId: chainAssetIds[1] },
        select: { attemptCount: true, status: true, nextAttemptAt: true },
      })
    ).resolves.toMatchObject({
      attemptCount: 1,
      status: 'pending',
      nextAttemptAt: new Date(nowMs + 152_000),
    });
    expect(providerRun).toHaveBeenCalledTimes(3);
  }, 30_000);

  it('fences a stale malformed probe result after a newer probe succeeds', async () => {
    const nowMs = Date.UTC(2026, 6, 14, 15, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    await seedChainAssets();

    providerRun.mockRejectedValueOnce({ status: 429 });
    await expect(scheduleChainAsset(0)).rejects.toMatchObject({ statusCode: 429 });

    let resolveOld!: (value: unknown) => void;
    const oldProbe = new Promise<unknown>((resolve) => { resolveOld = resolve; });
    vi.setSystemTime(nowMs + 31_000);
    providerRun.mockImplementationOnce(() => oldProbe);
    const oldInvocation = scheduleChainAsset(1).catch((error) => error);
    await vi.waitFor(() => expect(providerRun).toHaveBeenCalledTimes(2));

    vi.setSystemTime(nowMs + 92_000);
    providerRun.mockResolvedValueOnce(Array(768).fill(0.1));
    await scheduleChainAsset(2);
    await expect(
      prisma.embeddingProviderCircuit.findUnique({
        where: { key: 'replicate-image' },
        select: { failureCount: true, generation: true, openUntil: true, lastReason: true },
      }),
    ).resolves.toEqual({
      failureCount: 0,
      generation: 2,
      openUntil: null,
      lastReason: null,
    });
    resolveOld([]);
    await expect(oldInvocation).resolves.toMatchObject({
      statusCode: 503,
      cause: expect.objectContaining({ name: 'EmbeddingProviderUnavailableError' }),
    });

    await expect(
      prisma.embeddingProviderCircuit.findUnique({
        where: { key: 'replicate-image' },
        select: { failureCount: true, generation: true, openUntil: true, lastReason: true },
      }),
    ).resolves.toEqual({
      failureCount: 0,
      generation: 2,
      openUntil: null,
      lastReason: null,
    });
  }, 30_000);

  it.each([
    { index: 3, label: '500', providerError: { status: 500 } },
    { index: 4, label: '503', providerError: { status: 503 } },
  ])('production provider chain types and persists $label failures', async ({ index, providerError }) => {
    const nowMs = Date.UTC(2026, 6, 14, 13, index, 0);
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    await seedChainAssets();
    providerRun.mockRejectedValueOnce(providerError);

    await expect(scheduleChainAsset(index)).rejects.toMatchObject({
      statusCode: 503,
      retryAfterSec: 30,
      cause: expect.objectContaining({ name: 'EmbeddingProviderUnavailableError' }),
    });
    const asset = await prisma.assetEmbedding.findUnique({
      where: { assetId: chainAssetIds[index] },
      select: { attemptCount: true, status: true, nextAttemptAt: true, terminalAt: true },
    });
    expect(asset).toEqual({
      attemptCount: 1,
      status: 'pending',
      nextAttemptAt: new Date(nowMs + 60_000),
      terminalAt: null,
    });
    const circuit = await getEmbeddingProviderCircuit(nowMs);
    expect(circuit).toMatchObject({ open: true, reason: 'provider_unavailable' });
  }, 30_000);

  it('production provider timeout is typed, globally recorded, and poison-bounded', async () => {
    const nowMs = Date.UTC(2026, 6, 14, 14, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    await seedChainAssets();
    providerRun.mockRejectedValueOnce(new Error('provider request timed out'));
    const error = await scheduleChainAsset(5).catch((failure) => failure);

    expect(error).toMatchObject({
      statusCode: 503,
      retryAfterSec: 30,
      cause: expect.objectContaining({ name: 'EmbeddingProviderUnavailableError' }),
    });
    const asset = await prisma.assetEmbedding.findUnique({
      where: { assetId: chainAssetIds[5] },
      select: { attemptCount: true, nextAttemptAt: true },
    });
    expect(asset).toEqual({
      attemptCount: 1,
      nextAttemptAt: new Date(nowMs + 60_000),
    });
    expect((await getEmbeddingProviderCircuit(nowMs)).reason).toBe('provider_unavailable');
  }, 30_000);

  it('keeps upload-scheduled initialization failure retryable for cron recovery', async () => {
    const nowMs = Date.UTC(2026, 6, 14, 16, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    await seedChainAssets();
    vi.stubEnv('REPLICATE_API_TOKEN', '');

    await expect(scheduleChainAsset(7)).rejects.toMatchObject({
      statusCode: 503,
      retryable: true,
      cause: expect.objectContaining({ name: 'EmbeddingProviderUnavailableError' }),
    });
    await expect(
      prisma.assetEmbedding.findUnique({
        where: { assetId: chainAssetIds[7] },
        select: { attemptCount: true, status: true, nextAttemptAt: true, terminalAt: true },
      }),
    ).resolves.toMatchObject({
      attemptCount: 1,
      status: 'pending',
      nextAttemptAt: new Date(nowMs + 60_000),
      terminalAt: null,
    });

    vi.setSystemTime(nowMs + 60_000);
    vi.stubEnv('REPLICATE_API_TOKEN', 'r8_isolated_test_token');
    providerRun.mockResolvedValueOnce(Array(768).fill(0.1));
    await scheduleChainAsset(7);
    await expect(
      prisma.assetEmbedding.findUnique({
        where: { assetId: chainAssetIds[7] },
        select: { attemptCount: true, status: true, terminalAt: true },
      }),
    ).resolves.toMatchObject({ attemptCount: 0, status: 'ready', terminalAt: null });
  }, 30_000);

  it('recovers an upload-scheduled initialization failure through the real cron route', async () => {
    const nowMs = Date.UTC(2026, 6, 14, 18, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    await seedChainAssets();
    await prisma.asset.update({
      where: { id: chainAssetIds[7] },
      data: { createdAt: new Date(nowMs - 2 * 60 * 60 * 1000) },
    });
    vi.stubEnv('REPLICATE_API_TOKEN', '');
    await expect(scheduleChainAsset(7)).rejects.toMatchObject({
      statusCode: 503,
      retryable: true,
    });

    vi.setSystemTime(nowMs + 60_000);
    vi.stubEnv('REPLICATE_API_TOKEN', 'r8_isolated_test_token');
    vi.stubEnv('CRON_SECRET', 'embedding-resilience-cron-secret');
    providerRun.mockResolvedValueOnce(Array(768).fill(0.1));
    const response = await processEmbeddings(
      new NextRequest('http://localhost/api/cron/process-embeddings'),
    );
    expect(response.status).toBe(200);
    await expect(
      prisma.assetEmbedding.findUnique({
        where: { assetId: chainAssetIds[7] },
        select: { attemptCount: true, status: true, terminalAt: true },
      }),
    ).resolves.toMatchObject({ attemptCount: 0, status: 'ready', terminalAt: null });
  }, 30_000);

  it('claims a null embedding before cron initialization and poison-bounds restart rediscovery', async () => {
    const nullAssetId = chainAssetIds[9];
    const nullUserId = chainUserIds[9];
    const baseNowMs = Date.UTC(2026, 6, 14, 19, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(baseNowMs);
    await prisma.user.create({
      data: { id: nullUserId, email: `${nullUserId}@example.test` },
    });
    await prisma.asset.create({
      data: {
        id: nullAssetId,
        ownerUserId: nullUserId,
        blobUrl: `https://embedding-resilience.public.blob.vercel-storage.com/${nullAssetId}.jpg`,
        pathname: `${nullAssetId}.jpg`,
        mime: 'image/jpeg',
        size: 1,
        checksumSha256: `${nullAssetId}-checksum`,
        createdAt: new Date(baseNowMs - 2 * 60 * 60 * 1000),
      },
    });
    vi.stubEnv('CRON_SECRET', 'embedding-resilience-cron-secret');
    vi.stubEnv('REPLICATE_API_TOKEN', '');

    for (const offset of [0, 60_000, 180_000]) {
      vi.setSystemTime(baseNowMs + offset);
      const response = await processEmbeddings(
        new NextRequest('http://localhost/api/cron/process-embeddings'),
      );
      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBe('30');
      expect(response.headers.get('X-Sploot-Embedding-Outcome')).toBe('provider_unavailable');
    }

    await expect(
      prisma.assetEmbedding.findUnique({
        where: { assetId: nullAssetId },
        select: { attemptCount: true, status: true, nextAttemptAt: true, terminalAt: true },
      }),
    ).resolves.toMatchObject({
      attemptCount: 3,
      status: 'failed',
      nextAttemptAt: null,
      terminalAt: new Date(baseNowMs + 180_000),
    });
    expect(providerRun).not.toHaveBeenCalled();
  }, 30_000);

  it('keeps a stale provider success from closing a newer failure interval', async () => {
    const baseNowMs = Date.UTC(2026, 6, 14, 20, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(baseNowMs);
    await seedChainAssets();

    providerRun.mockRejectedValueOnce({ status: 429 });
    await expect(scheduleChainAsset(0)).rejects.toMatchObject({ statusCode: 429 });

    let resolveOld!: (value: unknown) => void;
    const oldProbe = new Promise<unknown>((resolve) => { resolveOld = resolve; });
    vi.setSystemTime(baseNowMs + 31_000);
    providerRun.mockImplementationOnce(() => oldProbe);
    const oldInvocation = scheduleChainAsset(1).catch((error) => error);
    await vi.waitFor(() => expect(providerRun).toHaveBeenCalledTimes(2));

    vi.setSystemTime(baseNowMs + 92_000);
    providerRun.mockRejectedValueOnce({ status: 503 });
    await expect(scheduleChainAsset(2)).rejects.toMatchObject({ statusCode: 503 });
    await expect(
      prisma.embeddingProviderCircuit.findUnique({
        where: { key: 'replicate-image' },
        select: { generation: true, lastReason: true },
      }),
    ).resolves.toMatchObject({ generation: 2, lastReason: 'provider_unavailable' });

    resolveOld(Array(768).fill(0.1));
    await oldInvocation;
    await expect(
      prisma.embeddingProviderCircuit.findUnique({
        where: { key: 'replicate-image' },
        select: { generation: true, openUntil: true, lastReason: true },
      }),
    ).resolves.toMatchObject({ generation: 2, lastReason: 'provider_unavailable' });
  }, 30_000);

  it('emits one Canary interval for a cron circuit response without a generic observability duplicate', async () => {
    const nowMs = Date.UTC(2026, 6, 14, 21, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    vi.stubEnv('CRON_SECRET', 'embedding-resilience-cron-secret');
    await recordEmbeddingAdmissionFailure('global_rate', 60, nowMs);
    const response = await processEmbeddings(
      new NextRequest('http://localhost/api/cron/process-embeddings'),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('X-Sploot-Embedding-Outcome')).toBe('provider_circuit_open');
    await vi.waitFor(() => expect(reportCanaryError).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(reportCanaryError.mock.calls[0]?.[0])).not.toContain('raw');
    expect(providerRun).not.toHaveBeenCalled();
  }, 30_000);

  it('poisons repeated scheduler initialization failures without stranding failed state', async () => {
    const baseNowMs = Date.UTC(2026, 6, 14, 17, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(baseNowMs);
    await seedChainAssets();
    vi.stubEnv('REPLICATE_API_TOKEN', '');

    for (const offset of [0, 60_000, 180_000]) {
      vi.setSystemTime(baseNowMs + offset);
      await expect(scheduleChainAsset(8)).rejects.toMatchObject({ statusCode: 503 });
    }

    await expect(
      prisma.assetEmbedding.findUnique({
        where: { assetId: chainAssetIds[8] },
        select: { attemptCount: true, status: true, nextAttemptAt: true, terminalAt: true },
      }),
    ).resolves.toMatchObject({
      attemptCount: EMBEDDING_MAX_ATTEMPTS,
      status: 'failed',
      nextAttemptAt: null,
      terminalAt: new Date(baseNowMs + 180_000),
    });
  }, 30_000);

  it('defers one user asset without opening the provider circuit or touching another asset', async () => {
    await prisma.user.createMany({
      data: [
        { id: userId, email: `${userId}@example.test` },
        { id: secondUserId, email: `${secondUserId}@example.test` },
      ],
    });
    await prisma.asset.createMany({
      data: [
        { id: assetId, ownerUserId: userId, blobUrl: 'https://embedding-resilience.public.blob.vercel-storage.com/a.jpg', pathname: 'a.jpg', mime: 'image/jpeg', size: 1, checksumSha256: 'a' },
        { id: secondAssetId, ownerUserId: secondUserId, blobUrl: 'https://embedding-resilience.public.blob.vercel-storage.com/b.jpg', pathname: 'b.jpg', mime: 'image/jpeg', size: 1, checksumSha256: 'b' },
      ],
    });
    await prisma.assetEmbedding.createMany({
      data: [
        { assetId, modelName: 'pending', modelVersion: 'pending', dim: 0, status: 'pending' },
        { assetId: secondAssetId, modelName: 'pending', modelVersion: 'pending', dim: 0, status: 'pending' },
      ],
    });

    const nowMs = Date.UTC(2026, 6, 14, 12, 0, 0);
    await deferEmbeddingAdmission(assetId, 'user throttled', 'user_rate', 60, nowMs);
    const deferred = await prisma.assetEmbedding.findUnique({ where: { assetId } });
    const untouched = await prisma.assetEmbedding.findUnique({ where: { assetId: secondAssetId } });

    expect(deferred?.nextAttemptAt).toEqual(new Date(nowMs + 60_000));
    expect(untouched?.nextAttemptAt).toBeNull();
    expect((await getEmbeddingProviderCircuit(nowMs)).open).toBe(false);
  }, 30_000);

  it('quarantines a fresh terminal row against immediate owner retry without touching state', async () => {
    const nowMs = Date.UTC(2026, 6, 15, 8, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    await seedTerminalChainAsset(3, nowMs - 60_000);
    authUser.current = chainUserIds[3];

    const response = await postGenerateEmbedding(3);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      status: 'terminal_quarantine',
      retryAfter: EMBEDDING_TERMINAL_REVIVE_QUARANTINE_SECONDS - 60,
    });
    expect(response.headers.get('Retry-After')).toBe(
      String(EMBEDDING_TERMINAL_REVIVE_QUARANTINE_SECONDS - 60)
    );
    await expect(
      prisma.assetEmbedding.findUnique({
        where: { assetId: chainAssetIds[3] },
        select: { status: true, attemptCount: true, terminalAt: true },
      })
    ).resolves.toMatchObject({
      status: 'failed',
      attemptCount: EMBEDDING_MAX_ATTEMPTS,
      terminalAt: new Date(nowMs - 60_000),
    });
    expect(providerRun).not.toHaveBeenCalled();
  }, 30_000);

  it('refuses terminal revival for a non-owner without touching state', async () => {
    const nowMs = Date.UTC(2026, 6, 15, 9, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    await seedTerminalChainAsset(
      3,
      nowMs - EMBEDDING_TERMINAL_REVIVE_QUARANTINE_SECONDS * 1000
    );
    authUser.current = chainUserIds[0];

    const response = await postGenerateEmbedding(3);

    expect(response.status).toBe(404);
    await expect(
      prisma.assetEmbedding.findUnique({
        where: { assetId: chainAssetIds[3] },
        select: { status: true, attemptCount: true, terminalAt: true },
      })
    ).resolves.toMatchObject({
      status: 'failed',
      attemptCount: EMBEDDING_MAX_ATTEMPTS,
      terminalAt: new Date(nowMs - EMBEDDING_TERMINAL_REVIVE_QUARANTINE_SECONDS * 1000),
    });
    expect(providerRun).not.toHaveBeenCalled();
  }, 30_000);

  it('revives a quarantine-expired terminal row through the full admission boundary', async () => {
    const nowMs = Date.UTC(2026, 6, 15, 10, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    await seedTerminalChainAsset(
      3,
      nowMs - EMBEDDING_TERMINAL_REVIVE_QUARANTINE_SECONDS * 1000
    );
    authUser.current = chainUserIds[3];
    providerRun.mockResolvedValueOnce(Array(768).fill(0.1));

    const response = await postGenerateEmbedding(3);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      revived: true,
    });
    await expect(
      prisma.assetEmbedding.findUnique({
        where: { assetId: chainAssetIds[3] },
        select: { status: true, attemptCount: true, terminalAt: true, nextAttemptAt: true },
      })
    ).resolves.toMatchObject({
      status: 'ready',
      attemptCount: 0,
      terminalAt: null,
      nextAttemptAt: null,
    });
    // The revived attempt went through the paid admission boundary: one
    // provider call, minute/daily accounting spent, lease released.
    expect(providerRun).toHaveBeenCalledTimes(1);
    const windowId = Math.floor(Date.now() / 60_000);
    await expect(
      prisma.embeddingRateBucket.findUnique({
        where: { key: `embedding:rate:global:${windowId}` },
        select: { count: true },
      })
    ).resolves.toMatchObject({ count: 1 });
    await expect(
      prisma.embeddingRateLease.count({ where: { userId: chainUserIds[3] } })
    ).resolves.toBe(0);
    expect((await getEmbeddingProviderCircuit(Date.now())).open).toBe(false);
  }, 30_000);

  it('grants a revived row exactly one fresh bounded attempt cycle before re-poisoning', async () => {
    const baseNowMs = Date.UTC(2026, 6, 15, 14, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(baseNowMs);
    await seedTerminalChainAsset(
      3,
      baseNowMs - EMBEDDING_TERMINAL_REVIVE_QUARANTINE_SECONDS * 1000
    );
    authUser.current = chainUserIds[3];
    providerRun.mockRejectedValue({ status: 500 });

    for (const offset of [0, 60_000, 180_000]) {
      vi.setSystemTime(baseNowMs + offset);
      const response = await postGenerateEmbedding(3);
      expect(response.status).toBe(503);
    }

    await expect(
      prisma.assetEmbedding.findUnique({
        where: { assetId: chainAssetIds[3] },
        select: { status: true, attemptCount: true, nextAttemptAt: true, terminalAt: true },
      })
    ).resolves.toMatchObject({
      status: 'failed',
      attemptCount: EMBEDDING_MAX_ATTEMPTS,
      nextAttemptAt: null,
      terminalAt: new Date(baseNowMs + 180_000),
    });
    expect(providerRun).toHaveBeenCalledTimes(3);

    // The re-poisoned row is quarantined again — no unbounded paid loop.
    vi.setSystemTime(baseNowMs + 240_000);
    const quarantined = await postGenerateEmbedding(3);
    expect(quarantined.status).toBe(429);
    await expect(quarantined.json()).resolves.toMatchObject({
      status: 'terminal_quarantine',
      retryAfter: EMBEDDING_TERMINAL_REVIVE_QUARANTINE_SECONDS - 60,
    });
    expect(providerRun).toHaveBeenCalledTimes(3);
  }, 30_000);

  it('persists exponential retry timestamps and an exact terminal poison timestamp', async () => {
    const baseNowMs = Date.UTC(2026, 6, 15, 12, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(baseNowMs);
    await seedChainAssets();
    providerRun.mockRejectedValue({ status: 500 });

    let nowMs = baseNowMs;
    for (let attempt = 0; attempt < EMBEDDING_MAX_ATTEMPTS; attempt += 1) {
      vi.setSystemTime(nowMs);
      await expect(scheduleChainAsset(6)).rejects.toMatchObject({
        statusCode: 503,
        cause: expect.objectContaining({ name: 'EmbeddingProviderUnavailableError' }),
      });
      if (attempt === 0) nowMs = baseNowMs + 60_000;
      if (attempt === 1) nowMs = baseNowMs + 180_000;
    }

    const row = await prisma.assetEmbedding.findUnique({ where: { assetId: chainAssetIds[6] } });
    expect(row).toMatchObject({
      status: 'failed',
      attemptCount: EMBEDDING_MAX_ATTEMPTS,
      error: 'Embedding image failed: provider returned HTTP 500',
      nextAttemptAt: null,
      terminalAt: new Date(baseNowMs + 180_000),
    });
    expect((await getEmbeddingProviderCircuit(baseNowMs + 180_000)).open).toBe(true);
    expect(providerRun).toHaveBeenCalledTimes(3);
  }, 30_000);
});
