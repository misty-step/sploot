import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
export const OPERATOR_EVIDENCE_SCHEMA_VERSION = 1;
export const OPERATOR_EVIDENCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const OPERATOR_EVIDENCE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const WEB_STORE_ORIGIN = 'https://chromewebstore.google.com';
const SPLOOT_ORIGINS = new Set(['https://www.sploot.app', 'https://sploot.app']);
const WEB_STORE_STATUSES = new Set(['in_review', 'published']);
const APPROVED_CHROME_PROOF_ORIGINS = new Set(['https://www.sploot.app', 'https://sploot.app']);
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
  return validateOperatorEvidenceAt(evidence, expected, { evidenceRoot: process.cwd() });
}

/**
 * Validate operator evidence and the files it names. `evidenceRoot` is the
 * packet directory; references are deliberately local relative paths so a
 * packet cannot hide a URL, data URI, or path traversal behind a string.
 */
export function validateOperatorEvidenceAt(evidence, expected, options = {}) {
  const errors = [];
  const now = options.now ?? Date.now();
  const evidenceRoot = options.evidenceRoot;

  if (evidence?.schemaVersion !== OPERATOR_EVIDENCE_SCHEMA_VERSION) {
    errors.push(`operator evidence schemaVersion must be ${OPERATOR_EVIDENCE_SCHEMA_VERSION}`);
  }

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

  if (!SHA256_PATTERN.test(binding.artifactSha256 ?? '')) {
    errors.push('operator evidence binding artifactSha256 is invalid');
  }

  if (typeof binding.extensionId !== 'string' || !CHROME_EXTENSION_ID_PATTERN.test(binding.extensionId)) {
    errors.push('operator evidence binding extensionId is not a valid Chrome extension ID');
  }

  const chromeProofs = [
    'authenticatedRightClickSave',
    'duplicate409',
    'library',
    'signout',
  ];
  const usedArtifacts = new Map();
  for (const proofName of chromeProofs) {
    validateProof(evidence?.chrome?.[proofName], `chrome.${proofName}`, binding, errors, {
      expectedKind: proofName === 'duplicate409' ? 'receipt' : 'screenshot',
      evidenceRoot,
      now,
      usedArtifacts,
    });
  }

  const webStore = evidence?.webStore;
  if (!webStore || typeof webStore !== 'object') {
    errors.push('missing operator evidence Web Store verification');
  } else {
    if (webStore.origin !== WEB_STORE_ORIGIN) {
      errors.push(`operator evidence Web Store origin must be ${WEB_STORE_ORIGIN}`);
    }
    if (webStore.itemId !== binding.extensionId) {
      errors.push('operator evidence Web Store itemId must equal the exact extensionId');
    }
    const expectedItemUrl = `${WEB_STORE_ORIGIN}/detail/sploot/${binding.extensionId}`;
    if (webStore.itemUrl !== expectedItemUrl) {
      errors.push('operator evidence Web Store itemUrl does not match the exact extension');
    }
    if (!WEB_STORE_STATUSES.has(webStore.status)) {
      errors.push('operator evidence Web Store status is not a verified submitted status');
    }
    if (!validTimestamp(webStore.verifiedAt, now, errors, 'webStore.verifiedAt')) {
      // The helper records the precise timestamp failure.
    }
  }
  validateProof(webStore?.receipt, 'webStore.receipt', binding, errors, {
    expectedKind: 'receipt',
    evidenceRoot,
    now,
    provider: webStore,
    usedArtifacts,
  });
  validateProof(webStore?.installed, 'webStore.installed', binding, errors, {
    expectedKind: 'install',
    evidenceRoot,
    now,
    provider: webStore,
    usedArtifacts,
  });

  const providerVerification = evidence?.providerVerification;
  if (!providerVerification || typeof providerVerification !== 'object') {
    errors.push('missing independent live provider verification record');
  } else {
    if (providerVerification.provider !== 'chrome-web-store') {
      errors.push('provider verification must identify chrome-web-store');
    }
    if (providerVerification.origin !== WEB_STORE_ORIGIN) {
      errors.push(`provider verification origin must be ${WEB_STORE_ORIGIN}`);
    }
    if (providerVerification.itemUrl !== webStore?.itemUrl) {
      errors.push('provider verification itemUrl does not match Web Store evidence');
    }
    if (providerVerification.status !== webStore?.status) {
      errors.push('provider verification status does not match Web Store evidence');
    }
    validTimestamp(providerVerification.verifiedAt, now, errors, 'providerVerification.verifiedAt');
  }

  validateApproval(evidence?.approval, binding, evidenceRoot, now, errors);

  return errors;
}

