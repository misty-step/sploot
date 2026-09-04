import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The liveness route is DigitalOcean's routing probe. It must answer from the
// Next process alone. No database, provider, Clerk, telemetry, or model
// dependency may be able to take the process out of routing (incident
// 2026-07-15: deep /api/health 503'd under DB workload and DigitalOcean
// removed the only web instance -> no_healthy_upstream for ~24 minutes).
//
// These mocks poison every deep-health seam. If the liveness route ever
// imports one of them, the import itself throws and this suite fails.
vi.mock('@/lib/db', () => {
  throw new Error('liveness route must not import the database client');
});
vi.mock('@sentry/nextjs', () => {
  throw new Error('liveness route must not import Sentry');
});
vi.mock('@/lib/with-observability', () => {
  throw new Error('liveness route must not import the observability wrapper');
});
vi.mock('@prisma/client', () => {
  throw new Error('liveness route must not import Prisma');
});

import { GET, HEAD } from '@/app/api/health/live/route';

const routeSource = readFileSync(
  join(process.cwd(), 'app/api/health/live/route.ts'),
  'utf8'
);

describe('/api/health/live', () => {
  it('imports no database, provider, auth, or diagnostics seam', () => {
    const importSpecifiers = [...routeSource.matchAll(/from\s+['"]([^'"]+)['"]/g)]
      .map((match) => match[1]);
    expect(importSpecifiers.length).toBeGreaterThan(0);
    for (const specifier of importSpecifiers) {
      expect(['next/server']).toContain(specifier);
    }
    for (const forbidden of [
      'prisma', '@/lib/db', 'sentry', 'clerk', 'replicate', 'observability',
      'process.env.DATABASE_URL', 'fetch(',
    ]) {
      expect(routeSource).not.toContain(forbidden);
    }
  });

  it('is forced dynamic so a live process, not a build artifact cache, answers', () => {
    expect(routeSource).toContain("export const dynamic = 'force-dynamic'");
  });

  it('returns alive with no sensitive output while every deep seam is poisoned', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'alive', service: 'sploot-web' });
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
  });

  it('answers HEAD without a body for probe implementations that use it', async () => {
    const res = await HEAD();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
  });

  it('regression 2026-07-15: stays alive synchronously even if the event loop later runs DB work', async () => {
    // The route must not await anything: a hung Prisma pool cannot delay it.
    const start = Date.now();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(Date.now() - start).toBeLessThan(1_000);
  });
});
