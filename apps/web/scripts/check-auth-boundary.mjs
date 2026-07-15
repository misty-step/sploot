import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const routeRoot = join(appRoot, 'app');

const restrictedImports = [
  '@clerk/nextjs/server',
  '@clerk/backend',
];

const violations = [];
const authenticatedSeamMarkers = [
  'authenticateRequest(',
  'getAuthWithUser(',
  'verifyBearerOrThrow(',
  'requireUserIdWithSync(',
];

const routeEntrypoints = [...walk(routeRoot)].filter(file => (
  (file.endsWith('/route.ts') || file.endsWith('/route.tsx')) &&
  !file.includes('/node_modules/') &&
  !file.includes('/.next/') &&
  !file.includes('/public/')
));

for (const file of routeEntrypoints) {
  if (!file.endsWith('.ts') && !file.endsWith('.tsx')) {
    continue;
  }

  const rel = relative(appRoot, file);
  const source = readFileSync(file, 'utf8');
  const hasRestrictedImport = restrictedImports.some(importPath => source.includes(importPath));

  if (hasRestrictedImport) {
    violations.push(rel);
  }

  const isAuthenticatedEntrypoint = authenticatedSeamMarkers.some(marker => source.includes(marker));
  const hasAdmissionBoundary = [
    'withAuthenticatedApi(',
    'assertEnrolledUser(',
    'enrollmentUnavailableResponse(',
    'enrollmentResponseForError(',
  ].some(marker => source.includes(marker));
  if (isAuthenticatedEntrypoint && !hasAdmissionBoundary) {
    violations.push(`${rel}: authenticated entrypoint has no enrollment/error boundary`);
  }

  if (source.includes('withAuthenticatedApi(')) {
    const wrappedHandlers = new Set([...source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:withObservability\()?withAuthenticatedApi\(/g)].map(match => match[1]));
    const exportedMethods = [...source.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=([\s\S]*?);/g)];
    for (const [, method, declaration] of exportedMethods) {
      const dominated = declaration.includes('withAuthenticatedApi(') || [...wrappedHandlers].some(handler => declaration.includes(handler));
      if (!dominated) {
        violations.push(`${rel}: ${method} is not dominated by withAuthenticatedApi`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Route entrypoints must use the shared auth seam instead of direct Clerk provider imports.');
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