function validateProof(proof, label, binding, errors, options) {
  if (!proof || typeof proof !== 'object') {
    errors.push(`missing ${label} concrete proof artifact`);
    return;
  }

  validTimestamp(proof.capturedAt, options.now, errors, `${label}.capturedAt`);

  for (const field of ['candidateSha', 'artifactSha256', 'version', 'extensionId']) {
    if (proof[field] !== binding[field]) {
      errors.push(`${label} ${field} is not bound to the packet release`);
    }
  }
  if (typeof binding.accountId !== 'string' || binding.accountId.length === 0) {
    errors.push('operator evidence binding accountId is required');
  } else if (proof.accountId !== binding.accountId) {
    errors.push(`${label} accountId is not bound to the packet account`);
  }

  const artifact = proof.artifact;
  if (!artifact || typeof artifact !== 'object') {
    errors.push(`${label} concrete artifact metadata is required`);
    return;
  }
  if (artifact.kind !== options.expectedKind) {
    errors.push(`${label} artifact kind must be ${options.expectedKind}`);
  }
  if (typeof artifact.reference !== 'string' || !safeRelativeReference(artifact.reference)) {
    errors.push(`${label} artifact reference path escapes the evidence packet or uses a fabricated scheme`);
  } else if (options.evidenceRoot) {
    const artifactPath = path.resolve(options.evidenceRoot, artifact.reference);
    if (!isWithin(options.evidenceRoot, artifactPath)) {
      errors.push(`${label} artifact reference escapes the evidence packet`);
    } else if (!existsSync(artifactPath) || !statSync(artifactPath).isFile()) {
      errors.push(`${label} referenced evidence artifact is missing`);
    } else {
      const bytes = readFileSync(artifactPath);
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (artifact.sha256 !== digest) {
        errors.push(`${label} artifact SHA-256 does not match the referenced evidence artifact`);
      }
      if (artifact.byteLength !== bytes.length) {
        errors.push(`${label} artifact byteLength does not match the referenced evidence artifact`);
      }
    }
  }
  if (!SHA256_PATTERN.test(artifact.sha256 ?? '')) {
    errors.push(`${label} artifact sha256 is invalid`);
  }
  if (!Number.isInteger(artifact.byteLength) || artifact.byteLength <= 0) {
    errors.push(`${label} artifact byteLength is required`);
  }
  if (typeof artifact.mimeType !== 'string' || artifact.mimeType.length === 0) {
    errors.push(`${label} artifact mimeType is required`);
  }
  if (!artifact.metadata || typeof artifact.metadata !== 'object') {
    errors.push(`${label} artifact machine metadata is required`);
  } else {
    validateArtifactReleaseBinding(artifact.metadata.releaseBinding, label, proof, binding, errors);
    if (artifact.metadata.releaseBinding?.capturedAt !== proof.capturedAt) {
      errors.push(`${label} artifact timestamp does not match proof timestamp`);
    }
    if (artifact.metadata.releaseBinding?.accountId !== proof.accountId) {
      errors.push(`${label} artifact account does not match proof account`);
    }
  }

  // A copied screenshot under a different filename is still the same proof;
  // semantic proof roles must each have independently captured bytes.
  const artifactIdentity = artifact.sha256;
  if (options.usedArtifacts?.has(artifactIdentity)) {
    errors.push(`${label} reuses an evidence artifact already assigned to ${options.usedArtifacts.get(artifactIdentity)}`);
  } else {
    options.usedArtifacts?.set(artifactIdentity, label);
  }

  const providerUrl = proof.providerUrl;
  if (label.startsWith('webStore.')) {
    if (typeof providerUrl !== 'string' || !providerUrl.startsWith(`${WEB_STORE_ORIGIN}/`)) {
      errors.push(`${label} providerUrl must use the Chrome Web Store origin`);
    }
    if (proof.itemUrl !== options.provider?.itemUrl) {
      errors.push(`${label} itemUrl does not match the verified Web Store item`);
    }
  } else if (label.startsWith('chrome.')) {
    if (!approvedProviderUrl(proof.providerUrl, APPROVED_CHROME_PROOF_ORIGINS)) {
      errors.push(`${label} providerUrl must use an approved Sploot HTTPS origin`);
    }
  } else if (proof.providerUrl !== undefined) {
    try {
      const parsed = new URL(proof.providerUrl);
      if (!SPLOOT_ORIGINS.has(parsed.origin) || parsed.protocol !== 'https:') {
        errors.push(`${label} providerUrl uses an untrusted origin`);
      }
    } catch {
      errors.push(`${label} providerUrl is not a valid HTTPS URL`);
    }
  }

  if (label === 'chrome.duplicate409') {
    if (proof.observed?.httpStatus !== 409 || proof.observed?.isDuplicate !== true) {
      errors.push(`${label} must carry machine-checked HTTP 409 duplicate metadata`);
    }
  }
  if (label === 'chrome.signout' && proof.observed?.authState !== 'signed-out') {
    errors.push(`${label} must carry signed-out machine metadata`);
  }
}

