import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isQaLocalAuthEnabled } from '@/lib/auth/qa-local-enabled';

/**
 * dev-local.ts (`pnpm dev:local`) and qa-evidence.ts (`pnpm qa:evidence`)
 * spawn a Next.js dev server / auxiliary QA tooling with their own
 * constructed env object. isQaLocalAuthEnabled() (the sign-in page's QA
 * auto-login redirect gate) checks SPLOOT_DEPLOYMENT_ENV specifically —
 * a distinct marker from SPLOOT_QA_DEPLOYMENT_ENV (which identifies *which*
 * QA deployment/environment, consumed by qa-client.ts and friends). Without
 * SPLOOT_DEPLOYMENT_ENV set to 'development' or 'test', these local
 * workflows never redirect to /api/qa-auth/login and have no Clerk keys to
 * fall back to — a broken standalone local dev/evidence-capture flow.
 */
describe('local QA launcher deployment-env wiring', () => {
  it('wires SPLOOT_DEPLOYMENT_ENV so dev-local.ts satisfies isQaLocalAuthEnabled()', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/dev-local.ts'), 'utf8');
    expect(source).toContain("SPLOOT_DEPLOYMENT_ENV: 'development'");
    expect(isQaLocalAuthEnabled({
      SPLOOT_QA_AUTH_MODE: 'enabled',
      SPLOOT_DEPLOYMENT_ENV: 'development',
    })).toBe(true);
  });

  it('wires SPLOOT_DEPLOYMENT_ENV so qa-evidence.ts satisfies isQaLocalAuthEnabled()', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/qa-evidence.ts'), 'utf8');
    expect(source).toContain("SPLOOT_DEPLOYMENT_ENV: 'development'");
    expect(isQaLocalAuthEnabled({
      SPLOOT_QA_AUTH_MODE: 'enabled',
      SPLOOT_DEPLOYMENT_ENV: 'development',
    })).toBe(true);
  });

  it('proves the pre-fix gap: SPLOOT_QA_DEPLOYMENT_ENV alone (without SPLOOT_DEPLOYMENT_ENV) never satisfies the gate', () => {
    // Both launchers already set SPLOOT_QA_DEPLOYMENT_ENV=local-qa; that
    // alone was the bug — isQaLocalAuthEnabled() does not read it.
    expect(isQaLocalAuthEnabled({
      SPLOOT_QA_AUTH_MODE: 'enabled',
      SPLOOT_QA_DEPLOYMENT_ENV: 'local-qa',
    })).toBe(false);
  });

  it('does not confuse capture-pwa-screenshots.ts\'s already-correct wiring with the two fixed launchers', () => {
    // Prior art this fix now matches: capture-pwa-screenshots.ts already
    // wired SPLOOT_DEPLOYMENT_ENV correctly before this fix.
    const source = readFileSync(join(process.cwd(), 'scripts/capture-pwa-screenshots.ts'), 'utf8');
    expect(source).toContain("SPLOOT_DEPLOYMENT_ENV: 'test'");
  });
});
