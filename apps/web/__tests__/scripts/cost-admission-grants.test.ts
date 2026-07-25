import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cost admission runtime grants', () => {
  it('grants full DML on cost_admission_counters to the app role and size-aware replica select for the physical meter', () => {
    const restrictedGrant = readFileSync(
      resolve(process.cwd(), 'prisma/stripe-ledger-bootstrap-post.sql'),
      'utf8',
    );

    const appSelectGrant =
      restrictedGrant
        .match(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE([\s\S]*?)TO sploot_stripe_app;/)?.[1]
        ?.replace(/\s+/g, ' ') ?? '';

    expect(appSelectGrant).toContain('public.cost_admission_counters');
    expect(appSelectGrant).toContain('public.embedding_rate_buckets');

    // Meter sums size by rendition+active; column grant must include both.
    expect(restrictedGrant).toMatch(
      /GRANT SELECT \([^)]*\bsize\b[^)]*\brendition\b[^)]*\)[\s\S]*ON TABLE public\.asset_storage_replicas TO sploot_stripe_app|GRANT SELECT \([^)]*\brendition\b[^)]*\bsize\b[^)]*\)[\s\S]*ON TABLE public\.asset_storage_replicas TO sploot_stripe_app/,
    );
  });
});
