const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;

export function assertCandidateSha(actualSha, expectedSha) {
  if (!COMMIT_PATTERN.test(actualSha)) {
    throw new Error(`invalid checked-out candidate SHA: ${actualSha}`);
  }
  if (expectedSha !== undefined && actualSha !== expectedSha) {
    throw new Error(`candidate SHA drift: expected ${expectedSha}, checked out ${actualSha}`);
  }
}

export function createReleaseProvenance({ candidateSha, artifactPath, artifactSha256, version }) {
  assertCandidateSha(candidateSha);
  if (!SHA256_PATTERN.test(artifactSha256)) {
    throw new Error(`invalid release artifact SHA256: ${artifactSha256}`);
  }

  return {
    candidateSha: candidateSha.toLowerCase(),
    artifact: {
      path: artifactPath,
      sha256: artifactSha256.toLowerCase(),
    },
    version,
  };
}
