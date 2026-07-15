const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const SHA256_LABEL_PATTERN = /^[a-f0-9]{64}$/i;

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

export function assertReleaseArtifact({
  candidateSha,
  expectedCandidateSha,
  artifactPath,
  artifactSha256,
  buildMarker,
  provenance,
  version,
}) {
  assertCandidateSha(candidateSha, expectedCandidateSha);
  const expected = createReleaseProvenance({ candidateSha, artifactPath, artifactSha256, version });

  if (buildMarker?.candidateSha !== expected.candidateSha
    || buildMarker?.artifact?.path !== expected.artifact.path
    || buildMarker?.artifact?.sha256 !== expected.artifact.sha256) {
    throw new Error('production ZIP does not match its build provenance marker');
  }

  if (JSON.stringify(provenance) !== JSON.stringify(expected)) {
    throw new Error('production ZIP does not match its uploaded provenance record');
  }
}

/**
 * Validate operator evidence as a proof packet for one exact release. The
 * packet contains references to independently captured Chrome/Web Store
 * evidence; this gate never manufactures or treats missing evidence as a
 * pass.
 */
export function validateOperatorEvidence(evidence, expected) {
  const errors = [];
  const binding = evidence?.binding;

  if (!binding || typeof binding !== 'object') {
    return ['missing operator evidence binding'];
  }

  const exactFields = [
    ['candidateSha', expected.candidateSha],
    ['artifactPath', expected.artifactPath],
    ['artifactSha256', expected.artifactSha256],
    ['version', expected.version],
  ];
  for (const [field, value] of exactFields) {
    if (binding[field] !== value) {
      errors.push(`operator evidence binding ${field} does not match exact release`);
    }
  }

  if (!SHA256_LABEL_PATTERN.test(binding.artifactSha256 ?? '')) {
    errors.push('operator evidence binding artifactSha256 is invalid');
  }

  if (typeof binding.extensionId !== 'string' || binding.extensionId.trim().length === 0) {
    errors.push('operator evidence binding extensionId is required');
  }

  const chromeProofs = [
    'authenticatedRightClickSave',
    'duplicate409',
    'library',
    'signout',
  ];
  for (const proofName of chromeProofs) {
    validateProof(evidence?.chrome?.[proofName], `chrome.${proofName}`, binding, errors);
  }

  const webStore = evidence?.webStore;
  if (!webStore || webStore.itemId !== binding.extensionId) {
    errors.push('operator evidence Web Store itemId must equal the exact extensionId');
  }
  validateProof(webStore?.receipt, 'webStore.receipt', binding, errors);
  validateProof(webStore?.installed, 'webStore.installed', binding, errors);

  return errors;
}

function validateProof(proof, label, binding, errors) {
  if (!proof || typeof proof !== 'object') {
    errors.push(`missing ${label} proof reference`);
    return;
  }

  if (typeof proof.reference !== 'string' || proof.reference.trim().length === 0) {
    errors.push(`${label} proof reference is required`);
  }
  if (typeof proof.capturedAt !== 'string' || proof.capturedAt.trim().length === 0) {
    errors.push(`${label} capturedAt is required`);
  }

  for (const field of ['candidateSha', 'artifactSha256', 'version', 'extensionId']) {
    if (proof[field] !== binding[field]) {
      errors.push(`${label} ${field} is not bound to the packet release`);
    }
  }
}
