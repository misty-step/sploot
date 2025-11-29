/**
 * Environment variable configuration checks
 *
 * IMPORTANT: This file ONLY checks if env vars are present.
 * It does NOT mutate environment variables at runtime.
 *
 * Historical note (2025-11-25): We previously tried sanitizing POSTGRES_URL
 * at runtime, but that runs in Node.js AFTER Prisma's Rust engine already
 * reads env vars. Runtime sanitization cannot fix what Prisma sees.
 *
 * Solution: Set DATABASE_URL correctly at deployment time (Vercel env vars).
 */

const PLACEHOLDER_MARKERS = [
  'your_actual_key',
  'your_actual_secret',
  'your_blob_token',
  'your_postgres_url',
  'your_replicate_token',
  'your_replicate_token_here',
];

function isValueMissing(value: string | undefined | null) {
  if (!value) return true;
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some(marker => lower.includes(marker));
}

// Check if required environment variables are configured
const hasClerkConfig = !isValueMissing(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  !isValueMissing(process.env.CLERK_SECRET_KEY);
const hasBlobConfig = !isValueMissing(process.env.BLOB_READ_WRITE_TOKEN);
const hasDatabaseConfig = !isValueMissing(process.env.DATABASE_URL);
const hasReplicateConfig = !isValueMissing(process.env.REPLICATE_API_TOKEN);

export const databaseConfigured = hasDatabaseConfig;
export const blobConfigured = hasBlobConfig;
export const clerkConfigured = hasClerkConfig;
export const replicateConfigured = hasReplicateConfig;
