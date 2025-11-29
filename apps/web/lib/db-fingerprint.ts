import crypto from 'crypto';

function migrationHash(): string {
  // hash of migration folder names for quick drift detection
  try {
    const { readdirSync } = require('fs');
    const dirs: string[] = readdirSync('prisma/migrations', { withFileTypes: true })
      .filter((d: any) => d.isDirectory())
      .map((d: any) => d.name)
      .sort();
    const hash = crypto.createHash('sha256').update(dirs.join('|')).digest('hex');
    return hash.slice(0, 12);
  } catch {
    return 'unknown';
  }
}

export function getDbFingerprint(envUrl = process.env.DATABASE_URL): { host: string | null; hash: string } {
  if (!envUrl) return { host: null, hash: migrationHash() };
  try {
    const u = new URL(envUrl);
    return { host: u.hostname, hash: migrationHash() };
  } catch {
    return { host: null, hash: migrationHash() };
  }
}

export async function assertDbFingerprint(expectedHost: string | null) {
  const fp = getDbFingerprint();
  if (expectedHost && fp.host && fp.host !== expectedHost) {
    const err = new Error(`DB host mismatch: expected ${expectedHost}, got ${fp.host}`);
    // capture but don’t block entirely if prisma isn’t ready
    try {
      const { logger } = await import('./observability-logger');
      logger.logError('db:fingerprint-mismatch', err, { expectedHost, actualHost: fp.host, migrationHash: fp.hash });
    } catch {}
    throw err;
  }
  return fp;
}

