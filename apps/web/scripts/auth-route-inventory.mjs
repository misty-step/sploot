/**
 * Explicit route policy. The boundary guard compares this inventory with the
 * live Next route tree and parses each module; it never trusts comments,
 * filename conventions, or lexical mentions of the wrapper.
 */
const protectedRoutes = {
  'app/api/analytics/usage/route.ts': { GET: 'protected' },
  'app/api/assets/[id]/embedding-status/route.ts': { GET: 'protected' },
  'app/api/assets/[id]/generate-embedding/route.ts': { POST: 'protected' },
  'app/api/assets/[id]/route.ts': { GET: 'protected', PATCH: 'protected', DELETE: 'protected' },
  'app/api/assets/[id]/share/route.ts': { POST: 'protected' },
  'app/api/assets/[id]/similar/route.ts': { GET: 'protected' },
  'app/api/assets/[id]/tags/route.ts': { GET: 'protected', POST: 'protected', DELETE: 'protected' },
  'app/api/assets/audit/route.ts': { GET: 'protected' },
  'app/api/assets/batch/embedding-status/route.ts': { POST: 'protected' },
  'app/api/assets/route.ts': { POST: 'protected', GET: 'protected' },
  'app/api/cache/stats/route.ts': { GET: 'protected', POST: 'protected' },
  'app/api/embeddings/image/route.ts': { POST: 'protected' },
  'app/api/embeddings/text/route.ts': { POST: 'protected' },
  'app/api/health/user-sync/route.ts': { GET: 'protected' },
  'app/api/library/starter/route.ts': { POST: 'protected' },
  'app/api/piles/route.ts': { GET: 'protected' },
  'app/api/search/advanced/route.ts': { POST: 'protected' },
  'app/api/search/route.ts': { POST: 'protected', GET: 'protected' },
  'app/api/sse/embedding-updates/route.ts': { GET: 'protected' },
  'app/api/stats/route.ts': { GET: 'protected' },
  'app/api/tags/[tagId]/route.ts': { PATCH: 'protected', DELETE: 'protected' },
  'app/api/tags/route.ts': { GET: 'protected', POST: 'protected' },
  'app/api/taste/profile/route.ts': { GET: 'protected' },
  'app/api/telemetry/route.ts': { POST: 'protected' },
  'app/api/upload-tokens/[id]/route.ts': { DELETE: 'protected' },
  'app/api/upload-tokens/route.ts': { GET: 'protected', POST: 'protected' },
  'app/api/upload/check/route.ts': { POST: 'protected', OPTIONS: 'public' },
  'app/api/upload/route.ts': { POST: 'protected', GET: 'protected' },
  'app/api/upload/url/route.ts': { POST: 'protected' },
};

const publicRoutes = {
  'app/api/db-ping/route.ts': { GET: 'public' },
  'app/api/health/route.ts': { GET: 'public', HEAD: 'public' },
  'app/api/health/services/route.ts': { GET: 'public', OPTIONS: 'public' },
  'app/api/qa-auth/login/route.ts': { GET: 'public' },
};

const cronRoutes = {
  'app/api/cron/audit-assets/route.ts': { GET: 'cron' },
  'app/api/cron/process-embeddings/route.ts': { GET: 'cron' },
  'app/api/cron/purge-deleted-assets/route.ts': { GET: 'cron' },
  'app/api/cron/purge-search-logs/route.ts': { GET: 'cron' },
  'app/api/cron/regenerate-thumbnails/route.ts': { GET: 'cron' },
};

const staticRoutes = {
  'app/api/version/route.ts': { GET: 'static' },
};

const browserRoutes = {
  'app/changelog.xml/route.ts': { GET: 'public' },
  'app/share-target/route.ts': { POST: 'protected', GET: 'public' },
};

export const routeInventory = Object.fromEntries([
  ...Object.entries(protectedRoutes).map(([file, methods]) => [file, { kind: 'protected', methods }]),
  ...Object.entries(publicRoutes).map(([file, methods]) => [file, { kind: 'public', methods }]),
  ...Object.entries(cronRoutes).map(([file, methods]) => [file, { kind: 'cron', methods }]),
  ...Object.entries(staticRoutes).map(([file, methods]) => [file, { kind: 'static', methods }]),
  ...Object.entries(browserRoutes).map(([file, methods]) => [file, { kind: 'browser', methods }]),
]);

for (const file of ['app/api/search/route.ts', 'app/api/upload/route.ts', 'app/api/upload/url/route.ts']) {
  routeInventory[file].tokenMethods = ['POST'];
}
