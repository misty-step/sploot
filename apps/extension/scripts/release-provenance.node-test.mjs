import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCandidateSha, createReleaseProvenance } from './release-provenance.mjs';

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
