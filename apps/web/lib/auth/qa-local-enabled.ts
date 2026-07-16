/**
 * Runtime enablement check for the qa-local auth harness, deliberately kept
 * in its own module with no qa-local header/cookie/secret marker strings:
 * production-reachable modules (upload url-import, next.config) may import
 * this check without pulling the qa-local token machinery into their chunk.
 */
export function isQaLocalAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const deploymentMarker = env.SPLOOT_DEPLOYMENT_ENV?.trim().toLowerCase();
  return env.SPLOOT_QA_AUTH_MODE === 'enabled' &&
    (deploymentMarker === 'development' || deploymentMarker === 'test');
}