function validateArtifactReleaseBinding(releaseBinding, label, proof, binding, errors) {
  if (!releaseBinding || typeof releaseBinding !== 'object') {
    errors.push(`${label} artifact must bind to the uploaded or re-downloaded release ZIP`);
    return;
  }
  if (!['uploaded-zip', 'redownloaded-zip'].includes(releaseBinding.transport)) {
    errors.push(`${label} artifact release transport must be uploaded-zip or redownloaded-zip`);
  }
  if (releaseBinding.sourceSha !== binding.candidateSha) {
    errors.push(`${label} artifact source SHA is not bound to the exact release`);
  }
  if (releaseBinding.zipSha256 !== binding.artifactSha256) {
    errors.push(`${label} artifact ZIP SHA-256 is not bound to the exact release`);
  }
  if (releaseBinding.extensionId !== binding.extensionId) {
    errors.push(`${label} artifact extension ID is not bound to the exact release`);
  }
  if (releaseBinding.capturedAt !== proof.capturedAt) {
    errors.push(`${label} artifact capture timestamp is not machine-bound`);
  }
}

function validateApproval(approval, binding, evidenceRoot, now, errors) {
  if (!approval || typeof approval !== 'object') {
    errors.push('missing immutable reviewer approval record');
    return;
  }
  if (typeof approval.reviewerId !== 'string' || approval.reviewerId.length === 0) {
    errors.push('approval reviewerId is required');
  }
  if (!approval.identity || typeof approval.identity !== 'object'
    || typeof approval.identity.provider !== 'string'
    || typeof approval.identity.subject !== 'string'
    || approval.identity.subject.length === 0) {
    errors.push('approval immutable reviewer identity provider and subject are required');
  }
  if (approval.decision !== 'approved') {
    errors.push('approval decision must be approved');
  }
  validTimestamp(approval.decidedAt, now, errors, 'approval.decidedAt');
  const artifact = approval.artifact;
  if (!artifact || typeof artifact !== 'object') {
    errors.push('approval must include an immutable hashed approval artifact');
    return;
  }
  if (artifact.kind !== 'approval') {
    errors.push('approval artifact kind must be approval');
  }
  if (typeof artifact.reference !== 'string' || !safeRelativeReference(artifact.reference)) {
    errors.push('approval artifact reference must be a safe local packet path');
    return;
  }
  if (!evidenceRoot) {
    errors.push('approval referenced evidence artifact is missing');
    return;
  }
  const artifactPath = path.resolve(evidenceRoot, artifact.reference);
  if (!isWithin(evidenceRoot, artifactPath) || !existsSync(artifactPath) || !statSync(artifactPath).isFile()) {
    errors.push('approval referenced evidence artifact is missing');
    return;
  }
  const bytes = readFileSync(artifactPath);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (artifact.sha256 !== digest || approval.recordSha256 !== digest) {
    errors.push('approval artifact SHA-256 does not match its immutable record');
  }
  if (artifact.byteLength !== bytes.length) {
    errors.push('approval artifact byteLength does not match its immutable record');
  }
  if (artifact.metadata?.sourceSha !== binding.candidateSha
    || artifact.metadata?.zipSha256 !== binding.artifactSha256
    || artifact.metadata?.extensionId !== binding.extensionId) {
    errors.push('approval artifact is not bound to the exact release source, ZIP, and extension ID');
  }
}

function approvedProviderUrl(value, origins) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && origins.has(parsed.origin);
  } catch {
    return false;
  }
}

function safeRelativeReference(reference) {
  return reference.length > 0
    && !path.isAbsolute(reference)
    && !reference.includes('\\')
    && !/^[a-z][a-z\d+.-]*:/i.test(reference)
    && reference.split('/').every(part => part.length > 0 && part !== '.' && part !== '..');
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function validTimestamp(value, now, errors, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    errors.push(`${label} must be an ISO-8601 timestamp`);
    return false;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    errors.push(`${label} is invalid`);
    return false;
  }
  if (parsed > now + OPERATOR_EVIDENCE_MAX_FUTURE_SKEW_MS) {
    errors.push(`${label} is in the future`);
  }
  if (now - parsed > OPERATOR_EVIDENCE_MAX_AGE_MS) {
    errors.push(`${label} is stale`);
  }
  return true;
}
