import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertCandidateSha,
  assertReleaseArtifact,
  createReleaseProvenance,
  validateOperatorEvidence,
  validateOperatorEvidenceAt,
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

test('rejects one malicious operator packet across every proof boundary', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sploot-proof-'));
  mkdirSync(path.join(root, 'evidence'));
  const writeArtifact = (name, bytes, kind = 'screenshot') => {
    const reference = `evidence/${name}`;
    writeFileSync(path.join(root, reference), bytes);
    return {
      kind,
      reference,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      byteLength: bytes.length,
      mimeType: name.includes('receipt') ? 'application/json' : 'image/png',
      metadata: { capturedBy: 'chrome', dimensions: '1280x800' },
    };
  };
  const extensionId = 'a'.repeat(32);
  const accountId = 'account-a';
  const itemUrl = `https://chromewebstore.google.com/detail/sploot/${extensionId}`;
  const proof = (artifact, kind, capturedAt = new Date(now).toISOString(), providerUrl = kind === 'screenshot' ? 'https://www.sploot.app/app' : itemUrl) => ({
    candidateSha,
    artifactSha256: artifactSha,
    version: '1.0.0',
    extensionId,
    accountId,
    capturedAt,
    artifact: { ...artifact, kind },
    providerUrl,
    itemUrl,
    observed: kind === 'receipt' ? { httpStatus: 409, isDuplicate: true } : { authState: 'signed-in' },
  });
  const now = Date.parse('2026-07-15T16:00:00.000Z');
  const capturedAt = new Date(now).toISOString();
  const screenshot = writeArtifact('save.png', Buffer.from('save'));
  const copiedScreenshot = writeArtifact('copied-save.png', Buffer.from('save'));
  const libraryScreenshot = writeArtifact('library.png', Buffer.from('library'));
  const signoutScreenshot = writeArtifact('signout.png', Buffer.from('signout'));
  const receipt = writeArtifact('duplicate-receipt.json', Buffer.from('{}'), 'receipt');
  const webStoreReceipt = writeArtifact('web-store-receipt.json', Buffer.from('{"receipt":true}'), 'receipt');
  const install = writeArtifact('install.png', Buffer.from('install'), 'install');
  const approvalArtifact = writeArtifact('approval.json', Buffer.from('{"decision":"approved"}'), 'approval');
  const packet = {
    schemaVersion: 1,
    binding: {
      candidateSha,
      artifactPath: 'dist/extension-1.0.0-chrome.zip',
      artifactSha256: artifactSha,
      version: '1.0.0',
      extensionId,
      accountId,
    },
    chrome: {
      authenticatedRightClickSave: proof(screenshot, 'screenshot', capturedAt),
      duplicate409: proof(receipt, 'receipt', capturedAt, 'https://www.sploot.app/app'),
      library: proof(libraryScreenshot, 'screenshot', capturedAt),
      signout: { ...proof(signoutScreenshot, 'screenshot', capturedAt), observed: { authState: 'signed-out' } },
    },
    webStore: {
      origin: 'https://chromewebstore.google.com',
      itemId: extensionId,
      itemUrl,
      status: 'in_review',
      verifiedAt: new Date(now).toISOString(),
      receipt: proof(webStoreReceipt, 'receipt'),
      installed: proof(install, 'install'),
    },
    providerVerification: {
      provider: 'chrome-web-store',
      origin: 'https://chromewebstore.google.com',
      itemUrl,
      status: 'in_review',
      verifiedAt: new Date(now).toISOString(),
    },
    approval: {
      reviewerId: 'github:user/reviewer',
      identity: { provider: 'github', subject: 'user/reviewer' },
      decision: 'approved',
      decidedAt: capturedAt,
      recordSha256: approvalArtifact.sha256,
      artifact: {
        ...approvalArtifact,
        metadata: {
          sourceSha: candidateSha,
          zipSha256: artifactSha,
          extensionId,
        },
      },
    },
  };

  for (const proofValue of [
    packet.chrome.authenticatedRightClickSave,
    packet.chrome.duplicate409,
    packet.chrome.library,
    packet.chrome.signout,
    packet.webStore.receipt,
    packet.webStore.installed,
  ]) {
    proofValue.artifact.metadata = {
      releaseBinding: {
        transport: 'redownloaded-zip',
        sourceSha: candidateSha,
        zipSha256: artifactSha,
        extensionId,
        capturedAt: proofValue.capturedAt,
        accountId,
      },
        accountId,
    };
  }

  const validErrors = validateOperatorEvidenceAt(packet, {
    candidateSha,
    artifactPath: 'dist/extension-1.0.0-chrome.zip',
    artifactSha256: artifactSha,
    version: '1.0.0',
  }, { evidenceRoot: root, now });
  assert.deepEqual(validErrors, []);

  packet.schemaVersion = 999;
  packet.binding.extensionId = 'extension-id';
  packet.chrome.authenticatedRightClickSave.capturedAt = '2099-01-01T00:00:00.000Z';
  packet.chrome.duplicate409.artifact.reference = '../outside.json';
  packet.webStore.installed.artifact.reference = 'evidence/missing.png';
  packet.chrome.signout.artifact.sha256 = 'c'.repeat(64);
  packet.chrome.library.artifact = {
    ...packet.chrome.authenticatedRightClickSave.artifact,
    reference: copiedScreenshot.reference,
  };
  packet.approval.decision = 'rejected';
  packet.webStore.origin = 'https://example.invalid';
  packet.webStore.itemUrl = 'https://chromewebstore.google.com/detail/other/a'.repeat(1);
  packet.webStore.status = 'draft';
  packet.providerVerification.status = 'draft';
  packet.webStore.verifiedAt = '2020-01-01T00:00:00.000Z';

  const errors = validateOperatorEvidenceAt(packet, {
    candidateSha,
    artifactPath: 'dist/extension-1.0.0-chrome.zip',
    artifactSha256: artifactSha,
    version: '1.0.0',
  }, { evidenceRoot: root, now });
  const message = errors.join('\n');
  assert.match(message, /schemaVersion/);
  assert.match(message, /valid Chrome extension ID/);
  assert.match(message, /in the future/);
  assert.match(message, /escapes the evidence packet/);
  assert.match(message, /referenced evidence artifact is missing/);
  assert.match(message, /SHA-256 does not match/);
  assert.match(message, /reuses an evidence artifact/);
  assert.match(message, /Web Store origin/);
  assert.match(message, /itemUrl/);
  assert.match(message, /status/);
  assert.match(message, /stale/);
});
