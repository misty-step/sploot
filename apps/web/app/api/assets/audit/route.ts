import { NextRequest, NextResponse } from 'next/server';
import { requireUserIdWithSync } from '@/lib/auth/server';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';

interface AuditResult {
  id: string;
  blobUrl: string;
  filename: string;
  size: number;
  createdAt: string;
  status: 'valid' | 'broken' | 'error';
  statusCode?: number;
  error?: string;
}

interface AuditSummary {
  total: number;
  valid: AuditResult[];
  broken: AuditResult[];
  errors: AuditResult[];
  summary: {
    validCount: number;
    brokenCount: number;
    errorCount: number;
    percentValid: number;
  };
}

/**
 * Audit endpoint to validate blob URLs for all assets
 * GET /api/assets/audit
 *
 * Returns JSON with lists of valid, broken (404/403), and error assets
 * Uses HEAD requests to minimize bandwidth usage
 */
async function getHandler(req: NextRequest) {
  try {
    const userId = await requireUserIdWithSync();

    if (!prisma) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 503 }
      );
    }

    // Fetch all assets for the user
    const assets = await prisma.asset.findMany({
      where: {
        ownerUserId: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        blobUrl: true,
        pathname: true,
        size: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const valid: AuditResult[] = [];
    const broken: AuditResult[] = [];
    const errors: AuditResult[] = [];

    // Validate each blob URL with HEAD request
    for (const asset of assets) {
      const result: AuditResult = {
        id: asset.id,
        blobUrl: asset.blobUrl,
        filename: asset.pathname.split('/').pop() || asset.pathname,
        size: asset.size,
        createdAt: asset.createdAt.toISOString(),
        status: 'valid',
      };

      try {
        // Use HEAD request to check if blob exists without downloading
        const response = await fetch(asset.blobUrl, {
          method: 'HEAD',
          // Set timeout to avoid hanging on dead URLs
          signal: AbortSignal.timeout(5000),
        });

        result.statusCode = response.status;

        if (response.ok) {
          result.status = 'valid';
          valid.push(result);
        } else {
          // 404 (Not Found), 403 (Forbidden), or other error status
          result.status = 'broken';
          broken.push(result);
        }
      } catch (err) {
        // Network error, timeout, or other fetch failure
        result.status = 'error';
        result.error = err instanceof Error ? err.message : 'Unknown error';
        errors.push(result);
      }
    }

    const summary: AuditSummary = {
      total: assets.length,
      valid,
      broken,
      errors,
      summary: {
        validCount: valid.length,
        brokenCount: broken.length,
        errorCount: errors.length,
        percentValid: assets.length > 0
          ? Math.round((valid.length / assets.length) * 100)
          : 100,
      },
    };

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    logError('assets:audit-failed', error);
    return NextResponse.json(
      {
        error: 'Failed to audit assets',
        // Only include error details in development for debugging
        details: process.env.NODE_ENV === 'development'
          ? (error instanceof Error ? error.message : 'Unknown error')
          : undefined,
      },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, { operation: 'assets:audit' });
