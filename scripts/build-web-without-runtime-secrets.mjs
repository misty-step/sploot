import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DENIED_RUNTIME_BINDINGS = [
  'DATABASE_URL',
  'DATABASE_URL_DIRECT',
  'SPLOOT_DEPLOYMENT_ENV',
  'DEPLOYMENT_ENV',
  'CLERK_SECRET_KEY',
  'BLOB_READ_WRITE_TOKEN',
  'REPLICATE_API_TOKEN',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'STRIPE_SECRET_KEY',
];

export function createWebBuildEnvironment(parent = process.env) {
  const environment = {
    PATH: parent.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: parent.HOME ?? '',
    CI: parent.CI ?? '1',
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: [
      'pk',
      'test',
      Buffer.from('clerk.example.com$').toString('base64url'),
    ].join('_'),
    NEXT_PUBLIC_TELEMETRY_ENDPOINT: parent.NEXT_PUBLIC_TELEMETRY_ENDPOINT ?? '/api/telemetry',
    NEXT_PUBLIC_TELEMETRY_ENABLED: parent.NEXT_PUBLIC_TELEMETRY_ENABLED ?? 'true',
  };

  for (const name of DENIED_RUNTIME_BINDINGS) environment[name] = '';
  return environment;
}

export function runWebBuild(parent = process.env) {
  const result = spawnSync('pnpm', ['--filter', 'web', 'build'], {
    cwd: new URL('..', import.meta.url),
    env: createWebBuildEnvironment(parent),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) runWebBuild();
