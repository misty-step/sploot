import { NextRequest, NextResponse } from 'next/server';
import { clerkConfigured, blobConfigured, databaseConfigured, replicateConfigured } from '@/lib/env';
import { prisma } from '@/lib/db';
import { currentUser } from '@clerk/nextjs/server';
import { withObservability } from '@/lib/with-observability';

/**
 * Service health check endpoint
 * Provides detailed status of all external services
 */
async function getHandler(req: NextRequest) {
  const services: Record<string, {
    name: string;
    status: 'healthy' | 'degraded' | 'unavailable' | 'not_configured';
    configured: boolean;
    message?: string;
    details?: any;
  }> = {};

  // Check Clerk Authentication
  try {
    if (clerkConfigured) {
      const user = await currentUser();
      services.clerk = {
        name: 'Authentication (Clerk)',
        status: user ? 'healthy' : 'degraded',
        configured: true,
        message: user ? `Authenticated as ${user.emailAddresses[0]?.emailAddress}` : 'No active session',
      };
    } else {
      services.clerk = {
        name: 'Authentication (Clerk)',
        status: 'not_configured',
        configured: false,
        message: 'Missing CLERK_SECRET_KEY',
      };
    }
  } catch (error) {
    services.clerk = {
      name: 'Authentication (Clerk)',
      status: 'unavailable',
      configured: clerkConfigured,
      message: 'Error checking authentication status',
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    };
  }

  // Check Database (Postgres with pgvector)
  try {
    if (databaseConfigured && prisma) {
      // Attempt a simple query to test connectivity
      await prisma.$queryRaw`SELECT 1`;

      // Check if pgvector extension is installed
      const extensions = await prisma.$queryRaw`
        SELECT extname FROM pg_extension WHERE extname = 'vector'
      ` as any[];

      const hasPgVector = extensions.length > 0;

      services.database = {
        name: 'Database (Postgres)',
        status: hasPgVector ? 'healthy' : 'degraded',
        configured: true,
        message: hasPgVector ? 'Connected with pgvector' : 'Connected but pgvector extension missing',
        details: {
          pgvector: hasPgVector,
        }
      };
    } else {
      services.database = {
        name: 'Database (Postgres)',
        status: 'not_configured',
        configured: false,
        message: 'Missing POSTGRES_URL',
      };
    }
  } catch (error) {
    services.database = {
      name: 'Database (Postgres)',
      status: 'unavailable',
      configured: databaseConfigured,
      message: 'Cannot connect to database',
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    };
  }

  // Check Blob Storage
  try {
    if (blobConfigured) {
      // We can't directly test Vercel Blob without making an API call
      // So we'll just check if the token exists and is not a placeholder
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      const isValidToken = token && token.startsWith('vercel_blob_');

      services.blobStorage = {
        name: 'Storage (Vercel Blob)',
        status: isValidToken ? 'healthy' : 'degraded',
        configured: true,
        message: isValidToken ? 'Token configured' : 'Invalid token format',
      };
    } else {
      services.blobStorage = {
        name: 'Storage (Vercel Blob)',
        status: 'not_configured',
        configured: false,
        message: 'Missing BLOB_READ_WRITE_TOKEN',
      };
    }
  } catch (error) {
    services.blobStorage = {
      name: 'Storage (Vercel Blob)',
      status: 'unavailable',
      configured: blobConfigured,
      message: 'Error checking storage status',
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    };
  }

  // Check Replicate (Embeddings API)
  try {
    if (replicateConfigured) {
      const token = process.env.REPLICATE_API_TOKEN;
      const isValidToken = token && token.startsWith('r8_');

      services.embeddings = {
        name: 'Embeddings (Replicate)',
        status: isValidToken ? 'healthy' : 'degraded',
        configured: true,
        message: isValidToken ? 'API token configured' : 'Invalid token format',
      };
    } else {
      services.embeddings = {
        name: 'Embeddings (Replicate)',
        status: 'not_configured',
        configured: false,
        message: 'Missing REPLICATE_API_TOKEN',
      };
    }
  } catch (error) {
    services.embeddings = {
      name: 'Embeddings (Replicate)',
      status: 'unavailable',
      configured: replicateConfigured,
      message: 'Error checking embeddings status',
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    };
  }

  // Calculate overall health
  const statuses = Object.values(services).map(s => s.status);
  const overallHealth = statuses.every(s => s === 'healthy') ? 'healthy' :
                        statuses.some(s => s === 'unavailable') ? 'unhealthy' :
                        statuses.some(s => s === 'degraded' || s === 'not_configured') ? 'degraded' :
                        'healthy';

  // Check if all required services are configured
  const allConfigured = clerkConfigured && blobConfigured && databaseConfigured && replicateConfigured;

  return NextResponse.json({
    status: overallHealth,
    allServicesConfigured: allConfigured,
    timestamp: new Date().toISOString(),
    services,
    readiness: {
      canAuthenticate: services.clerk?.status === 'healthy',
      canUpload: services.blobStorage?.status === 'healthy',
      canStore: services.database?.status === 'healthy',
      canSearch: services.embeddings?.status === 'healthy' && services.database?.status === 'healthy',
    },
    message: allConfigured
      ? 'All services configured'
      : 'Some services are not configured. Check individual service status.'
  });
}

// OPTIONS for CORS preflight
async function optionsHandler(req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export const GET = withObservability(getHandler, { operation: 'health:services' });

export const OPTIONS = withObservability(optionsHandler, {
  operation: 'health:services-options',
  skipTiming: true,
  skipLogging: true,
});
