/**
 * SSE Broadcaster Utility
 *
 * Manages active Server-Sent Events connections and broadcasts embedding updates
 * to connected clients. Extracted from API route to comply with Next.js 15
 * route export constraints.
 */

// Store active connections for cleanup
const activeConnections = new Map<string, Set<ReadableStreamDefaultController>>();

/**
 * Get the active connections map
 * Used by the SSE route to manage connections
 */
export function getActiveConnections() {
  return activeConnections;
}

/**
 * Broadcast an embedding update to all connected clients for a user
 * This can be called from other API routes when embeddings are updated
 */
export async function broadcastEmbeddingUpdate(
  userId: string,
  assetId: string,
  status: {
    status: 'pending' | 'processing' | 'ready' | 'failed';
    error?: string;
    modelName?: string;
    hasEmbedding?: boolean;
  }
) {
  const encoder = new TextEncoder();
  const userConnections = activeConnections.get(userId);

  if (!userConnections || userConnections.size === 0) {
    return;
  }

  const message = encoder.encode(`event: embedding-update\ndata: ${JSON.stringify({
    type: 'embedding-update',
    assetId,
    ...status,
    timestamp: Date.now(),
  })}\n\n`);

  // Send to all active connections for this user
  for (const controller of userConnections) {
    try {
      controller.enqueue(message);
    } catch (error) {
      // Connection might be closed, remove it
      userConnections.delete(controller);
      console.error('[SSE] Failed to send update to connection:', error);
    }
  }
}

/**
 * Clean up connections for a user
 */
export function cleanupUserConnections(userId: string) {
  activeConnections.delete(userId);
}

/**
 * Add a connection for a user
 */
export function addConnection(userId: string, controller: ReadableStreamDefaultController) {
  if (!activeConnections.has(userId)) {
    activeConnections.set(userId, new Set());
  }
  activeConnections.get(userId)!.add(controller);
}

/**
 * Remove a connection for a user
 */
export function removeConnection(userId: string, controller: ReadableStreamDefaultController) {
  const userConnections = activeConnections.get(userId);
  if (userConnections) {
    userConnections.delete(controller);
    if (userConnections.size === 0) {
      activeConnections.delete(userId);
    }
  }
}