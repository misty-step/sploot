export interface PublicTruthBuildEnv {
  NODE_ENV?: string;
  SPLOOT_DEPLOYMENT_ENV?: string;
  SPLOOT_PUBLIC_TRUTH_E2E_BUILD?: string;
  NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E?: string;
}

export function isPublicTruthEvidenceDeployment(env: PublicTruthBuildEnv = process.env): boolean {
  return env.SPLOOT_DEPLOYMENT_ENV === 'test' || env.SPLOOT_DEPLOYMENT_ENV === 'evidence';
}

export function isPublicTruthE2EBuild(env: PublicTruthBuildEnv = process.env): boolean {
  return env.SPLOOT_PUBLIC_TRUTH_E2E_BUILD === 'true' && isPublicTruthEvidenceDeployment(env);
}

export function assertPublicTruthE2EBuildAllowed(env: PublicTruthBuildEnv = process.env): void {
  if (env.SPLOOT_PUBLIC_TRUTH_E2E_BUILD === 'true' && !isPublicTruthEvidenceDeployment(env)) {
    throw new Error('SPLOOT_PUBLIC_TRUTH_E2E_BUILD is test-only and requires SPLOOT_DEPLOYMENT_ENV=test or evidence');
  }
}

/**
 * Read the value Next injected into the bundle at build time. Runtime
 * SPLOOT_PUBLIC_TRUTH_E2E_BUILD is deliberately not consulted by auth code.
 */
export function isCompiledPublicTruthE2EBuild(env: PublicTruthBuildEnv = process.env): boolean {
  return env.NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E === 'true' && isPublicTruthEvidenceDeployment(env);
}
