import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it, vi } from 'vitest';
import {
  assertReadbackBinding,
  assertDeploymentContents,
  assertLegacyClosedSnapshot,
  assertSpecBindings,
  parseAppsGetResponse,
  parseAppsUpdateResponse,
  parseCreateDeploymentResponse,
  parseGetDeploymentResponse,
  deriveClosedStageSpec,
  deriveGaLiftSpec,
  deriveLegacyBindingBootstrapSpec,
  createDeploymentProviderTransaction,
  assertCompensationFence,
} from '../../scripts/deployment-provider-transaction.mjs';

const script = join(process.cwd(), 'scripts/enrollment-lifecycle.mjs');
const secretValue = 'EV[never-print-this-secret]';
const secretHash = createHash('sha256').update(secretValue).digest('hex');

const closedSpec = `
region: nyc3
instance_count: 1
routes:
- path: /
services:
- name: web
  github:
    repo: sploot/sploot
    branch: master
    deploy_on_push: true
  source_dir: null
  build_command: pnpm install --frozen-lockfile && pnpm --filter web build
  run_command: pnpm --filter web exec node scripts/migrate-deploy.mjs && pnpm --filter web start
  envs:
  - key: SPLOOT_ENROLLMENT_MODE
    value: closed
  - key: SPLOOT_DEPLOYMENT_ENV
    value: production
  - key: SPLOOT_DEPLOYMENT_APP_ID
    value: \'\${APP_ID}\'
  - key: SPLOOT_DEPLOYMENT_COMMIT
    value: \'\${_self.COMMIT_HASH}\'
  - key: SPLOOT_DEPLOYMENT_CHANGE_ID
    value: change-closed
  - key: DATABASE_URL
    type: SECRET
    value: EV[database-url-secret]
  - key: EV_TEST_SECRET
    value: EV[redacted-secret]
jobs:
- name: unrelated-job
  kind: SCHEDULED
  schedule:
    cron: 0 0 * * *
  envs:
  - key: JOB_SECRET
    value: EV[job-secret]
`;

const targetSpec = closedSpec
  .replace('value: closed', 'value: ga')
  .replace('value: change-closed', 'value: change-test');

function normalizeProviderSpec<T>(input: T): T {
  const spec = structuredClone(input) as Record<string, unknown>;
  for (const collection of ['services', 'jobs']) {
    for (const component of (spec[collection] as Array<Record<string, unknown>> | undefined) ?? []) {
      if (Array.isArray(component.envs)) {
        component.envs = component.envs.map((value) => {
          const entry = structuredClone(value) as Record<string, unknown>;
          if (entry.type === 'GENERAL') delete entry.type;
          return entry;
        });
      }
      const github = component.github as Record<string, unknown> | undefined;
      if (github?.deploy_on_push === false) delete github.deploy_on_push;
      if (component.name === 'web-pre-deploy-migrate') {
        component.instance_size_slug ??= 'apps-s-1vcpu-0.5gb';
        component.instance_count ??= 1;
      }
    }
  }
  return spec as T;
}

function appResponse(spec: unknown, activeDeploymentId: string, inProgressDeploymentId?: string) {
  return [{
    id: 'app-test',
    spec,
    active_deployment: { id: activeDeploymentId },
    ...(inProgressDeploymentId ? { in_progress_deployment: { id: inProgressDeploymentId } } : {}),
  }];
}

