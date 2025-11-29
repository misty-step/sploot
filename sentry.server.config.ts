import * as Sentry from '@sentry/nextjs';
import { Prisma } from '@prisma/client';
import { createSentryOptions } from './lib/sentry';

const options = createSentryOptions('server');

Sentry.init(options);

// Add global Prisma/database configuration context to all Sentry events
// This helps diagnose database connection issues in production
Sentry.setContext('database', {
  database_url_configured: !!process.env.DATABASE_URL,
  vercel_env: process.env.VERCEL_ENV || 'unknown',
  node_version: process.version,
  platform: process.platform,
  prisma_version: Prisma.prismaVersion?.client || 'unknown',
});
