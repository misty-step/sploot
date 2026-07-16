#!/usr/bin/env node

/**
 * Enrollment supplies an allowlisted spec/oracle to the shared provider
 * transaction. Provider state, mutation, deployment verification, and
 * compensation live in deployment-provider-transaction.mjs.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import {
  assertClosedSnapshot,
  assertCompensationFence,
  assertDeploymentContents,
  assertLegacyClosedSnapshot,
  assertReadbackBinding,
  assertRoutedSpecBindings,
  assertPublicEnrollmentState,
  assertSpecBindings,
  createDeploymentProviderTransaction,
  deriveClosedStageSpec,
  deriveGaLiftSpec,
  deriveLegacyBindingBootstrapSpec,
  deploymentWebSourceCommit,
} from './deployment-provider-transaction.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function hasFlag(name) { return process.argv.includes(name); }
function fail(message) { throw new Error(message); }
function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

function lifecycleReadback(readback, { appId, changeId, commit, marker }) {
  return {
    deploymentAppId: appId,
    deploymentChangeId: changeId,
    deploymentCommit: commit,
    deploymentMarker: marker,
    configuration: readback?.configuration,
    mode: readback?.mode,
    status: readback?.status,
  };
}

const mode = argument('--mode');
const appId = argument('--app-id');
const specPath = argument('--spec');
const deploymentUrl = (argument('--url') || '').replace(/\/$/, '');
const commit = argument('--commit');
const marker = argument('--marker') || 'production';
const changeId = argument('--change-id');
const closedDeploymentId = argument('--closed-deployment-id');
const apply = hasFlag('--apply');
const bootstrapBindings = hasFlag('--bootstrap-bindings');
const doctlBinary = process.env.DOCTL_BIN || 'doctl';

if (!['closed', 'ga'].includes(mode)) fail('--mode must be closed or ga; capped-first lifecycle actions are not supported');
for (const [name, value] of [['--app-id', appId], ['--url', deploymentUrl], ['--commit', commit], ['--change-id', changeId], ...(bootstrapBindings ? [] : [['--spec', specPath]])]) {
  if (!value) fail(`${name} is required`);
}
if (bootstrapBindings && mode !== 'closed') fail('--bootstrap-bindings is only valid with --mode closed');
if (!['production', 'staging'].includes(marker)) fail('--marker must be production or staging');
if (!/^https:\/\/[^\s?]+$/.test(deploymentUrl)) fail('--url must be the exact HTTPS deployment URL without query parameters');
if (!/^[0-9a-f]{7,64}$/i.test(commit)) fail('--commit must be a hexadecimal commit identifier');
if (mode === 'ga' && !closedDeploymentId) fail('--closed-deployment-id is required for a GA lift');

let specDocument;
if (!bootstrapBindings) {
  try {
    specDocument = parseYaml(readFileSync(specPath, 'utf8'));
  } catch {
    fail('spec file cannot be read or is not valid YAML');
  }
  assertSpecBindings(specDocument, { mode, marker, changeId });
}

const plan = {
  dryRun: !apply,
  mode,
  marker,
  appId,
  deploymentUrl,
  commit,
  changeId,
  sequence: bootstrapBindings
    ? ['snapshot-legacy-closed', 'install-deployment-bindings', 'observe-active-deployment', 'wait-active']
    : mode === 'ga'
    ? ['snapshot-closed', 'prove-closed', 'update-spec', 'observe-active-deployment', 'wait-active', 'probe-ga']
    : ['snapshot-closed', 'prove-closed', 'update-spec', 'observe-active-deployment', 'wait-active', 'probe-closed'],
};
if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

function runDoctl(args, { input } = {}) {
  const timeoutMs = boundedInteger(process.env.SPLOOT_LIFECYCLE_DOCTL_TIMEOUT_MS, 30000, 120000);
  const result = spawnSync(doctlBinary, args, {
    encoding: 'utf8',
    input: input === undefined ? undefined : Buffer.from(input, 'utf8'),
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // Provider output is deliberately never copied into errors or receipts.
  if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGKILL') fail(`doctl ${args[1] || args[0]} timed out`);
  if (result.error || result.status !== 0) fail(`doctl ${args[1] || args[0]} failed`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail('DigitalOcean returned non-JSON output');
  }
}

async function runtimeProbe(expected) {
  const timeoutMs = boundedInteger(process.env.SPLOOT_LIFECYCLE_FETCH_TIMEOUT_MS, 10000, 30000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${deploymentUrl}/api/health/enrollment`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
  } catch {
    fail('runtime enrollment probe failed: request timed out or was unavailable');
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) fail(`runtime enrollment probe failed: http_status=${response.status}`);
  return assertPublicEnrollmentState(payload, expected);
}

const provider = createDeploymentProviderTransaction({
  appId,
  runDoctl,
  runtimeProbe,
});

async function main() {
  const current = provider.getApp();
  if (bootstrapBindings) {
    assertLegacyClosedSnapshot(current.spec);
    const activeDeployment = provider.getDeployment(current.activeDeploymentId);
    if (activeDeployment.phase !== 'ACTIVE') fail('active deployment snapshot is not active');
    assertDeploymentContents(activeDeployment, {
      deploymentId: current.activeDeploymentId,
      spec: current.spec,
      commit: deploymentWebSourceCommit(activeDeployment),
    });
    const snapshotReceipt = provider.snapshotDescriptor(current, activeDeployment);
    if (snapshotReceipt.sourceCommitHash !== commit) {
      fail('legacy binding bootstrap active source commit does not match --commit');
    }
    const bindingSpec = deriveLegacyBindingBootstrapSpec(current.spec, { marker, changeId });
    try {
      const result = await provider.apply({
        spec: bindingSpec,
        commit: snapshotReceipt.sourceCommitHash,
        expectedMode: 'closed',
        expectedMarker: marker,
        expectedChangeId: changeId,
        expectedAppId: current.appId,
        updateSources: false,
        validateSpec: assertSpecBindings,
        probeRuntime: false,
      });
      console.log(JSON.stringify({
        ok: true,
        mode: 'closed',
        bootstrapBindings: true,
        providerDeploymentId: result.providerDeploymentId,
        deploymentAppId: current.appId,
        deploymentChangeId: changeId,
        deploymentCommit: snapshotReceipt.sourceCommitHash,
      }, null, 2));
      return;
    } catch (error) {
      if (provider.mutationState() === 'idle') throw error;
      const receipt = provider.lastTarget();
      fail(`operator recovery required: legacy binding bootstrap may have mutated the provider${receipt ? ` at deployment ${receipt.providerDeploymentId}` : ' without returning a deployment identity'} (${error instanceof Error ? error.message : 'unknown lifecycle failure'})`);
    }
  }
  let legacyBootstrap = false;
  let snapshotInfo;
  try {
    snapshotInfo = assertClosedSnapshot(current.spec, { marker });
  } catch {
    if (mode !== 'closed') fail('GA lift is unavailable until a bound closed deployment has completed bootstrap');
    snapshotInfo = assertLegacyClosedSnapshot(current.spec);
    legacyBootstrap = true;
  }

  const activeDeployment = provider.getDeployment(current.activeDeploymentId);
  if (activeDeployment.phase !== 'ACTIVE') fail('active deployment snapshot is not active');
  assertDeploymentContents(activeDeployment, {
    deploymentId: current.activeDeploymentId,
    spec: current.spec,
    commit: deploymentWebSourceCommit(activeDeployment),
  });
  const snapshotReceipt = provider.snapshotDescriptor(current, activeDeployment);
  if (mode === 'ga' && (legacyBootstrap || current.activeDeploymentId !== closedDeploymentId)) {
    fail('the named closed deployment is not the exact active bound closed deployment');
  }
  if (!legacyBootstrap) {
    await runtimeProbe({
      mode: 'closed',
      appId: current.appId,
      changeId: snapshotInfo.changeId,
      marker,
      commit: snapshotReceipt.sourceCommitHash,
    });
  }

  // Every containment-era mutation (stage, GA, rollback) must keep platform
  // routing on the shallow liveness endpoint; only the legacy pre-bind path
  // above may leave an old runtime's probe untouched.
  const stageSpec = deriveClosedStageSpec(current.spec, specDocument);
  const stageValidate = assertRoutedSpecBindings;

  async function applyWithCompensation({
    spec,
    commit: specCommit,
    expectedMode,
    expectedChangeId: phaseChangeId,
    updateSources,
    rollbackSpec,
    rollbackCommit,
    rollbackChangeId,
    rollbackValidate,
    rollbackProbe,
    compensate,
  }) {
    const receiptBefore = provider.lastTarget();
    try {
      return await provider.apply({
        spec,
        commit: specCommit,
        expectedMode,
        expectedMarker: marker,
        expectedChangeId: phaseChangeId,
        expectedAppId: current.appId,
        updateSources,
        validateSpec: expectedMode === 'closed' ? stageValidate : assertRoutedSpecBindings,
        probeRuntime: true,
      });
    } catch (error) {
      const receiptAfter = provider.lastTarget();
      if (provider.mutationState() === 'idle') {
        fail(error instanceof Error ? error.message : 'lifecycle failed before mutation');
      }
      if (!receiptAfter || receiptAfter.providerDeploymentId === receiptBefore?.providerDeploymentId) {
        fail(`operator recovery required: provider mutation identity was not returned; inspect the exact deployment before recovery (${error instanceof Error ? error.message : 'unknown lifecycle failure'})`);
      }

      const preparedSpec = provider.lastPreparedSpec();
      if (!preparedSpec) fail('operator recovery required: provider mutation has no prepared spec authority');
      if (!compensate) {
        fail(`operator recovery required: closed source stage failed after an exact provider mutation; automatic source rollback is forbidden because the prior source commit cannot be pinned (${error instanceof Error ? error.message : 'unknown lifecycle failure'})`);
      }

      const live = provider.getApp();
      const inspectId = live.activeDeploymentId;
      if (live.inProgressDeploymentId || !inspectId) {
        fail(`operator recovery required: current provider state is not an exact active deployment (${error instanceof Error ? error.message : 'unknown lifecycle failure'})`);
      }
      const candidateDeployment = provider.getDeployment(inspectId);
      try {
        assertCompensationFence(live, candidateDeployment, {
          spec: preparedSpec,
          providerDeploymentId: receiptAfter.providerDeploymentId,
          sourceCommitHash: receiptAfter.sourceCommitHash,
          observed: true,
        });
      } catch (fenceError) {
        fail(`operator recovery required: ${fenceError instanceof Error ? fenceError.message : 'unknown provider state'}`);
      }

      try {
        const restored = await provider.apply({
          spec: rollbackSpec,
          commit: rollbackCommit,
          expectedMode: 'closed',
          expectedMarker: marker,
          expectedChangeId: rollbackChangeId,
          expectedAppId: current.appId,
          updateSources: false,
          validateSpec: rollbackValidate,
          probeRuntime: rollbackProbe,
        });
        if (!legacyBootstrap && (
          restored.readback?.configuration !== 'valid' ||
          restored.readback?.mode !== 'closed' ||
          restored.readback?.status !== 'paused'
        )) fail('compensation readback is not the valid paused public state');
      } catch (compensationError) {
        fail(`operator recovery required: closed compensation refused after ${error instanceof Error ? error.message : 'unknown lifecycle failure'}; ${compensationError instanceof Error ? compensationError.message : 'unknown provider state'}`);
      }

      fail(error instanceof Error ? error.message : 'lifecycle failed');
    }
  }

  const stageResult = await applyWithCompensation({
    spec: stageSpec,
    commit,
    expectedMode: 'closed',
    expectedChangeId: changeId,
    updateSources: true,
    compensate: false,
  });

  if (mode === 'closed') {
    console.log(JSON.stringify({
      ok: true,
      mode,
      providerDeploymentId: stageResult.providerDeploymentId,
      deploymentUrl,
      ...lifecycleReadback(stageResult.readback, { appId: current.appId, changeId, commit, marker }),
    }, null, 2));
    return;
  }

  const finalSpec = deriveGaLiftSpec(stageResult.app.spec);
  const stageReceipt = provider.lastTarget();
  if (!stageReceipt) fail('closed source stage did not return an exact identity receipt');

  const finalResult = await applyWithCompensation({
    spec: finalSpec,
    commit,
    expectedMode: 'ga',
    expectedChangeId: changeId,
    updateSources: false,
    rollbackSpec: stageSpec,
    rollbackCommit: stageReceipt.sourceCommitHash,
    rollbackChangeId: changeId,
    rollbackValidate: assertRoutedSpecBindings,
    rollbackProbe: !legacyBootstrap,
    compensate: true,
  });

  console.log(JSON.stringify({
    ok: true,
    mode,
    stagedProviderDeploymentId: stageResult.providerDeploymentId,
    providerDeploymentId: finalResult.providerDeploymentId,
    deploymentUrl,
    ...lifecycleReadback(finalResult.readback, { appId: current.appId, changeId, commit, marker }),
  }, null, 2));
}

main().catch((error) => {
  console.error(`Enrollment lifecycle refused: ${error instanceof Error ? error.message : 'unknown failure'}`);
  process.exit(1);
});