describe('strict DigitalOcean response contracts', () => {
  it('takes the active deployment from apps-get active_deployment, never the top-level app ID', () => {
    const parsed = parseAppsGetResponse(appResponse({ envs: [] }, 'provider-closed'));
    expect(parsed.appId).toBe('app-test');
    expect(parsed.activeDeploymentId).toBe('provider-closed');
    expect(parsed.activeDeploymentId).not.toBe(parsed.appId);
  });

  it.each([
    [],
    [{ id: 'one' }, { id: 'two' }],
    [{ id: 'app-test', active_deployment: { id: 'provider-closed' } }],
  ])('rejects malformed or multi-element apps-get response: %j', (value) => {
    expect(() => parseAppsGetResponse(value)).toThrow();
  });

  it('extracts the app spec only from an apps-get element and keeps create parsing separate', () => {
    const create = parseCreateDeploymentResponse([{ deployment: { id: 'provider-new' } }]);
    expect(create.deployment.id).toBe('provider-new');
    expect(() => parseCreateDeploymentResponse(appResponse({}, 'provider-new'))).toThrow();
  });

  it('parses the update response as a separate contract and composes the 036 stage patch', () => {
    const update = parseAppsUpdateResponse(appResponse(parseYaml(targetSpec), 'provider-stage', 'provider-stage'), 'app-test');
    expect(update.appId).toBe('app-test');
    const live = parseYaml(closedSpec);
    const staged = deriveClosedStageSpec(live, parseYaml(targetSpec));
    const web = staged.services.find((service: { name?: unknown }) => service.name === 'web') as
      | { run_command?: string; github?: { deploy_on_push?: boolean }; source_dir?: string | null; build_command?: string }
      | undefined;
    const job = staged.jobs.find((entry: { name?: unknown }) => entry.name === 'web-pre-deploy-migrate') as
      | { kind?: string; run_command?: string; github?: { deploy_on_push?: boolean }; source_dir?: string | null; build_command?: string; envs?: Array<{ key: string; value: string }> }
      | undefined;
    if (!web || !job) throw new Error('expected staged web service and migration job');
    expect(web.run_command).toBe('pnpm --filter web start');
    expect(web.github.deploy_on_push).toBe(false);
    expect(web.source_dir).toBeNull();
    expect(job.kind).toBe('PRE_DEPLOY');
    expect(job.run_command).toBe('pnpm --filter web exec node scripts/migrate-deploy.mjs');
    expect(job.github).toEqual(web.github);
    expect(job.source_dir).toBeNull();
    expect(job.build_command).toBe(
      'corepack enable && pnpm install --frozen-lockfile && pnpm --filter web exec prisma generate'
    );
    expect(job.build_command).not.toContain('web build');
    expect(job.build_command).not.toContain('next build');
    expect(job.envs).toEqual([expect.objectContaining({ key: 'DATABASE_URL' })]);
    const lifted = deriveGaLiftSpec(staged);
    expect((lifted.services.find((service: { name?: unknown }) => service.name === 'web') as { envs?: Array<{ key: string; value: string }> }).envs?.find((entry) => entry.key === 'SPLOOT_ENROLLMENT_MODE')?.value).toBe('ga');
    expect((lifted.services.find((service: { name?: unknown }) => service.name === 'web') as { github?: { deploy_on_push?: boolean } }).github?.deploy_on_push).toBe(false);
  });

  it('materializes deploy_on_push=false when a repository source omits the field', () => {
    const live = parseYaml(closedSpec);
    const operator = parseYaml(targetSpec);
    delete live.services[0].github.deploy_on_push;
    delete operator.services[0].github.deploy_on_push;
    const staged = deriveClosedStageSpec(live, operator);
    const lifted = deriveGaLiftSpec(staged);
    for (const spec of [staged, lifted]) {
      expect(spec.services.find((service: { name?: unknown }) => service.name === 'web').github.deploy_on_push).toBe(false);
      expect(spec.jobs.find((job: { name?: unknown }) => job.name === 'web-pre-deploy-migrate').github.deploy_on_push).toBe(false);
    }
  });

  it('adds missing legacy deployment bindings from the operator packet without changing unrelated live descriptors', () => {
    const live = parseYaml(closedSpec);
    const web = live.services.find((service: { name?: unknown }) => service.name === 'web');
    web.envs = web.envs.filter((entry: { key?: string }) => !entry.key?.startsWith('SPLOOT_DEPLOYMENT_'));
    const operator = parseYaml(targetSpec);
    const operatorWeb = operator.services.find((service: { name?: unknown }) => service.name === 'web');
    for (const entry of operatorWeb.envs) {
      if (entry.key?.startsWith('SPLOOT_DEPLOYMENT_')) {
        entry.scope = 'RUN_TIME';
        entry.type = 'GENERAL';
      }
    }

    const staged = deriveClosedStageSpec(live, operator);
    const stagedWeb = staged.services.find((service: { name?: unknown }) => service.name === 'web');
    for (const key of ['SPLOOT_DEPLOYMENT_ENV', 'SPLOOT_DEPLOYMENT_APP_ID', 'SPLOOT_DEPLOYMENT_COMMIT', 'SPLOOT_DEPLOYMENT_CHANGE_ID']) {
      expect(stagedWeb.envs.find((entry: { key?: string }) => entry.key === key)).toMatchObject({
        key,
        scope: 'RUN_TIME',
        type: 'GENERAL',
      });
    }
    expect(stagedWeb.envs.find((entry: { key?: string }) => entry.key === 'DATABASE_URL')).toEqual(
      web.envs.find((entry: { key?: string }) => entry.key === 'DATABASE_URL')
    );
  });

  it('pre-binds an old closed runtime without changing source, commands, jobs, routes, scaling, or secrets', () => {
    const live = parseYaml(closedSpec);
    const web = live.services.find((service: { name?: string }) => service.name === 'web');
    web.envs = web.envs.filter((entry: { key?: string }) => !entry.key?.startsWith('SPLOOT_DEPLOYMENT_'));
    const bootstrapped = deriveLegacyBindingBootstrapSpec(live, { marker: 'production', changeId: 'change-test' });
    const bootstrappedWeb = bootstrapped.services.find((service: { name?: string }) => service.name === 'web');
    const withoutBindings = structuredClone(bootstrapped);
    withoutBindings.services.find((service: { name?: string }) => service.name === 'web').envs =
      bootstrappedWeb.envs.filter((entry: { key?: string }) => !entry.key?.startsWith('SPLOOT_DEPLOYMENT_'));
    expect(withoutBindings).toEqual(live);
    expect(() => assertSpecBindings(bootstrapped, {
      mode: 'closed', marker: 'production', changeId: 'change-test',
    })).not.toThrow();
  });

  it('records an exact target receipt as soon as the deployment identity and contents are observed', async () => {
    const spec = parseYaml(targetSpec);
    let deploymentReads = 0;
    const transaction = createDeploymentProviderTransaction({
      appId: 'app-test',
      runDoctl(args: string[]) {
        if (args[1] === 'propose') return { spec };
        if (args[1] === 'update') return appResponse(spec, 'provider-closed', 'provider-stage');
        if (args[1] === 'get-deployment') {
          deploymentReads += 1;
          return [{
            id: 'provider-stage',
            phase: deploymentReads === 1 ? 'BUILDING' : 'FAILED',
            spec,
            services: [{ name: 'web', source_commit_hash: 'deadbeef' }],
          }];
        }
        return appResponse(parseYaml(closedSpec), 'provider-closed');
      },
      runtimeProbe: async () => undefined,
    });

    await expect(transaction.apply({
      spec,
      commit: 'deadbeef',
      expectedMode: 'closed',
      expectedMarker: 'production',
      expectedChangeId: 'change-test',
      expectedAppId: 'app-test',
      validateSpec: () => undefined,
      probeRuntime: false,
    })).rejects.toThrow('did not become active');
    expect(transaction.mutationState()).toBe('identity-known');
    expect(transaction.lastTarget()).toEqual({
      providerDeploymentId: 'provider-stage',
      sourceCommitHash: 'deadbeef',
    });
  });

  it.each([
    ['changed authored value', (spec: Record<string, any>) => {
      spec.services[0].run_command = 'unauthorized command';
      return { spec };
    }],
    ['default on the wrong component', (spec: Record<string, any>) => {
      spec.services[0].instance_count = 1;
      return { spec };
    }],
    ['missing proposal spec', () => ({})],
  ])('rejects an unauthorized or malformed provider proposal before mutation: %s', async (_label, proposal) => {
    const authored = parseYaml(targetSpec) as Record<string, any>;
    let updateCalls = 0;
    const transaction = createDeploymentProviderTransaction({
      appId: 'app-test',
      runDoctl(args: string[]) {
        if (args[1] === 'propose') return proposal(structuredClone(authored));
        if (args[1] === 'update') updateCalls += 1;
        throw new Error('provider mutation must not be reached');
      },
      runtimeProbe: async () => undefined,
    });

    await expect(transaction.apply({
      spec: authored,
      commit: 'deadbeef',
      expectedMode: 'ga',
      expectedMarker: 'production',
      expectedChangeId: 'change-test',
      expectedAppId: 'app-test',
    })).rejects.toThrow();
    expect(updateCalls).toBe(0);
    expect(transaction.mutationState()).toBe('idle');
  });

  it.each([
    ['region', (spec: Record<string, unknown>) => { spec.region = 'sfo3'; }],
    ['instance_count', (spec: Record<string, unknown>) => { spec.instance_count = 3; }],
    ['root env', (spec: Record<string, unknown>) => { spec.envs = [{ key: 'NEW_ROOT_ENV', value: '1' }]; }],
    ['route', (spec: Record<string, unknown>) => { spec.routes = [{ path: '/new' }]; }],
    ['job', (spec: Record<string, unknown>) => { (spec.jobs as Array<Record<string, unknown>>)[0].name = 'changed-job'; }],
    ['source', (spec: Record<string, unknown>) => { ((spec.services as Array<Record<string, unknown>>)[0]).github = { repo: 'evil/repo', branch: 'other', deploy_on_push: true }; }],
    ['autodeploy', (spec: Record<string, unknown>) => { ((spec.services as Array<Record<string, unknown>>)[0]).github = { ...(spec.services as Array<Record<string, unknown>>)[0].github as object, deploy_on_push: false }; }],
  ])('rejects operator deltas outside the closed allowlist for %s', (_label, mutate) => {
    const live = parseYaml(closedSpec);
    const poisoned = parseYaml(targetSpec) as Record<string, unknown>;
    mutate(poisoned);
    expect(() => deriveClosedStageSpec(live, poisoned)).toThrow();
  });

  it.each(['ACTIVE', 'ERROR', 'CANCELED'])('parses one-element get-deployment %s state', (phase) => {
    const parsed = parseGetDeploymentResponse([{ id: 'provider-new', phase, spec: { services: [] }, services: [{ name: 'web', source_commit_hash: 'deadbeef' }] }], 'provider-new');
    expect(parsed.phase).toBe(phase);
    expect(() => assertDeploymentContents(parsed, { deploymentId: 'provider-new', spec: { services: [] }, commit: 'deadbeef' })).not.toThrow();
  });

  it.each(['FAILED', 'ERROR', 'CANCELED', 'BUILDING'])('refuses compensation unless the exact target deployment is ACTIVE: %s', (phase) => {
    const spec = parseYaml(closedSpec);
    const current = { spec, activeDeploymentId: 'provider-target', inProgressDeploymentId: undefined };
    const deployment = {
      id: 'provider-target',
      phase,
      spec,
      sourceCommitHashes: [{ name: 'web', sourceCommitHash: 'deadbeef' }],
    };
    expect(() => assertCompensationFence(current, deployment, {
      spec,
      providerDeploymentId: 'provider-target',
      sourceCommitHash: 'deadbeef',
      observed: true,
    })).toThrow('unrelated provider mutation');
  });

  it.each([
    [],
    [{ id: 'provider-new', phase: 'ACTIVE', spec: {}, services: [] }, { id: 'provider-new', phase: 'ACTIVE', spec: {}, services: [] }],
    [{ id: 'other', phase: 'ACTIVE', spec: {}, services: [] }],
    [{ id: 'provider-new', phase: 'ACTIVE', spec: {}, services: [] }],
  ])('rejects malformed get-deployment response: %j', (value) => {
    expect(() => parseGetDeploymentResponse(value, 'provider-new')).toThrow();
  });

  it('rejects an active deployment with the wrong spec or source commit', () => {
    const parsed = parseGetDeploymentResponse([{
      id: 'provider-new', phase: 'ACTIVE', spec: { services: [{ name: 'web', envs: [] }] },
      services: [{ name: 'web', source_commit_hash: 'wrongcommit' }],
    }], 'provider-new');
    expect(() => assertDeploymentContents(parsed, {
      deploymentId: 'provider-new', spec: { services: [{ name: 'web', envs: [{ key: 'changed' }] }] }, commit: 'deadbeef',
    })).toThrow();
  });

  it('recognizes the read-only legacy closed bootstrap shape without allowing GA', () => {
    expect(assertLegacyClosedSnapshot({ services: [
      { name: 'web', envs: [
        { key: 'SPLOOT_ENROLLMENT_MODE', value: 'closed' },
        { key: 'EV_SECRET', value: 'EV[redacted]' },
      ] },
      { name: 'worker', envs: [{ key: 'UNRELATED', value: 'preserve' }] },
    ] })).toMatchObject({ legacy: true });
  });

  it('rejects unresolved, wrong, or stale provider bindings', () => {
    expect(() => assertSpecBindings({ envs: [
      { key: 'SPLOOT_ENROLLMENT_MODE', value: 'ga' },
      { key: 'SPLOOT_DEPLOYMENT_ENV', value: 'production' },
      { key: 'SPLOOT_DEPLOYMENT_APP_ID', value: 'app-test' },
      { key: 'SPLOOT_DEPLOYMENT_COMMIT', value: '${APP_ID}' },
      { key: 'SPLOOT_DEPLOYMENT_CHANGE_ID', value: 'old-change' },
    ] }, { mode: 'ga', marker: 'production', changeId: 'new-change' })).toThrow();
    expect(() => assertReadbackBinding({
      configuration: 'valid', mode: 'ga', gaLifted: true, acceptingNewAccounts: true,
      deploymentMarker: 'production', deploymentAppId: 'app-test', deploymentChangeId: 'old-change',
      deploymentCommit: 'deadbeef',
    }, { mode: 'ga', appId: 'app-test', changeId: 'new-change', marker: 'production', commit: 'deadbeef' })).toThrow();
  });

  it('resolves only the web component and rejects scope ambiguity', () => {
    const required = [
      { key: 'SPLOOT_ENROLLMENT_MODE', value: 'ga' },
      { key: 'SPLOOT_DEPLOYMENT_ENV', value: 'production' },
      { key: 'SPLOOT_DEPLOYMENT_APP_ID', value: '${APP_ID}' },
      { key: 'SPLOOT_DEPLOYMENT_COMMIT', value: '${_self.COMMIT_HASH}' },
      { key: 'SPLOOT_DEPLOYMENT_CHANGE_ID', value: 'change-test' },
    ];
    expect(() => assertSpecBindings({ services: [
      { name: 'web', envs: required.map((entry) => entry.key === 'SPLOOT_ENROLLMENT_MODE' ? { ...entry, value: 'closed' } : entry) },
      { name: 'worker', envs: required },
    ] }, { mode: 'ga', marker: 'production', changeId: 'change-test' })).toThrow();
    expect(() => assertSpecBindings({
      envs: [{ key: 'SPLOOT_ENROLLMENT_MODE', value: 'ga' }],
      services: [{ name: 'web', envs: required }],
    }, { mode: 'ga', marker: 'production', changeId: 'change-test' })).toThrow();
    expect(() => assertSpecBindings({ services: [{ name: 'worker', envs: required }] }, { mode: 'ga', marker: 'production', changeId: 'change-test' })).toThrow();
    expect(() => assertSpecBindings({ services: [
      { name: 'web', envs: required }, { name: 'web', envs: required },
    ] }, { mode: 'ga', marker: 'production', changeId: 'change-test' })).toThrow();
    expect(() => assertSpecBindings({ services: [{ name: 'web', envs: required.map((entry) => entry.key === 'SPLOOT_DEPLOYMENT_APP_ID' ? { ...entry, value: '${_self.COMMIT_HASH}' } : entry) }] }, { mode: 'ga', marker: 'production', changeId: 'change-test' })).toThrow();
  });
});

