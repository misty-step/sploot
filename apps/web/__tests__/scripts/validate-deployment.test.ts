import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('production deployment validation', () => {
  it('fails before probing production when the QA evidence flag is enabled', () => {
    expect(() => execFileSync('bash', ['scripts/validate-deployment.sh'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DEPLOYMENT_ENV: 'production',
        SPLOOT_QA_EVIDENCE_MODE: 'enabled',
        DEPLOYMENT_URL: 'http://127.0.0.1:1',
      },
      stdio: 'pipe',
    })).toThrow(/QA_EVIDENCE_MODE/);
  });
});
