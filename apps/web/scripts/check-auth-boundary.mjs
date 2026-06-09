import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const apiRoot = join(appRoot, 'app/api');

const restrictedImports = [
  '@clerk/nextjs/server',
  '@clerk/backend',
  '@/lib/auth/server',
  '@/lib/auth/verify-bearer',
];

const legacyAllowlist = new Set([
  'app/api/analytics/usage/route.ts',
  'app/api/assets/[id]/embedding-status/route.ts',
  'app/api/assets/[id]/generate-embedding/route.ts',
  'app/api/assets/[id]/route.ts',
  'app/api/assets/[id]/share/route.ts',
  'app/api/assets/[id]/similar/route.ts',
  'app/api/assets/[id]/tags/route.ts',
  'app/api/assets/audit/route.ts',
  'app/api/assets/batch/embedding-status/route.ts',
  'app/api/assets/route.ts',
  'app/api/embeddings/image/route.ts',
  'app/api/embeddings/text/route.ts',
  'app/api/health/services/route.ts',
  'app/api/health/user-sync/route.ts',
  'app/api/search/advanced/route.ts',
  'app/api/search/route.ts',
  'app/api/sse/embedding-updates/route.ts',
  'app/api/stats/route.ts',
  'app/api/tags/[tagId]/route.ts',
  'app/api/tags/route.ts',
  'app/api/telemetry/route.ts',
  'app/api/upload/check/route.ts',
  'app/api/upload/route.ts',
]);

const violations = [];

for (const file of walk(apiRoot)) {
  if (!file.endsWith('.ts') && !file.endsWith('.tsx')) {
    continue;
  }

  const rel = relative(appRoot, file);
  const source = readFileSync(file, 'utf8');
  const hasRestrictedImport = restrictedImports.some(importPath => source.includes(importPath));

  if (hasRestrictedImport && !legacyAllowlist.has(rel)) {
    violations.push(rel);
  }
}

if (violations.length > 0) {
  console.error('Protected API routes must use lib/auth/with-authenticated-api instead of direct provider imports.');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}
