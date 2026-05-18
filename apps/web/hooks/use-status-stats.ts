'use client';

import { useEffect, useState } from 'react';
import { getEmbeddingQueueManager } from '@/lib/embedding-queue';

interface StatusStats {
  assetCount: number;
  storageUsed: number;
  storageLimit: number;
  storageRemaining: number;
  lastUploadTime: Date | null;
  queueDepth: number;
}

/**
 * Hook to fetch and maintain status line statistics
 * Default cadence: 5s when queue active, 30s when idle
 */
export function useStatusStats(): StatusStats {
  const [stats, setStats] = useState<StatusStats>({
    assetCount: 0,
    storageUsed: 0,
    storageLimit: 0,
    storageRemaining: 0,
    lastUploadTime: null,
    queueDepth: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats');
        if (!response.ok) return;

        const data = await response.json();
        const assetCount = data.assetCount ?? 0;
        const storageUsed = data.storageBytes ?? 0;
        const storageLimit = data.storageLimitBytes ?? 0;
        const storageRemaining = data.storageRemainingBytes ?? Math.max(0, storageLimit - storageUsed);
        const lastUploadTime = data.lastUploadAt ? new Date(data.lastUploadAt) : null;

        // Get queue depth
        const queueManager = getEmbeddingQueueManager();
        const status = queueManager.getStatus();
        const queueDepth = status.queued + status.processing;

        setStats({
          assetCount,
          storageUsed,
          storageLimit,
          storageRemaining,
          lastUploadTime,
          queueDepth,
        });
      } catch (error) {
        console.error('Failed to fetch status stats:', error);
      }
    };

    // Initial fetch
    fetchStats();

    // Set up polling - use queue depth to determine interval
    const getInterval = () => {
      const queueManager = getEmbeddingQueueManager();
      const status = queueManager.getStatus();
      const queueDepth = status.queued + status.processing;
      return queueDepth > 0 ? 5000 : 30000; // 5s when active, 30s when idle
    };

    let intervalId: NodeJS.Timeout;
    const setupInterval = () => {
      intervalId = setInterval(() => {
        fetchStats();
        // Re-setup interval with new timing if queue state changed
        clearInterval(intervalId);
        setupInterval();
      }, getInterval());
    };

    setupInterval();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return stats;
}
