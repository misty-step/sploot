import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPublicEnrollmentState } from '@/lib/enrollment/enrollment-policy';
import {
  assertPublicTruthE2EBuildAllowed,
  isCompiledPublicTruthE2EBuild,
  isPublicTruthE2EBuild,
} from '@/lib/public-truth-e2e';

const root = resolve(__dirname, '../..');
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');

describe('public truth contracts', () => {
  it('projects the server enrollment policy into a public-safe closed/open state', async () => {
    expect((await readPublicEnrollmentState({
      env: {
        NODE_ENV: 'production',
        SPLOOT_DEPLOYMENT_ENV: 'production',
        SPLOOT_ENROLLMENT_MODE: 'closed',
        SPLOOT_DEPLOYMENT_APP_ID: 'app',
        SPLOOT_DEPLOYMENT_CHANGE_ID: 'change',
        SPLOOT_DEPLOYMENT_COMMIT: '3e258ec5',
      },
      prisma: null,
    })).state).toEqual({ status: 'paused', mode: 'closed', configuration: 'valid' });

    expect((await readPublicEnrollmentState({
      env: {
        NODE_ENV: 'production',
        SPLOOT_DEPLOYMENT_ENV: 'production',
        SPLOOT_ENROLLMENT_MODE: 'ga',
        SPLOOT_DEPLOYMENT_APP_ID: 'app',
        SPLOOT_DEPLOYMENT_CHANGE_ID: 'change',
        SPLOOT_DEPLOYMENT_COMMIT: '3e258ec5',
      },
      prisma: { user: { count: async () => 0 } },
    })).state).toEqual({ status: 'open', mode: 'ga', configuration: 'valid' });
  });

  it('requires the async server authority on public pages and the endpoint', () => {
    for (const file of [
      'app/page.tsx',
      'app/help/page.tsx',
      'app/help/ios-shortcut/page.tsx',
      'app/support/page.tsx',
      'app/sign-in/[[...sign-in]]/page.tsx',
      'app/sign-up/[[...sign-up]]/page.tsx',
    ]) {
      expect(read(file), `${file} should await the shared enrollment authority`).toContain('readPublicEnrollmentState');
      expect(read(file), `${file} should pass the database seam`).toContain('prisma');
      expect(read(file), `${file} should remain request-dynamic`).toContain('dynamic');
    }

    const endpoint = read('app/api/health/enrollment/route.ts');
    expect(endpoint).toContain('readPublicEnrollmentState');
    expect(endpoint).not.toContain('getEnrollmentReadback');
    expect(endpoint).toContain("'Cache-Control': 'no-store, private'");
  });

  it('requires a default six-case public-truth CI gate and safe browser env', () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, '../../package.json'), 'utf8')) as { scripts?: Record<string, string> };
    const webPackage = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    const playwright = read('playwright.config.ts');
    const workflow = readFileSync(resolve(root, '../../.github/workflows/ci.yml'), 'utf8');

    expect(webPackage.scripts?.['e2e:public-truth']).toBe('playwright test --config playwright.config.ts --grep "public truth"');
    expect(packageJson.scripts?.['ci:public-truth']).toContain('e2e:public-truth');
    expect(playwright).toContain("SPLOOT_ENROLLMENT_MODE: process.env.SPLOOT_ENROLLMENT_MODE ?? 'closed'");
    expect(playwright).toContain("SPLOOT_QA_AUTH_MODE: process.env.SPLOOT_QA_AUTH_MODE ?? 'disabled'");
    expect(playwright).toContain("CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? 'sk_test_public-truth-ci-only'");
    expect(playwright).toContain("name: '__clerk_db_jwt'");
    expect(playwright).toContain("value: 'public-truth-signed-out'");
    expect(playwright).toContain("SPLOOT_PUBLIC_TRUTH_E2E_BUILD: 'true'");
    expect(read('next.config.ts')).toContain('assertPublicTruthE2EBuildAllowed');
    expect(read('lib/auth/client.tsx')).toContain('<ClerkProvider');
    expect(read('lib/auth/client.tsx')).not.toContain('return <>{children}</>');
    expect(read('e2e/clerk-provider.spec.ts')).toContain('SPLOOT_REAL_CLERK_E2E');
    expect(workflow).toMatch(/public-truth:[\s\S]*pnpm --filter web e2e:public-truth/);
    expect(workflow).toContain('pnpm --filter web e2e:public-truth:build');
    expect(workflow).toContain('pnpm --filter web e2e:public-truth:production-guard');
    expect(workflow).toContain('public-truth-production-guard');
    expect(workflow).toMatch(/merge-gate:[\s\S]*needs: \[[^\]]*public-truth/);
  });

  it('keeps the paused sign-in door explicitly sign-up-free via the supported Clerk API', () => {
    const signIn = read('app/sign-in/[[...sign-in]]/page.tsx');
    expect(signIn).toContain('withSignUp={enrollmentOpen ? undefined : false}');
    expect(signIn).toContain("signUpUrl={enrollmentOpen ? \"/sign-up\" : undefined}");
    expect(signIn).toContain('EnrollmentNotice');
    expect(signIn).toContain('footerAction');
  });

  it('distinguishes the database-unavailable unknown state from an ordinary pause end to end', () => {
    expect(read('lib/enrollment/enrollment-policy.ts')).toContain("status: 'unknown'");
    expect(read('../../packages/common/src/types.ts')).toContain("'open' | 'paused' | 'unknown'");
    expect(read('components/enrollment/enrollment-notice.tsx')).toContain('enrollment status unavailable');
    expect(read('app/sign-up/[[...sign-up]]/page.tsx')).toContain('EnrollmentUnavailable');
    expect(read('app/sign-up/[[...sign-up]]/page.tsx')).toContain("enrollmentState.status === 'unknown'");
    const popup = read('../extension/entrypoints/popup/App.tsx');
    expect(popup).toContain('enrollment status unavailable');
    expect(popup).toContain("{ status: 'checking' }");
    // The extension seam preserves an honest non-ok body instead of
    // discarding it, and never trusts an open claim from a failed read.
    const seam = read('../extension/shared/enrollment-state.ts');
    expect(seam).toContain("state.status === 'open'");
    expect(seam).not.toContain('if (!response.ok) return null');
  });

  it('states the pause exactly once per public surface', () => {
    // The support page derives its extension-step copy from the shared
    // notice instead of restating the pause.
    expect(read('app/support/page.tsx')).not.toContain('New enrollment is paused;');
    expect(read('e2e/public-truth.spec.ts')).toContain('exactly one paused statement');
  });

  it('compiles the qa-local auth seam out of production bundles and proves it', () => {
    expect(read('next.config.ts')).toContain('NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD');
    expect(read('next.config.ts')).toContain('dev/test-only');
    for (const file of ['middleware.ts', 'lib/auth/server.ts', 'lib/auth/request-auth.ts', 'app/api/qa-auth/login/route.ts']) {
      expect(read(file), `${file} must gate qa-local behind the compile-time flag`)
        .toContain("process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD");
      expect(read(file), `${file} must not import qa-local statically`)
        .not.toMatch(/^import .*from '.*qa-local';?$/m);
    }
    const guard = read('scripts/verify-production-public-truth-guard.mjs');
    expect(guard).toContain("'x-sploot-qa-auth'");
    expect(guard).toContain("'sploot_qa_auth'");
    expect(guard).toContain("'SPLOOT_QA_AUTH_SECRET'");
    expect(guard).toContain('NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD');
    expect(guard).toContain('SPLOOT_QA_AUTH_MODE=enabled is dev/test-only');
  });

  it('cannot enable the provider omission in a production build', () => {
    expect(isPublicTruthE2EBuild({ NODE_ENV: 'production', SPLOOT_DEPLOYMENT_ENV: 'test', SPLOOT_PUBLIC_TRUTH_E2E_BUILD: 'true' })).toBe(true);
    expect(isPublicTruthE2EBuild({ NODE_ENV: 'production', SPLOOT_DEPLOYMENT_ENV: 'production', SPLOOT_PUBLIC_TRUTH_E2E_BUILD: 'true' })).toBe(false);
    expect(() => assertPublicTruthE2EBuildAllowed({ NODE_ENV: 'production', SPLOOT_DEPLOYMENT_ENV: 'production', SPLOOT_PUBLIC_TRUTH_E2E_BUILD: 'true' })).toThrow(/test-only/);
    expect(() => assertPublicTruthE2EBuildAllowed({ NODE_ENV: 'production', SPLOOT_PUBLIC_TRUTH_E2E_BUILD: 'true' })).toThrow(/requires/);
    expect(isPublicTruthE2EBuild({ NODE_ENV: 'production' })).toBe(false);
    expect(isCompiledPublicTruthE2EBuild({ NODE_ENV: 'production', SPLOOT_DEPLOYMENT_ENV: 'evidence', NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E: 'true' })).toBe(true);
    expect(isCompiledPublicTruthE2EBuild({ NODE_ENV: 'production', SPLOOT_DEPLOYMENT_ENV: 'production', NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E: 'true' })).toBe(false);
    expect(read('lib/auth/server.ts')).toContain('isCompiledPublicTruthE2EBuild');
    expect(read('middleware.ts')).toContain('NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E');
    expect(read('middleware.ts')).toContain('SPLOOT_DEPLOYMENT_ENV === \'test\'');
    expect(read('playwright.config.ts')).toContain('e2e:public-truth:serve');
    expect(read('playwright.config.ts')).not.toContain('next dev');
    expect(read('scripts/build-public-truth.mjs')).toContain('public-truth-build.json');
    expect(read('scripts/verify-production-public-truth-guard.mjs')).toContain('unrelated reason');
    expect(read('scripts/verify-production-public-truth-guard.mjs')).toContain('compiled production bundle contains');
    expect(read('scripts/serve-public-truth.mjs')).toContain('stale or mismatched public-truth artifact');
  });

  it('keeps iPhone/token copy closed-aware and validates the extension seam', () => {
    const shortcut = read('app/help/ios-shortcut/page.tsx');
    const shortcutDoc = readFileSync(resolve(root, 'docs/shortcuts/save-to-sploot.md'), 'utf8');
    const popup = read('../extension/entrypoints/popup/App.tsx');

    expect(shortcut).toContain('<EnrollmentNotice state={enrollmentState} />');
    expect(shortcutDoc).toContain('Existing Sploot users can open');
    expect(shortcutDoc).toContain('new enrollment is paused');
    expect(shortcutDoc).toContain('enrollment_unavailable');
    expect(shortcutDoc).toContain('uploads_disabled');
    expect(popup).toContain('loadPublicEnrollmentState');
    expect(popup).not.toContain('payload?.publicState');
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
    expect(signUp).toContain("enrollmentState.status === 'paused'");
    expect(read('components/enrollment/enrollment-escape-actions.tsx')).toContain('isSignedIn');
    expect(read('components/public-page-header.tsx')).toContain('ThemeToggle');
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

  it('keeps the public endpoint to its intentional three-field shape', () => {
    const deployment = read('docs/DEPLOYMENT.md');
    const api = read('docs/PUBLIC_API.md');
    expect(deployment).toContain('enrollment endpoint intentionally returns only `configuration`, `mode`, and');
    expect(deployment).toContain('authenticated admin readback');
    expect(api).toContain('existing users can continue using their already-issued personal token');
    expect(api).toContain('enrollment/configuration or database boundary');
  });

  it('inventories every public route and the extension save/duplicate oracle', () => {
    const browser = read('e2e/public-truth.spec.ts');
    for (const route of ['/privacy', '/changelog', '/sign-in', '/app/settings']) {
      expect(browser).toContain(route);
    }
    expect(read('../extension/entrypoints/background/context-menu.test.ts')).toContain('duplicate save');
    expect(read('../extension/entrypoints/background/context-menu.test.ts')).toContain('isAuthenticated');
  });

  it('disables extension motion under the user preference', () => {
    const css = read('../extension/entrypoints/popup/style.css');
    expect(css).toContain('--sploot-paper: #cfe7ff');
    expect(css).toContain('--sploot-paper: #19143d');
    expect(css).toContain('prefers-color-scheme: dark');
    expect(css).not.toContain('linear-gradient(var(--sploot-grid-line)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none');
    expect(css).toContain('transition: none');
  });
});
