const PLACEHOLDER_MARKERS = [
  'your_actual_key',
  'your_actual_secret',
  'your_blob_token',
  'your_postgres_url',
  'your_postgres_url_non_pooling',
  'your_replicate_token',
  'your_replicate_token_here',
];

function sanitizePostgresUrl(raw: string | undefined | null) {
  if (!raw) return raw;

  try {
    const url = new URL(raw);
    const channelBinding = url.searchParams.get('channel_binding');

    // Neon pooler (pgbouncer) rejects channel binding; keep users online by stripping it
    if (channelBinding && channelBinding.toLowerCase() === 'require') {
      url.searchParams.delete('channel_binding');
    }

    // Neon pooler requires pgbouncer=true for Prisma to disable prepared statements
    if (url.hostname.includes('-pooler') && !url.searchParams.has('pgbouncer')) {
      url.searchParams.set('pgbouncer', 'true');
    }

    return url.toString();
  } catch {
    // Fall back to raw string if URL parsing fails
    return raw;
  }
}

function isValueMissing(value: string | undefined | null) {
  if (!value) return true;
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some(marker => lower.includes(marker));
}


// Sanitize Neon URLs before we decide if the database is configured
process.env.POSTGRES_URL = sanitizePostgresUrl(process.env.POSTGRES_URL) ?? undefined;
process.env.POSTGRES_URL_NON_POOLING = sanitizePostgresUrl(process.env.POSTGRES_URL_NON_POOLING) ?? undefined;


// Backfill non-pooling URL from standard URL if missing, to allow app to start
// This prevents "database not configured" errors when only POSTGRES_URL is provided
if (isValueMissing(process.env.POSTGRES_URL_NON_POOLING) && !isValueMissing(process.env.POSTGRES_URL)) {
  process.env.POSTGRES_URL_NON_POOLING = process.env.POSTGRES_URL;
}

const hasClerkConfig = !isValueMissing(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  !isValueMissing(process.env.CLERK_SECRET_KEY);
const hasBlobConfig = !isValueMissing(process.env.BLOB_READ_WRITE_TOKEN);
const hasDatabaseConfig = !isValueMissing(process.env.POSTGRES_URL) &&
  !isValueMissing(process.env.POSTGRES_URL_NON_POOLING);
const hasReplicateConfig = !isValueMissing(process.env.REPLICATE_API_TOKEN);

export const databaseConfigured = hasDatabaseConfig;
export const blobConfigured = hasBlobConfig;
export const clerkConfigured = hasClerkConfig;
export const replicateConfigured = hasReplicateConfig;
