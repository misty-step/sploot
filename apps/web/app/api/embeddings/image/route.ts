import { NextRequest, NextResponse } from 'next/server';
import { createEmbeddingService, EmbeddingAdmissionError, EmbeddingError } from '@/lib/embeddings';
import {
  embeddingConfigurationHeaders,
  embeddingRetryAfterHeader,
  embeddingRetryHeaders,
  EmbeddingProviderCircuitOpenError,
  EmbeddingProviderUnavailableError,
  EmbeddingConfigurationError,
  reportEmbeddingConfigurationErrorOnce,
} from '@/lib/embedding-errors';
import { prisma, upsertAssetEmbedding } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import type { AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';
import { resolveEmbeddingMediaSource } from '@/lib/embedding-media';
import {
  acquireEmbeddingProcessing,
  markEmbeddingTerminalSkipped,
  resolveEmbeddingGateState,
} from '@/lib/embedding-guard';
import {
  deferEmbeddingAdmission,
  recordEmbeddingConfigurationFailure,
  getEmbeddingAdmissionReason,
  getEmbeddingProviderCircuit,
  isEmbeddingAdmissionFailure,
  recordEmbeddingAttemptFailure,
  reviveTerminalEmbedding,
} from '@/lib/embedding-resilience';
import {
  assertEnrolledUser,
  enrollmentDeniedResponse,
  enrollmentUnavailableResponse,
  isEnrollmentDeniedError,
  isEnrollmentUnavailableError,
} from '@/lib/enrollment/enrollment-policy';

interface EmbeddingResponse {
  status: number;
  body: Record<string, unknown>;
  headers?: HeadersInit;
}

const inFlightRequests = new Map<string, Promise<EmbeddingResponse>>();

async function postHandler(req: NextRequest, _context: unknown, { principal }: AuthenticatedApiContext) {
  try {
    const userId = principal.userId;

    await assertEnrolledUser(userId, prisma);

    const body = await req.json();
    const { imageUrl, assetId } = body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid imageUrl parameter' },
        { status: 400 }
      );
    }

    let asset: {
      id: string;
      blobUrl: string;
      thumbnailUrl: string | null;
      mime: string;
      checksumSha256: string;
      embedding: {
        modelName: string;
        dim: number;
        createdAt: Date;
        status: string | null;
        updatedAt: Date;
        completedAt: Date | null;
        nextAttemptAt: Date | null;
        terminalAt: Date | null;
      } | null;
    } | null = null;
    if (assetId) {
      asset = await prisma.asset.findFirst({
        where: {
          id: assetId,
          ownerUserId: userId,
          deletedAt: null,
        },
        select: {
          id: true,
          blobUrl: true,
          thumbnailUrl: true,
          mime: true,
          checksumSha256: true,
          embedding: {
            select: {
              modelName: true,
              dim: true,
              createdAt: true,
              status: true,
              updatedAt: true,
              completedAt: true,
              nextAttemptAt: true,
              terminalAt: true,
            },
          },
        },
      });

      if (!asset) {
        return NextResponse.json(
          { error: 'Asset not found or not authorized' },
          { status: 404 }
        );
      }
    }

    const media = asset
      ? resolveEmbeddingMediaSource({
          mime: asset.mime,
          blobUrl: asset.blobUrl,
          thumbnailUrl: asset.thumbnailUrl,
        })
      : { sourceUrl: imageUrl, sourceKind: 'blob' as const };

    if (asset) {
      const gateState = resolveEmbeddingGateState(asset.embedding);
      if (gateState.state === 'ready') {
        return NextResponse.json({
          success: true,
          status: 'ready',
          alreadyExists: true,
          message: 'Embedding already exists',
          embedding: {
            modelName: asset.embedding?.modelName,
            dimension: asset.embedding?.dim,
            createdAt: asset.embedding?.createdAt,
          },
        });
      }
      if (gateState.state === 'processing') {
        const retryAfterSec = gateState.retryAfterMs
          ? Math.max(1, Math.ceil(gateState.retryAfterMs / 1000))
          : undefined;
        return NextResponse.json(
          { success: true, status: 'processing', message: 'Embedding already processing', retryAfter: retryAfterSec },
          { status: 202, headers: retryAfterSec ? { 'Retry-After': retryAfterSec.toString() } : undefined },
        );
      }
      if (gateState.state === 'cooldown') {
        const retryAfterSec = gateState.retryAfterMs
          ? Math.max(1, Math.ceil(gateState.retryAfterMs / 1000))
          : undefined;
        return NextResponse.json(
          { success: false, status: 'cooldown', error: 'Embedding recently failed, retry later', retryAfter: retryAfterSec },
          { status: 429, headers: embeddingRetryAfterHeader(retryAfterSec) },
        );
      }
    }

    if (media.sourceKind === 'unsupported') {
      if (asset) {
        const lock = await acquireEmbeddingProcessing(asset.id);
        if (lock.acquired) {
          await markEmbeddingTerminalSkipped(
            asset.id,
            'Unsupported video without a poster thumbnail',
            lock.processingClaimToken,
          );
        }
      }
      return NextResponse.json(
        {
          success: false,
          status: 'terminal_skip',
          error: 'Unsupported video without a poster thumbnail',
          reason: media.skipReason,
        },
        { status: 422 },
      );
    }

    const embeddingGate = getRuntimeGate('embeddings');
    if (!embeddingGate.enabled) {
      return runtimeGateResponse(embeddingGate);
    }

    if (!asset) {
      let embeddingService;
      try {
        embeddingService = createEmbeddingService(userId);
      } catch (error) {
        if (error instanceof EmbeddingConfigurationError) {
          reportEmbeddingConfigurationErrorOnce(error, 'embeddings:image:configuration');
        }
        throw error;
      }
      const result = await embeddingService.embedImage(media.sourceUrl);
      return NextResponse.json({
        success: true,
        embedding: result.embedding,
        model: result.model,
        dimension: result.dimension,
        processingTime: result.processingTime,
        assetId: null,
      });
    }

    const requestKey = `${userId}-${asset.id}`;
    const existingRequest = inFlightRequests.get(requestKey);
    if (existingRequest) {
      const response = await existingRequest;
      return NextResponse.json(response.body, { status: response.status, headers: response.headers });
    }

    let revivedFromTerminal = false;
    if (resolveEmbeddingGateState(asset.embedding).state === 'terminal') {
      const revive = await reviveTerminalEmbedding(asset.id);
      if (!revive.revived && revive.reason === 'quarantine') {
        return NextResponse.json(
          { success: false, status: 'terminal_quarantine', error: 'Embedding retries exhausted recently, retry later', retryAfter: revive.retryAfterSec },
          { status: 429, headers: embeddingRetryAfterHeader(revive.retryAfterSec) },
        );
      }
      if (!revive.revived && revive.reason === 'revival_exhausted') {
        return NextResponse.json(
          { success: false, status: 'terminal_failure', reason: 'revival_exhausted', error: 'Embedding recovery attempts exhausted for this asset' },
          { status: 422 },
        );
      }
      revivedFromTerminal = revive.revived;
    }

    const embeddingPromise = (async (): Promise<EmbeddingResponse> => {
      let processingClaimToken: string | undefined;
      let providerInitializationDeferred = false;
      try {
        const lock = await acquireEmbeddingProcessing(asset.id);
        if (!lock.acquired) {
          const retryAfterSec = lock.retryAfterMs
            ? Math.max(1, Math.ceil(lock.retryAfterMs / 1000))
            : undefined;
          if (lock.state === 'ready') {
            return { status: 200, body: { success: true, status: 'ready', alreadyExists: true, message: 'Embedding already exists' } };
          }
          if (lock.state === 'processing') {
            return { status: 202, headers: retryAfterSec ? { 'Retry-After': retryAfterSec.toString() } : undefined, body: { success: true, status: 'processing', message: 'Embedding already processing', retryAfter: retryAfterSec } };
          }
          if (lock.state === 'cooldown') {
            return { status: 429, headers: embeddingRetryAfterHeader(retryAfterSec), body: { success: false, status: 'cooldown', error: 'Embedding recently failed, retry later', retryAfter: retryAfterSec } };
          }
          return { status: 503, body: { success: false, error: 'Embedding lock unavailable' } };
        }
        processingClaimToken = lock.processingClaimToken;

        const providerCircuit = await getEmbeddingProviderCircuit();
        if (providerCircuit.open) throw new EmbeddingProviderCircuitOpenError(providerCircuit.retryAfterSec);

        let embeddingService;
        try {
          embeddingService = createEmbeddingService(userId);
        } catch (error) {
          if (error instanceof EmbeddingConfigurationError) {
            providerInitializationDeferred = true;
            reportEmbeddingConfigurationErrorOnce(error, 'embeddings:image:configuration');
            await recordEmbeddingConfigurationFailure(asset.id, error, processingClaimToken);
          }
          throw error;
        }

        const result = await embeddingService.embedImage(media.sourceUrl, asset.checksumSha256);
        const storedEmbedding = await upsertAssetEmbedding({
          assetId: asset.id,
          modelName: result.model,
          modelVersion: result.model,
          dim: result.dimension,
          embedding: result.embedding,
        }, processingClaimToken);
        if (!storedEmbedding) return { status: 409, body: { error: 'Embedding state changed; retry the request' } };
        return {
          status: 200,
          body: {
            success: true,
            embedding: result.embedding,
            model: result.model,
            dimension: result.dimension,
            processingTime: result.processingTime,
            assetId: asset.id,
            ...(revivedFromTerminal ? { revived: true } : {}),
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof EmbeddingProviderCircuitOpenError) {
          await deferEmbeddingAdmission(asset.id, message, 'provider_circuit_open', error.retryAfterSec, processingClaimToken);
        } else if (isEmbeddingAdmissionFailure(error)) {
          await deferEmbeddingAdmission(asset.id, message, getEmbeddingAdmissionReason(error) ?? 'limiter_unavailable', error.retryAfterSec, processingClaimToken);
        } else if (!providerInitializationDeferred && processingClaimToken) {
          await recordEmbeddingAttemptFailure(asset.id, message, processingClaimToken);
        }
        throw error;
      } finally {
        setTimeout(() => inFlightRequests.delete(requestKey), 100);
      }
    })();
    inFlightRequests.set(requestKey, embeddingPromise);
    const response = await embeddingPromise;
    return NextResponse.json(response.body, { status: response.status, headers: response.headers });

  } catch (error) {
    if (isEnrollmentDeniedError(error)) return enrollmentDeniedResponse();
    // EmbeddingAdmissionError(limiter_unavailable) carries the shared
    // enrollment_unavailable code but keeps its typed Retry-After contract
    // below; only genuine enrollment failures take this path.
    if (isEnrollmentUnavailableError(error) && !(error instanceof EmbeddingAdmissionError)) {
      return enrollmentUnavailableResponse();
    }
    // Error generating image embedding

    if (
      error instanceof EmbeddingError
      || error instanceof EmbeddingProviderCircuitOpenError
      || error instanceof EmbeddingProviderUnavailableError
      || error instanceof EmbeddingConfigurationError
    ) {
      return NextResponse.json(
        { error: error.message, ...(error instanceof EmbeddingAdmissionError && error.code ? { code: error.code } : {}) },
        {
          status: error.statusCode || 500,
          headers: error instanceof EmbeddingConfigurationError
            ? embeddingConfigurationHeaders(error)
            : embeddingRetryHeaders(error),
        }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate image embedding' },
      { status: 500 }
    );
  }
}

export const POST = withObservability(withAuthenticatedApi(postHandler), { operation: 'embeddings:image' });
