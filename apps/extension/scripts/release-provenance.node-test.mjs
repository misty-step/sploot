import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCandidateSha,
  assertReleaseArtifact,
  createReleaseProvenance,
  validateOperatorEvidence,
} from './release-provenance.mjs';

const candidateSha = 'a'.repeat(40);
const artifactSha = 'b'.repeat(64);

test('rejects a candidate SHA that does not match the checked-out source', () => {
  assert.throws(
    () => assertCandidateSha(candidateSha, 'c'.repeat(40)),
    /candidate SHA drift/,
  );
});

test('records the exact candidate and artifact digests as one proof unit', () => {
  assert.deepEqual(
    createReleaseProvenance({
      candidateSha,
      artifactPath: 'dist/extension-1.0.0-chrome.zip',
      artifactSha256: artifactSha,
      version: '1.0.0',
    }),
    {
      candidateSha,
      artifact: {
        path: 'dist/extension-1.0.0-chrome.zip',
        sha256: artifactSha,
      },
      version: '1.0.0',
    },
  );
});

test('rejects strict release evidence that is not bound to the exact candidate artifact', () => {
  const errors = validateOperatorEvidence({
    binding: {
      candidateSha,
      artifactPath: 'dist/other.zip',
      artifactSha256: 'c'.repeat(64),
      version: '1.0.0',
      extensionId: 'extension-id',
    },
  }, {
    candidateSha,
    artifactPath: 'dist/extension-1.0.0-chrome.zip',
    artifactSha256: artifactSha,
    version: '1.0.0',
  });

  assert.match(errors.join('\n'), /artifactPath|artifactSha256/);
  assert.match(errors.join('\n'), /chrome\.authenticatedRightClickSave/);
});

test('rejects a production artifact if its marker or provenance changes', () => {
  assert.throws(() => assertReleaseArtifact({
    candidateSha,
    artifactPath: 'dist/extension-1.0.0-chrome.zip',
    artifactSha256: artifactSha,
    buildMarker: {
      candidateSha,
      artifact: { path: 'dist/extension-1.0.0-chrome.zip', sha256: 'c'.repeat(64) },
    },
    provenance: createReleaseProvenance({
      candidateSha,
      artifactPath: 'dist/extension-1.0.0-chrome.zip',
      artifactSha256: artifactSha,
      version: '1.0.0',
    }),
    version: '1.0.0',
  }), /production ZIP does not match/);
});
