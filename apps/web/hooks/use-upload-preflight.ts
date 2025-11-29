'use client';

import { useState, useCallback } from 'react';
import { calculateSHA256, checkDuplicate } from '@/lib/checksum';

export interface PreflightResult {
  isDuplicate: boolean;
  existingAsset?: {
    id: string;
    blobUrl: string;
    thumbnailUrl?: string;
    pathname: string;
    mime: string;
    size: number;
    checksumSha256: string;
    hasEmbedding: boolean;
    createdAt: Date;
  };
  checksum?: string;
}

interface UseUploadPreflightOptions {
  onDuplicateFound?: (asset: PreflightResult['existingAsset']) => void;
  onCheckComplete?: (result: PreflightResult) => void;
  skipPreflight?: boolean;
}

export function useUploadPreflight(options: UseUploadPreflightOptions = {}) {
  const [checking, setChecking] = useState(false);
  const [checksumProgress, setChecksumProgress] = useState(0);

  const performPreflightCheck = useCallback(async (file: File): Promise<PreflightResult> => {
    if (options.skipPreflight) {
      return { isDuplicate: false };
    }

    setChecking(true);
    setChecksumProgress(0);

    try {
      // Calculate checksum
      const checksum = await calculateSHA256(file);
      setChecksumProgress(100);

      // Check for duplicate
      const result = await checkDuplicate(file);

      const preflightResult: PreflightResult = {
        isDuplicate: result.exists,
        existingAsset: result.asset,
        checksum,
      };

      // Call callbacks
      if (result.exists && result.asset && options.onDuplicateFound) {
        options.onDuplicateFound(result.asset);
      }

      if (options.onCheckComplete) {
        options.onCheckComplete(preflightResult);
      }

      return preflightResult;
    } catch (error) {
      console.error('Preflight check error:', error);
      // On error, proceed with upload
      return { isDuplicate: false };
    } finally {
      setChecking(false);
      setChecksumProgress(0);
    }
  }, [options.skipPreflight, options.onDuplicateFound, options.onCheckComplete]);

  const performBatchPreflightCheck = useCallback(async (
    files: File[]
  ): Promise<Map<File, PreflightResult>> => {
    const results = new Map<File, PreflightResult>();

    // Process files in parallel for better performance
    const promises = files.map(async (file) => {
      const result = await performPreflightCheck(file);
      results.set(file, result);
      return { file, result };
    });

    await Promise.all(promises);
    return results;
  }, [performPreflightCheck]);

  return {
    performPreflightCheck,
    performBatchPreflightCheck,
    checking,
    checksumProgress,
  };
}