/**
 * Server-Sent Events (SSE) endpoint for real-time embedding updates
 *
 * This replaces WebSocket functionality for Vercel deployment compatibility.
 * SSE provides server-to-client real-time communication which is perfect
 * for embedding status updates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { addConnection, removeConnection } from '@/lib/sse-broadcaster';
import { withObservability } from '@/lib/with-observability';

// Connection configuration
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const MAX_RETRY_TIME = 5000; // 5 seconds retry for client

export const runtime = 'nodejs'; // Use Node.js runtime for SSE
export const dynamic = 'force-dynamic'; // Disable caching

/**
 * SSE endpoint for embedding updates
 * GET /api/sse/embedding-updates?assetIds=id1,id2,id3
 */
async function getHandler(request: NextRequest) {
  // Authenticate user
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Get asset IDs from query params
  const searchParams = request.nextUrl.searchParams;
  const assetIds = searchParams.get('assetIds')?.split(',').filter(Boolean) || [];

  // Create SSE stream
  const encoder = new TextEncoder();
  const customReadable = new ReadableStream({
    async start(controller) {
      // Add to active connections
      addConnection(userId, controller);

      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({
          type: 'connected',
          timestamp: Date.now()
        })}\nretry: ${MAX_RETRY_TIME}\n\n`)
      );

      // Set up heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`:heartbeat ${Date.now()}\n\n`)
          );
        } catch (error) {
          // Connection closed, clean up
          clearInterval(heartbeatInterval);
        }
      }, HEARTBEAT_INTERVAL);

      // If specific assets requested, send their current status
      if (assetIds.length > 0 && prisma) {
        try {
          const assets = await prisma.asset.findMany({
            where: {
              id: { in: assetIds },
              ownerUserId: userId,
            },
            include: {
              embedding: {
                select: {
                  assetId: true,
                  modelName: true,
                  status: true,
                  error: true,
                  createdAt: true,
                  completedAt: true,
                }
              }
            }
          });

          for (const asset of assets) {
            const embedding = asset.embedding;
            const status = embedding ? {
              status: embedding.status || 'pending',
              error: embedding.error,
              modelName: embedding.modelName,
              hasEmbedding: !!embedding.completedAt,
            } : {
              status: 'pending',
              hasEmbedding: false,
            };

            controller.enqueue(
              encoder.encode(`event: embedding-update\ndata: ${JSON.stringify({
                type: 'embedding-update',
                assetId: asset.id,
                ...status,
                timestamp: Date.now(),
              })}\n\n`)
            );
          }
        } catch (error) {
          console.error('[SSE] Error fetching initial status:', error);
        }
      }

      // Set up database polling for updates (since we can't use LISTEN/NOTIFY in serverless)
      let lastCheck = new Date();
      const pollInterval = setInterval(async () => {
        if (!prisma) return;

        try {
          // Check for new embedding updates
          const updatedEmbeddings = await prisma.assetEmbedding.findMany({
            where: {
              asset: {
                ownerUserId: userId,
                id: assetIds.length > 0 ? { in: assetIds } : undefined,
              },
              updatedAt: {
                gt: lastCheck,
              },
            },
            include: {
              asset: {
                select: {
                  id: true,
                }
              }
            },
            orderBy: {
              updatedAt: 'desc',
            },
            take: 10, // Limit to prevent overwhelming
          });

          lastCheck = new Date();

          for (const embedding of updatedEmbeddings) {
            controller.enqueue(
              encoder.encode(`event: embedding-update\ndata: ${JSON.stringify({
                type: 'embedding-update',
                assetId: embedding.assetId,
                status: embedding.status || 'processing',
                error: embedding.error,
                modelName: embedding.modelName,
                hasEmbedding: !!embedding.completedAt,
                timestamp: Date.now(),
              })}\n\n`)
            );
          }
        } catch (error) {
          console.error('[SSE] Polling error:', error);
          // Don't close the connection on polling errors
        }
      }, 2000); // Poll every 2 seconds

      // Clean up on close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
        clearInterval(pollInterval);

        // Remove from active connections
        removeConnection(userId, controller);
      });
    },
  });

  // Return SSE response with proper headers
  return new NextResponse(customReadable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export const GET = withObservability(getHandler, {
  operation: 'sse:embedding-updates',
  skipTiming: true,
  skipLogging: true,
});

// broadcastEmbeddingUpdate function has been moved to @/lib/sse-broadcaster
// to comply with Next.js 15 route export constraints
