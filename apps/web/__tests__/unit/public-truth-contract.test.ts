import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPublicEnrollmentState } from '@/lib/enrollment/enrollment-policy';

const root = resolve(__dirname, '../..');
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');

describe('public truth contracts', () => {
  it('projects the server enrollment policy into a public-safe closed/open state', () => {
    expect(getPublicEnrollmentState({
      NODE_ENV: 'production',
      SPLOOT_DEPLOYMENT_ENV: 'production',
      SPLOOT_ENROLLMENT_MODE: 'closed',
      SPLOOT_DEPLOYMENT_APP_ID: 'app',
      SPLOOT_DEPLOYMENT_CHANGE_ID: 'change',
      SPLOOT_DEPLOYMENT_COMMIT: '3e258ec5',
    })).toEqual({ status: 'paused', mode: 'closed', configuration: 'valid' });

    expect(getPublicEnrollmentState({
      NODE_ENV: 'production',
      SPLOOT_DEPLOYMENT_ENV: 'production',
      SPLOOT_ENROLLMENT_MODE: 'ga',
      SPLOOT_DEPLOYMENT_APP_ID: 'app',
      SPLOOT_DEPLOYMENT_CHANGE_ID: 'change',
      SPLOOT_DEPLOYMENT_COMMIT: '3e258ec5',
    })).toEqual({ status: 'open', mode: 'ga', configuration: 'valid' });
  });

  it('does not mount or promise immediate new-account enrollment while closed', () => {
    const signUp = read('app/sign-up/[[...sign-up]]/page.tsx');
    const home = read('app/page.tsx');
    const help = read('app/help/page.tsx');
    const support = read('app/support/page.tsx');
    const popup = read('../extension/entrypoints/popup/App.tsx');

    expect(signUp).toContain('EnrollmentPaused');
    expect(home).toContain('enrollmentState');
    expect(help).toContain('EnrollmentNotice');
    expect(support).toContain('EnrollmentNotice');
    expect(popup).toContain('new enrollment is paused');
    expect(signUp).toContain("getPublicEnrollmentState().status === 'paused'");
  });

  it('uses the shared public-link contrast contract on public surfaces', () => {
    const css = read('app/globals.css');
    expect(css).toContain('--sploot-public-link');
    expect(css).toContain('.sploot-public-link');
    expect(css).toContain('.dark .sploot-public-link');

    for (const file of [
      'components/global-footer.tsx',
      'app/help/page.tsx',
      'app/support/page.tsx',
      'app/privacy/page.tsx',
      'app/changelog/page.tsx',
    ]) {
      expect(read(file), `${file} should use the public-link token`).toContain('sploot-public-link');
    }
  });

  it('disables extension motion under the user preference', () => {
    const css = read('../extension/entrypoints/popup/style.css');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none');
    expect(css).toContain('transition: none');
  });
});