function writeFakeDoctl(directory: string, statePath: string): string {
  const fakePath = join(directory, 'fake-doctl.mjs');
  writeFileSync(fakePath, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
const statePath = process.env.FAKE_DOCTL_STATE;
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const normalizeProviderSpec = (input) => {
  const spec = structuredClone(input);
  for (const collection of ['services', 'jobs']) {
    for (const component of spec[collection] || []) {
      if (Array.isArray(component.envs)) component.envs = component.envs.map((value) => {
        const entry = structuredClone(value);
        if (entry.type === 'GENERAL') delete entry.type;
        return entry;
      });
      if (component.github?.deploy_on_push === false) delete component.github.deploy_on_push;
      if (component.name === 'web-pre-deploy-migrate') {
        component.instance_size_slug ??= 'apps-s-1vcpu-0.5gb';
        component.instance_count ??= 1;
      }
    }
  }
  return spec;
};
const withSecret = (spec) => ({ ...spec, services: spec.services.map((service) => {
  const envs = service.envs.map((entry) => entry.key === 'EV_TEST_SECRET'
    ? { ...entry, value: process.env.FAKE_SECRET }
    : entry);
  if (!envs.some((entry) => entry.key === 'EV_TEST_SECRET')) {
    envs.push({ key: 'EV_TEST_SECRET', value: process.env.FAKE_SECRET });
  }
  return { ...service, envs };
}) });
const args = process.argv.slice(2);
state.commands.push(args.join(' '));
if (args[0] !== 'apps') process.exit(2);
if (args[1] === 'create-deployment' || args[1] === 'exec') process.exit(3);
if (args[1] === 'propose') {
  const authored = JSON.parse(readFileSync(0, 'utf8'));
  const web = authored.services?.find((service) => service.name === 'web');
  const migration = authored.jobs?.find((job) => job.name === 'web-pre-deploy-migrate');
  const mode = web?.envs?.find((entry) => entry.key === 'SPLOOT_ENROLLMENT_MODE')?.value;
  if (!web || (!state.bootstrapBindings && (!migration || (mode === 'closed' && web.github?.deploy_on_push !== false)))) process.exit(9);
  process.stdout.write(JSON.stringify({ spec: normalizeProviderSpec(authored) }));
} else if (args[1] === 'get') {
  state.gets += 1;
  const active = state.unrelated
    ? 'provider-unrelated'
    : state.phase === 'final'
      ? 'provider-final'
      : state.phase === 'rollback'
        ? 'provider-rollback'
      : state.phase === 'stage'
        ? 'provider-stage'
        : 'provider-closed';
  const inProgress = state.preexistingInProgress && state.phase === 'closed' ? 'provider-existing' : undefined;
  const sourceSpec = state.unrelated
    ? { services: [{ name: 'web', envs: [{ key: 'UNRELATED', value: 'operator-change' }] }] }
    : state.phase === 'final'
      ? state.finalSpec
      : state.phase === 'rollback'
        ? state.stageSpec
      : state.phase === 'stage'
        ? state.stageSpec
        : state.closedSpec;
  const spec = state.unrelated ? sourceSpec : withSecret(sourceSpec);
  process.stdout.write(JSON.stringify([{ id: 'app-test', spec, active_deployment: { id: active }, ...(inProgress ? { in_progress_deployment: { id: inProgress } } : {}) }]));
} else if (args[1] === 'update') {
  state.updates += 1;
  const specIndex = args.indexOf('--spec');
  const specValue = args[specIndex + 1];
  const updateSources = args.includes('--update-sources');
  if (specValue !== '-') process.exit(4);
  state.commands.push('UPDATE_' + state.updates);
  const expectedPhase = state.updates === 1 ? 'stage' : state.updates === 2 ? 'final' : 'rollback';
  const updateSpec = expectedPhase === 'stage' ? state.stageSpec : expectedPhase === 'final' ? state.finalSpec : state.stageSpec;
  const suppliedSpec = JSON.parse(readFileSync(0, 'utf8'));
  if (!isDeepStrictEqual(suppliedSpec, withSecret(updateSpec))) process.exit(10);
  if (expectedPhase === 'stage' && state.bootstrapBindings === updateSources) process.exit(5);
  if (expectedPhase === 'final' && updateSources) process.exit(6);
  if (expectedPhase === 'rollback' && updateSources) process.exit(8);
  const updateDeployment = expectedPhase === 'stage' ? 'provider-stage' : expectedPhase === 'final' ? 'provider-final' : 'provider-rollback';
  const activeBefore = expectedPhase === 'stage' ? 'provider-closed' : expectedPhase === 'final' ? 'provider-stage' : 'provider-final';
  process.stdout.write(JSON.stringify([{ id: 'app-test', spec: withSecret(updateSpec), active_deployment: { id: activeBefore }, in_progress_deployment: { id: updateDeployment } }]));
  state.phase = expectedPhase;
  if (state.unrelatedAfterFinal && expectedPhase === 'final') state.unrelated = true;
  writeFileSync(statePath, JSON.stringify(state));
  if ((state.failAfterUpdateStage && expectedPhase === 'stage') || (state.failAfterUpdateFinal && expectedPhase === 'final')) process.exit(1);
} else if (args[1] === 'get-deployment') {
  const deploymentId = args[3];
  const phase = state.phase === 'stage' && state.failStageDeployment ? 'ERROR' : 'ACTIVE';
  const sourceSpec = state.unrelated
    ? state.unrelatedSpec
      : state.phase === 'final'
        ? state.finalSpec
        : state.phase === 'rollback'
          ? state.stageSpec
        : state.phase === 'stage'
          ? state.stageSpec
          : state.closedSpec;
  const spec = state.unrelated ? sourceSpec : withSecret(sourceSpec);
  const deploymentSpec = state.phase === 'final'
    ? state.finalSpec
    : state.phase === 'rollback'
      ? state.stageSpec
    : state.phase === 'stage'
      ? state.stageSpec
      : state.closedSpec;
  const sourceCommit = state.phase === 'closed' || state.bootstrapBindings ? 'cafebabe' : 'deadbeef';
  process.stdout.write(JSON.stringify([{ id: deploymentId, phase, spec: withSecret(deploymentSpec), services: [{ name: 'web', source_commit_hash: sourceCommit }] }]));
} else process.exit(2);
writeFileSync(statePath, JSON.stringify(state));
`);
  chmodSync(fakePath, 0o755);
  return fakePath;
}

async function runAppliedLifecycle(
  failureKind: 'stage-fail' | 'stage-response-lost' | 'stage-probe-fail' | 'final-response-lost' | 'final-probe-fail' | 'unrelated' | 'preexisting' | undefined = undefined,
  options: { bootstrapBindings?: boolean; commit?: string; legacyCurrent?: boolean; marker?: 'production' | 'staging'; mode?: 'closed' | 'ga'; spec?: string } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), 'sploot-enrollment-lifecycle-'));
  const specPath = join(directory, 'target.yaml');
  const statePath = join(directory, 'state.json');
  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'cert.pem');
  const operatorSpecText = options.spec ?? targetSpec;
  writeFileSync(specPath, operatorSpecText);
  const closedSpecObject = parseYaml(closedSpec);
  if (options.legacyCurrent) {
    const web = closedSpecObject.services.find((service: { name?: string }) => service.name === 'web');
    web.envs = web.envs.filter((entry: { key?: string }) => !entry.key?.startsWith('SPLOOT_DEPLOYMENT_'));
  }
  const targetSpecObject = parseYaml(operatorSpecText);
  const authoredStageSpec = deriveClosedStageSpec(closedSpecObject, targetSpecObject);
  const providerStageSpec = options.bootstrapBindings
    ? deriveLegacyBindingBootstrapSpec(closedSpecObject, { marker: options.marker ?? 'production', changeId: 'change-test' })
    : authoredStageSpec;
  writeFileSync(statePath, JSON.stringify({
    commands: [], gets: 0, updates: 0, phase: 'closed', unrelated: false, preexistingInProgress: failureKind === 'preexisting',
    bootstrapBindings: options.bootstrapBindings === true,
    failStageDeployment: failureKind === 'stage-fail',
    failAfterUpdateStage: failureKind === 'stage-response-lost',
    failAfterUpdateFinal: failureKind === 'final-response-lost',
    failStageProbe: failureKind === 'stage-probe-fail',
    failFinalProbe: failureKind === 'final-probe-fail' || failureKind === 'unrelated',
    unrelatedAfterFinal: failureKind === 'unrelated',
    closedSpec: closedSpecObject,
    stageSpec: normalizeProviderSpec(providerStageSpec),
    finalSpec: normalizeProviderSpec(deriveGaLiftSpec(normalizeProviderSpec(authoredStageSpec))),
    targetSpec: targetSpecObject,
    unrelatedSpec: { services: [{ name: 'web', envs: [{ key: 'UNRELATED', value: 'operator-change' }] }] },
  }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1'], { stdio: 'ignore' });
  const fakeDoctl = writeFakeDoctl(directory, statePath);
  let probeCount = 0;
  const server = createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, (request, response) => {
    probeCount += 1;
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const target = state.phase === 'final';
    if ((state.failFinalProbe && target) || (state.failStageProbe && state.phase === 'stage')) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ configuration: 'valid', mode: 'ga', gaLifted: true, acceptingNewAccounts: true, deploymentMarker: 'production', deploymentAppId: 'app-test', deploymentChangeId: 'change-test', deploymentCommit: 'deadbeef', accountCount: 1 }));
      return;
    }
    const snapshot = {
      configuration: 'valid',
      mode: target ? 'ga' : 'closed',
      gaLifted: target,
      acceptingNewAccounts: target,
      deploymentMarker: 'production',
      deploymentAppId: 'app-test',
      deploymentChangeId: state.phase === 'closed' ? 'change-closed' : 'change-test',
      deploymentCommit: state.phase === 'closed' ? 'cafebabe' : 'deadbeef',
      accountCount: 1,
    };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(snapshot));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not bind');
  const child = spawn(process.execPath, [script, '--mode', options.mode ?? 'ga', '--app-id', 'app-test', '--spec', specPath,
    '--url', `https://127.0.0.1:${address.port}`, '--marker', options.marker ?? 'production', '--commit', options.commit ?? (options.bootstrapBindings ? 'cafebabe' : 'deadbeef'), '--change-id', 'change-test',
    '--closed-deployment-id', 'provider-closed', ...(options.bootstrapBindings ? ['--bootstrap-bindings'] : []), '--apply'], {
    env: { ...process.env, DOCTL_BIN: fakeDoctl, FAKE_DOCTL_STATE: statePath,
      NODE_TLS_REJECT_UNAUTHORIZED: '0', FAKE_SECRET: 'EV[never-print-this-secret]', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
      SPLOOT_LIFECYCLE_POLL_ATTEMPTS: '2', SPLOOT_LIFECYCLE_POLL_DELAY_MS: '0' },
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  const status = await new Promise<number>((resolve) => child.on('close', (code) => resolve(code ?? 1)));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  rmSync(directory, { recursive: true, force: true });
  return { result: { status, stdout, stderr }, state, probeCount };
}

// These cases launch a real Node child, OpenSSL, a local HTTPS server, and a
// fake provider CLI. Five seconds is below the observed cold-start time on
// the CI-sized runner, so keep the command-graph oracle while giving the
// subprocess harness a deterministic budget.
vi.setConfig({ testTimeout: 15_000 });
describe('enrollment lifecycle command graph', () => {
  it('dry-runs only an explicit closed or GA action and requires provider bindings', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sploot-enrollment-dry-run-'));
    const specPath = join(directory, 'app-spec.yaml');
    writeFileSync(specPath, closedSpec);
    const result = spawnSync(process.execPath, [script, '--mode', 'closed', '--app-id', 'app-test', '--spec', specPath,
      '--url', 'https://deploy.example.test', '--marker', 'production', '--commit', 'deadbeef', '--change-id', 'change-closed'], { encoding: 'utf8' });
    rmSync(directory, { recursive: true, force: true });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ dryRun: true, mode: 'closed' });
  });

  it('uses one update transaction, never unsupported exec or a second create-deployment, and records provider ID separately', async () => {
    const { result, state } = await runAppliedLifecycle();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      stagedProviderDeploymentId: 'provider-stage',
      providerDeploymentId: 'provider-final',
      deploymentAppId: 'app-test',
      deploymentChangeId: 'change-test',
    });
    expect(state.commands.some((command: string) => command.includes('create-deployment') || command.includes(' exec '))).toBe(false);
    expect(state.commands.filter((command: string) => command.startsWith('apps update')).length).toBe(2);
    expect(state.commands.some((command: string) => command.includes('/dev/stdin'))).toBe(false);
    expect(state.commands.some((command: string) => command.includes('--spec -'))).toBe(true);
    expect(state.commands.filter((command: string) => command.includes('--update-sources')).length).toBe(1);
    expect(result.stdout).not.toContain(secretValue);
    expect(result.stderr).not.toContain(secretValue);
    expect(JSON.stringify(state)).not.toContain(secretValue);
    expect(result.stdout).not.toContain(secretHash);
    expect(result.stderr).not.toContain(secretHash);
    expect(JSON.stringify(state)).not.toContain(secretHash);
  }, 30_000);

  it('stops with an operator recovery packet when the staged source response is lost', async () => {
    const { result, state } = await runAppliedLifecycle('stage-response-lost');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Enrollment lifecycle refused');
    expect(state.commands.some((command: string) => command.includes('create-deployment') || command.includes(' exec '))).toBe(false);
    expect(result.stderr).toContain('provider mutation identity was not returned');
    expect(state.commands.filter((command: string) => command.startsWith('apps update')).length).toBe(1);
    expect(result.stderr).not.toContain(secretValue);
    expect(result.stderr).not.toContain(secretHash);
  });

  it('refuses compensation over a staged deployment that reached ERROR', async () => {
    const { result, state } = await runAppliedLifecycle('stage-fail');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('operator recovery required');
    expect(result.stderr).toContain('automatic source rollback is forbidden');
    expect(state.commands.filter((command: string) => command.startsWith('apps update')).length).toBe(1);
  });

  it('does not issue a false old-commit rollback when the closed source-stage probe fails', async () => {
    const { result, state } = await runAppliedLifecycle('stage-probe-fail');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('automatic source rollback is forbidden');
    expect(result.stderr).toContain('http_status=503');
    expect(state.commands.filter((command: string) => command.startsWith('apps update')).length).toBe(1);
  });

  it('never downgrades a bound snapshot mismatch to legacy bootstrap', async () => {
    const stagingSpec = targetSpec.replace('value: ga', 'value: closed').replace('value: production', 'value: staging');
    const { result, state } = await runAppliedLifecycle(undefined, { marker: 'staging', mode: 'closed', spec: stagingSpec });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('legacy bootstrap requires all deployment identity bindings to be absent');
    expect(state.commands.filter((command: string) => command.startsWith('apps update')).length).toBe(0);
  });

  it('bootstraps an actually unbound legacy closed snapshot into a bound closed deployment', async () => {
    const closedTarget = targetSpec.replace('value: ga', 'value: closed');
    const { result, state } = await runAppliedLifecycle(undefined, { legacyCurrent: true, mode: 'closed', spec: closedTarget });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, mode: 'closed', providerDeploymentId: 'provider-stage' });
    expect(state.commands.filter((command: string) => command.startsWith('apps update')).length).toBe(1);
  });

  it('pre-binds an old closed runtime without updating source or probing an endpoint it does not have', async () => {
    const { result, state, probeCount } = await runAppliedLifecycle(undefined, {
      bootstrapBindings: true, legacyCurrent: true, mode: 'closed',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, mode: 'closed', bootstrapBindings: true });
    expect(state.commands.filter((command: string) => command.startsWith('apps update')).length).toBe(1);
    expect(state.commands.some((command: string) => command.includes('--update-sources'))).toBe(false);
    expect(probeCount).toBe(0);
  });

  it('refuses a stale pre-bind commit before provider mutation', async () => {
    const { result, state, probeCount } = await runAppliedLifecycle(undefined, {
      bootstrapBindings: true, commit: 'badc0de', legacyCurrent: true, mode: 'closed',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('active source commit does not match --commit');
    expect(state.commands.filter((command: string) => command.startsWith('apps update')).length).toBe(0);
    expect(probeCount).toBe(0);
  });

  it('refuses a preexisting in-progress deployment before any provider mutation', async () => {
    const { result, state } = await runAppliedLifecycle('preexisting');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('preexisting in-progress deployment prevents mutation');
    expect(state.commands.filter((command: string) => command.startsWith('apps update')).length).toBe(0);
  });

  it('stops with an operator recovery packet when the GA lift response is lost', async () => {
    const { result, state } = await runAppliedLifecycle('final-response-lost');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Enrollment lifecycle refused');
    expect(result.stderr).toContain('provider mutation identity was not returned');
    expect(state.commands.filter((command: string) => command.startsWith('apps update')).length).toBe(2);
    expect(result.stderr).not.toContain(secretValue);
    expect(result.stderr).not.toContain(secretHash);
  });

  it('compensates when the final GA probe fails and the live target still matches the recorded receipt', async () => {
    const { result, state } = await runAppliedLifecycle('final-probe-fail');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Enrollment lifecycle refused');
    expect(state.commands.filter((command: string) => command.startsWith('apps update')).length, result.stderr).toBe(3);
    expect(result.stderr).toContain('runtime enrollment probe failed: http_status=503');
    expect(result.stderr).not.toContain('compensation refused');
    expect(state.phase).toBe('rollback');
    expect(result.stderr).not.toContain(secretValue);
    expect(result.stderr).not.toContain(secretHash);
  }, 30_000);

  it('refuses stale compensation after an unrelated provider mutation', async () => {
    const { result, state } = await runAppliedLifecycle('unrelated');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('operator recovery required');
    expect(state.commands.filter((command: string) => command.startsWith('apps update')).length).toBe(2);
    expect(result.stderr).not.toContain(secretValue);
    expect(result.stderr).not.toContain(secretHash);
  }, 10000);
});
