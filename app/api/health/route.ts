import { NextRequest, NextResponse } from 'next/server';
import { withObservability } from '@/lib/with-observability';
import { prisma } from '@/lib/db';
import * as Sentry from '@sentry/nextjs';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: {
      status: 'pass' | 'fail';
      message?: string;
      responseTime?: number;
    };
    sentry: {
      status: 'pass' | 'fail';
      message?: string;
    };
  };
}

async function getHandler(_req: NextRequest) {
  const timestamp = new Date().toISOString();
  const result: HealthCheckResult = {
    status: 'healthy',
    timestamp,
    checks: {
      database: { status: 'fail' },
      sentry: { status: 'fail' },
    },
  };

  // Check database connectivity
  try {
    if (!prisma) {
      result.checks.database = {
        status: 'fail',
        message: 'Prisma client not initialized',
      };
      result.status = 'unhealthy';
    } else {
      const startTime = Date.now();
      await prisma.$queryRaw`SELECT 1 as health_check`;
      const responseTime = Date.now() - startTime;

      result.checks.database = {
        status: 'pass',
        message: 'Database connection successful',
        responseTime,
      };
    }
  } catch (error) {
    result.checks.database = {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
    result.status = 'unhealthy';
  }

  // Check Sentry reporting
  try {
    const sentryEnabled = process.env.NODE_ENV === 'production' ||
                          process.env.SENTRY_ENVIRONMENT === 'production';

    if (sentryEnabled) {
      // In production, check if DSN is configured
      const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
      if (dsn) {
        result.checks.sentry = {
          status: 'pass',
          message: 'Sentry DSN configured',
        };
      } else {
        result.checks.sentry = {
          status: 'fail',
          message: 'Sentry DSN not configured',
        };
        result.status = 'degraded';
      }
    } else {
      // In development, verify Sentry is available
      if (Sentry) {
        result.checks.sentry = {
          status: 'pass',
          message: 'Sentry SDK loaded (disabled in development)',
        };
      }
    }
  } catch (error) {
    result.checks.sentry = {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Sentry check failed',
    };
    result.status = 'degraded';
  }

  // Return appropriate HTTP status code
  const statusCode = result.status === 'healthy' ? 200 :
                      result.status === 'degraded' ? 200 : 503;

  return NextResponse.json(result, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  });
}

async function headHandler(_req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  });
}

export const GET = withObservability(getHandler, {
  operation: 'health:check',
  skipTiming: true,
});

export const HEAD = withObservability(headHandler, {
  operation: 'health:ping-head',
  skipTiming: true,
  skipLogging: true,
});
