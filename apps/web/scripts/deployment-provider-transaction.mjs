import { isDeepStrictEqual } from 'node:util';

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CHANGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const WEB_SERVICE_NAME = 'web';
// Platform routing must target the shallow process-liveness endpoint, never
// the deep DB-backed readiness oracle (/api/health). Incident 2026-07-15:
// routing the only web instance on deep health turned a database stall into
// no_healthy_upstream for the whole origin.
export const LIVENESS_HEALTH_PATH = '/api/health/live';
const MIGRATION_JOB_NAME = 'web-pre-deploy-migrate';
const MIGRATION_JOB_KIND = 'PRE_DEPLOY';
const SERVICE_RUN_COMMAND = 'pnpm --filter web start';
const MIGRATION_BUILD_COMMAND = 'corepack enable && pnpm install --frozen-lockfile && pnpm --filter web exec prisma generate';
const MIGRATION_RUN_COMMAND = 'pnpm --filter web exec node scripts/migrate-deploy.mjs';
const SOURCE_KEYS = ['github', 'git', 'image'];
const CLOSED_ALLOWLIST_BINDINGS = new Set([
  'SPLOOT_ENROLLMENT_MODE',
  'SPLOOT_DEPLOYMENT_ENV',
  'SPLOOT_DEPLOYMENT_APP_ID',
  'SPLOOT_DEPLOYMENT_COMMIT',
  'SPLOOT_DEPLOYMENT_CHANGE_ID',
]);
const REQUIRED_WEB_KEYS = [
  'SPLOOT_ENROLLMENT_MODE',
  'SPLOOT_DEPLOYMENT_ENV',
  'SPLOOT_DEPLOYMENT_APP_ID',
  'SPLOOT_DEPLOYMENT_COMMIT',
  'SPLOOT_DEPLOYMENT_CHANGE_ID',
];

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function singleArray(value, label) {
  if (!Array.isArray(value) || value.length !== 1) throw new Error(`${label} must be a one-element array`);
  return object(value[0], `${label}[0]`);
}

function requiredId(value, label) {
  if (typeof value !== 'string' || !PROVIDER_ID_PATTERN.test(value.trim())) throw new Error(`${label} must be a nonempty provider ID`);
  return value.trim();
}

function deployment(value, label) {
  const item = object(value, label);
  return { ...item, id: requiredId(item.id, `${label}.id`) };
}

function clone(value) {
  return structuredClone(value);
}

function assertProviderNormalization(authored, proposed, path = 'spec') {
  if (isDeepStrictEqual(authored, proposed)) return;
  if (Array.isArray(authored) || Array.isArray(proposed)) {
    if (!Array.isArray(authored) || !Array.isArray(proposed) || authored.length !== proposed.length) {
      throw new Error(`DigitalOcean proposal changed the authored structure at ${path}`);
    }
    for (let index = 0; index < authored.length; index += 1) {
      assertProviderNormalization(authored[index], proposed[index], `${path}[${index}]`);
    }
    return;
  }
  if (authored && proposed && typeof authored === 'object' && typeof proposed === 'object') {
    for (const key of Object.keys(authored)) {
      const providerCanonicalOmission =
        (key === 'type' && path.includes('.envs[') && authored[key] === 'GENERAL' && proposed[key] === undefined) ||
        (key === 'deploy_on_push' && path.endsWith('.github') && authored[key] === false && proposed[key] === undefined);
      if (!providerCanonicalOmission) {
        assertProviderNormalization(authored[key], proposed[key], `${path}.${key}`);
      }
    }
    for (const key of Object.keys(proposed)) {
      if (Object.prototype.hasOwnProperty.call(authored, key)) continue;
      const migrationDefault = authored.name === MIGRATION_JOB_NAME && (
        (key === 'instance_count' && proposed[key] === 1) ||
        (key === 'instance_size_slug' && typeof proposed[key] === 'string' && proposed[key].length > 0)
      );
      if (!migrationDefault) throw new Error(`DigitalOcean proposal added an unauthorized field at ${path}.${key}`);
    }
    return;
  }
  throw new Error(`DigitalOcean proposal changed an authored value at ${path}`);
}

function componentByName(spec, collection, name) {
  const components = spec?.[collection];
  if (!Array.isArray(components)) throw new Error(`spec is missing ${collection}`);
  const matches = components.filter((component) => component && typeof component === 'object' && component.name === name);
  if (matches.length > 1) throw new Error(`spec has duplicate ${collection} component: ${name}`);
  return matches[0] ?? null;
}

function envList(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label}.envs must be an array`);
  const entries = [];
  for (const [index, item] of value.entries()) {
    const entry = object(item, `${label}.envs[${index}]`);
    if (typeof entry.key !== 'string' || entry.key.trim() === '') throw new Error(`${label}.envs[${index}].key is required`);
    if (typeof entry.value !== 'string') throw new Error(`${label}.envs[${index}].value must be a string`);
    entries.push({ key: entry.key.trim(), value: entry.value });
  }
  return entries;
}

function uniqueEntries(entries, label) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.key)) throw new Error(`duplicate environment key in ${label}: ${entry.key}`);
    seen.add(entry.key);
  }
  return entries;
}

function webEntries(spec) {
  return webEnvironment(spec).webEntries;
}

function allowlistedClosedOperatorSpec(liveSpec, operatorSpec) {
  const live = clone(liveSpec);
  const candidate = clone(operatorSpec);
  const liveWeb = componentByName(live, 'services', WEB_SERVICE_NAME);
  const candidateWeb = componentByName(candidate, 'services', WEB_SERVICE_NAME);
  if (!liveWeb || !candidateWeb) throw new Error('spec must contain exactly one services[name=web] component');
  const liveBindings = Array.isArray(liveWeb.envs) ? liveWeb.envs : [];
  const candidateBindings = Array.isArray(candidateWeb.envs) ? candidateWeb.envs : [];
  uniqueEntries(envList(liveBindings, 'live services[name=web]'), 'live services[name=web]');
  uniqueEntries(envList(candidateBindings, 'operator services[name=web]'), 'operator services[name=web]');
  const candidateMap = new Map(candidateBindings
    .filter((entry) => entry && typeof entry === 'object' && CLOSED_ALLOWLIST_BINDINGS.has(entry.key))
    .map((entry) => [entry.key, clone(entry)]));
  for (const key of CLOSED_ALLOWLIST_BINDINGS) {
    if (!candidateMap.has(key)) throw new Error(`operator spec is missing required web binding: ${key}`);
  }

  // The operator packet may add or replace only the five deployment bindings.
  // Compare the full provider document after removing those entries so source,
  // routing, scaling, jobs, unrelated env descriptors, and secret references
  // remain byte-for-byte structural authority from the live snapshot.
  liveWeb.envs = liveBindings.filter((entry) => !CLOSED_ALLOWLIST_BINDINGS.has(entry?.key));
  // Non-allowlisted operator env values are deliberately not compared: a
  // checked-in packet cannot reproduce provider-encrypted values safely and,
  // more importantly, has no authority over them. The derived stage below
  // always retains these exact entries from the live snapshot.
  candidateWeb.envs = clone(liveWeb.envs);
  const normalizedCandidate = clone(candidate);
  if (!isDeepStrictEqual(normalizedCandidate, live)) {
    throw new Error('operator spec contains unsupported deltas outside the closed allowlist');
  }

  return candidateMap;
}

function promoteClosedStageSpecToGa(stageSpec) {
  const next = clone(stageSpec);
  const web = componentByName(next, 'services', WEB_SERVICE_NAME);
  if (!web || !Array.isArray(web.envs)) throw new Error('closed stage is missing the web service envs');
  const modeEntry = web.envs.find((entry) => entry && typeof entry === 'object' && entry.key === 'SPLOOT_ENROLLMENT_MODE');
  if (!modeEntry) throw new Error('closed stage is missing SPLOOT_ENROLLMENT_MODE');
  modeEntry.value = 'ga';
  return next;
}

/** Resolve the effective runtime environment from the named web service. */
export function webEnvironment(spec) {
  const root = object(spec, 'spec');
  const services = root.services;
  if (!Array.isArray(services) || services.length === 0) throw new Error('spec must contain services');
  const webServices = services.filter((service) => service && typeof service === 'object' && service.name === WEB_SERVICE_NAME);
  if (webServices.length !== 1) throw new Error('spec must contain exactly one services[name=web] component');
  const web = object(webServices[0], 'services[name=web]');
  const appEntries = root.envs === undefined ? [] : envList(root.envs, 'app');
  const webEntries = envList(web.envs, 'services[name=web]');
  uniqueEntries(appEntries, 'app');
  uniqueEntries(webEntries, 'services[name=web]');
  const webKeys = new Set(webEntries.map((entry) => entry.key));
  for (const entry of appEntries) {
    if (webKeys.has(entry.key)) throw new Error(`duplicate applicable environment key across app and web: ${entry.key}`);
  }
  const effective = new Map([...appEntries, ...webEntries].map((entry) => [entry.key, entry.value]));
  for (const key of REQUIRED_WEB_KEYS) {
    if (!webKeys.has(key)) throw new Error(`services[name=web] is missing ${key}`);
  }
  return { appEntries, webEntries, effective, web };
}

export function productionSourceDescriptor(spec) {
  const web = componentByName(spec, 'services', WEB_SERVICE_NAME);
  if (!web) throw new Error('live DO spec is missing the web service');
  const sources = SOURCE_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(web, key) && web[key] !== null && web[key] !== undefined);
  if (sources.length !== 1) throw new Error(`live DO web service must have exactly one source descriptor; found ${sources.length}`);
  if (typeof web.build_command !== 'string' || web.build_command.length === 0) {
    throw new Error('live DO web service is missing its production build_command');
  }
  return {
    source_key: sources[0],
    source: clone(web[sources[0]]),
    source_dir_present: Object.prototype.hasOwnProperty.call(web, 'source_dir'),
    source_dir: web.source_dir ?? null,
    build_command: web.build_command,
  };
}

function applySourceDescriptor(component, descriptor) {
  for (const key of SOURCE_KEYS) delete component[key];
  const source = clone(descriptor.source);
  if (descriptor.source_key === 'github' && source && typeof source === 'object') {
    source.deploy_on_push = false;
  }
  component[descriptor.source_key] = source;
  if (descriptor.source_dir_present) component.source_dir = descriptor.source_dir;
  else delete component.source_dir;
  component.build_command = descriptor.build_command;
}

function webDatabaseBinding(spec) {
  const web = componentByName(spec, 'services', WEB_SERVICE_NAME);
  if (!web || !Array.isArray(web.envs)) throw new Error('live DO web service is missing envs');
  const matches = web.envs.filter((env) => env?.key === 'DATABASE_URL');
  if (matches.length !== 1) throw new Error('live DO web service must expose exactly one DATABASE_URL binding');
  const binding = matches[0];
  if (!binding || binding.type !== 'SECRET' || !Object.prototype.hasOwnProperty.call(binding, 'value') || binding.value === '') {
    throw new Error('live DO web service DATABASE_URL binding must be an encrypted secret');
  }
  return clone(binding);
}

function declaredString(env, key) {
  const value = env.get(key);
  return typeof value === 'string' ? value.trim() : undefined;
}

export function assertSpecBindings(spec, { mode, marker, changeId }) {
  const { effective } = webEnvironment(spec);
  if (declaredString(effective, 'SPLOOT_ENROLLMENT_MODE') !== mode) throw new Error('web spec enrollment mode binding mismatch');
  if (declaredString(effective, 'SPLOOT_DEPLOYMENT_ENV') !== marker) throw new Error('web spec deployment marker binding mismatch');
  if (declaredString(effective, 'SPLOOT_DEPLOYMENT_APP_ID') !== '${APP_ID}') throw new Error('web spec must bind app identity to ${APP_ID}');
  if (declaredString(effective, 'SPLOOT_DEPLOYMENT_COMMIT') !== '${_self.COMMIT_HASH}') throw new Error('web spec must bind commit to ${_self.COMMIT_HASH}');
  if (declaredString(effective, 'SPLOOT_DEPLOYMENT_CHANGE_ID') !== changeId || !CHANGE_ID_PATTERN.test(changeId)) throw new Error('web spec deployment change ID binding mismatch');
  return effective;
}

/** Require the web service to route platform health on the liveness probe. */
export function assertWebLivenessRouting(spec) {
  const { web } = webEnvironment(spec);
  const healthCheck = web.health_check;
  if (!healthCheck || typeof healthCheck !== 'object' || Array.isArray(healthCheck) || healthCheck.http_path !== LIVENESS_HEALTH_PATH) {
    throw new Error(`services[name=web].health_check.http_path must be ${LIVENESS_HEALTH_PATH}`);
  }
}

/**
 * Binding oracle for every containment-era mutation (closed stage, GA lift,
 * rollback compensation): deployment identity bindings plus liveness routing.
 * The plain assertSpecBindings remains for the legacy pre-bind path, whose
 * old runtime cannot serve the liveness route yet.
 */
export function assertRoutedSpecBindings(spec, context) {
  const effective = assertSpecBindings(spec, context);
  assertWebLivenessRouting(spec);
  return effective;
}

export function assertClosedSnapshot(spec, { marker }) {
  const { effective } = webEnvironment(spec);
  if (declaredString(effective, 'SPLOOT_ENROLLMENT_MODE') !== 'closed') throw new Error('active snapshot is not closed');
  assertSpecBindings(spec, { mode: 'closed', marker, changeId: declaredString(effective, 'SPLOOT_DEPLOYMENT_CHANGE_ID') || '' });
  return {
    changeId: declaredString(effective, 'SPLOOT_DEPLOYMENT_CHANGE_ID'),
  };
}

/** Bootstrap oracle for a pre-containment production deployment. */
export function assertLegacyClosedSnapshot(spec) {
  const root = object(spec, 'legacy app spec');
  if (!Array.isArray(root.services) || root.services.length === 0) throw new Error('legacy bootstrap requires services');
  const webServices = root.services.filter((service) => service && typeof service === 'object' && service.name === 'web');
  if (webServices.length !== 1) throw new Error('legacy bootstrap requires exactly one web service');
  const entries = envList(webServices[0].envs, 'legacy services[name=web]');
  uniqueEntries(entries, 'legacy services[name=web]');
  const rootEntries = root.envs === undefined ? [] : envList(root.envs, 'legacy app');
  uniqueEntries(rootEntries, 'legacy app');
  const presentDeploymentBindings = [...rootEntries, ...entries].filter((entry) => CLOSED_ALLOWLIST_BINDINGS.has(entry.key));
  if (presentDeploymentBindings.some((entry) => entry.key !== 'SPLOOT_ENROLLMENT_MODE')) {
    throw new Error('legacy bootstrap requires all deployment identity bindings to be absent');
  }
  const values = new Map(entries.map((entry) => [entry.key, entry.value]));
  if (declaredString(values, 'SPLOOT_ENROLLMENT_MODE') !== 'closed') throw new Error('legacy bootstrap requires SPLOOT_ENROLLMENT_MODE=closed');
  return { legacy: true, changeId: undefined };
}

/**
 * Install only the deployment identity bindings needed by the new runtime.
 * This deliberately leaves source, commands, jobs, routes, scaling, secrets,
 * and every unrelated environment descriptor under live-provider authority so
 * an old runtime can be prepared before the code that reads these bindings is
 * deployed.
 */
export function deriveLegacyBindingBootstrapSpec(liveSpec, { marker, changeId }) {
  assertLegacyClosedSnapshot(liveSpec);
  if (!['production', 'staging'].includes(marker)) throw new Error('legacy binding bootstrap marker is invalid');
  if (typeof changeId !== 'string' || !CHANGE_ID_PATTERN.test(changeId)) throw new Error('legacy binding bootstrap change ID is invalid');
  const next = clone(liveSpec);
  const web = componentByName(next, 'services', WEB_SERVICE_NAME);
  if (!web || !Array.isArray(web.envs)) throw new Error('legacy binding bootstrap requires web envs');
  const bindings = [
    ['SPLOOT_DEPLOYMENT_ENV', marker],
    ['SPLOOT_DEPLOYMENT_APP_ID', '${APP_ID}'],
    ['SPLOOT_DEPLOYMENT_COMMIT', '${_self.COMMIT_HASH}'],
    ['SPLOOT_DEPLOYMENT_CHANGE_ID', changeId],
  ];
  for (const [key, value] of bindings) {
    web.envs.push({ key, value, scope: 'RUN_TIME', type: 'GENERAL' });
  }
  assertSpecBindings(next, { mode: 'closed', marker, changeId });
  return next;
}

/** Exact doctl apps get --output json contract. */
export function parseAppsGetResponse(value) {
  const app = singleArray(value, 'doctl apps get response');
  const active = deployment(app.active_deployment, 'active_deployment');
  const spec = object(app.spec, 'spec');
  const inProgress = app.in_progress_deployment === undefined ? undefined : deployment(app.in_progress_deployment, 'in_progress_deployment');
  return { app, appId: requiredId(app.id, 'app.id'), activeDeploymentId: active.id, inProgressDeploymentId: inProgress?.id, spec };
}

/** Exact doctl apps update --output json contract. */
export function parseAppsUpdateResponse(value, expectedAppId) {
  const parsed = parseAppsGetResponse(value);
  if (parsed.appId !== expectedAppId) throw new Error('apps update response app ID does not match the requested app');
  return parsed;
}

export function parseAppsProposalResponse(value) {
  const response = object(value, 'apps propose response');
  return { spec: object(response.spec, 'apps propose response.spec') };
}

/** Exact create shape retained for provider-contract fixtures; lifecycle does not call it. */
export function parseCreateDeploymentResponse(value) {
  const response = singleArray(value, 'doctl apps create-deployment response');
  return { deployment: deployment(response.deployment, 'deployment') };
}

/** Exact doctl apps get-deployment contract, including deployment-specific spec/source. */
export function parseGetDeploymentResponse(value, expectedId) {
  const response = singleArray(value, 'doctl apps get-deployment response');
  const id = requiredId(response.id, 'deployment.id');
  if (id !== expectedId) throw new Error('get-deployment response ID does not match the observed deployment');
  if (typeof response.phase !== 'string' || response.phase.trim() === '') throw new Error('deployment.phase must be present');
  const spec = object(response.spec, 'deployment.spec');
  if (!Array.isArray(response.services) || response.services.length === 0) throw new Error('deployment.services must be a nonempty array');
  const sourceCommitHashes = response.services.map((service, index) => {
    const item = object(service, `deployment.services[${index}]`);
    if (typeof item.source_commit_hash !== 'string' || item.source_commit_hash.trim() === '') throw new Error(`deployment.services[${index}].source_commit_hash is required`);
    return { name: typeof item.name === 'string' ? item.name : undefined, sourceCommitHash: item.source_commit_hash.trim() };
  });
  return { id, phase: response.phase.trim().toUpperCase(), spec, sourceCommitHashes };
}

export function deploymentIdAfterUpdate(before, after) {
  if (after.inProgressDeploymentId) {
    if (after.inProgressDeploymentId === after.activeDeploymentId) throw new Error('active and in-progress deployments are ambiguous');
    return after.inProgressDeploymentId;
  }
  if (after.activeDeploymentId !== before.activeDeploymentId) return after.activeDeploymentId;
  return undefined;
}

export function assertDeploymentContents(deploymentResponse, { deploymentId, spec, commit }) {
  if (deploymentResponse.id !== deploymentId) throw new Error('deployment response ID mismatch');
  if (!isDeepStrictEqual(deploymentResponse.spec, spec)) throw new Error('observed deployment spec does not equal intended spec');
  const webSources = deploymentResponse.sourceCommitHashes.filter((item) => item.name === undefined || item.name === 'web');
  if (webSources.length !== 1 || webSources[0].sourceCommitHash !== commit) throw new Error('observed deployment web source commit does not equal requested commit');
}

export function assertReadbackBinding(payload, { mode, appId, changeId, marker, commit }) {
  const mismatches = [];
  if (!payload || typeof payload !== 'object') mismatches.push('missing_json');
  if (payload?.configuration !== 'valid') mismatches.push('configuration_invalid');
  if (payload?.mode !== mode) mismatches.push('mode_mismatch');
  if (payload?.gaLifted !== (mode === 'ga')) mismatches.push('gaLifted_mismatch');
  if (payload?.acceptingNewAccounts !== (mode === 'ga')) mismatches.push('acceptingNewAccounts_mismatch');
  if (payload?.deploymentMarker !== marker) mismatches.push('deploymentMarker_mismatch');
  if (payload?.deploymentAppId !== appId) mismatches.push('deploymentAppId_mismatch');
  if (payload?.deploymentChangeId !== changeId) mismatches.push('deploymentChangeId_mismatch');
  if (payload?.deploymentCommit !== commit) mismatches.push('deploymentCommit_mismatch');
  if (mismatches.length) throw new Error(`runtime enrollment probe failed: ${mismatches.join(',')}`);
  return payload;
}

export function assertPublicEnrollmentState(payload, { mode }) {
  const mismatches = [];
  if (!payload || typeof payload !== 'object') mismatches.push('missing_json');
  if (payload?.configuration !== 'valid') mismatches.push('configuration_invalid');
  if (payload?.mode !== mode) mismatches.push('mode_mismatch');
  if (payload?.status !== (mode === 'ga' ? 'open' : 'paused')) mismatches.push('status_mismatch');
  if (Object.keys(payload ?? {}).sort().join(',') !== 'configuration,mode,status') mismatches.push('public_shape_mismatch');
  if (mismatches.length) throw new Error(`runtime enrollment probe failed: ${mismatches.join(',')}`);
  return payload;
}

export function assertCompensationFence(current, currentDeployment, target) {
  const currentSourceCommit = deploymentWebSourceCommit(currentDeployment);
  const isExactTarget = target.observed === true &&
    currentDeployment.phase === 'ACTIVE' &&
    isDeepStrictEqual(current.spec, target.spec) &&
    isDeepStrictEqual(currentDeployment.spec, target.spec) &&
    current.activeDeploymentId === target.providerDeploymentId &&
    !current.inProgressDeploymentId &&
    currentDeployment.id === target.providerDeploymentId &&
    currentSourceCommit === target.sourceCommitHash;
  if (!isExactTarget) {
    throw new Error('compensation refused: unrelated provider mutation detected');
  }
}

export function deploymentWebSourceCommit(deployment) {
  const sources = deployment.sourceCommitHashes || [];
  const matches = sources.filter((item) => item.name === undefined || item.name === 'web');
  if (matches.length !== 1) throw new Error('deployment has an ambiguous web source identity');
  return matches[0].sourceCommitHash;
}

export function snapshotDescriptor(app, deployment) {
  const sourceCommitHash = deploymentWebSourceCommit(deployment);
  return {
    appId: app.appId,
    providerDeploymentId: app.activeDeploymentId,
    sourceCommitHash,
  };
}

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}
function boundedDelay(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maximum ? parsed : fallback;
}

export function deriveClosedStageSpec(liveSpec, operatorSpec = liveSpec) {
  const next = clone(liveSpec);
  const web = componentByName(next, 'services', WEB_SERVICE_NAME);
  if (!web) throw new Error('spec must contain exactly one services[name=web] component');
  if (!Array.isArray(web.envs)) throw new Error('services[name=web].envs must be an array');
  const operatorBindings = allowlistedClosedOperatorSpec(liveSpec, operatorSpec);
  const installed = new Set();
  web.envs = web.envs.map((entry) => {
    if (!entry || typeof entry !== 'object' || !CLOSED_ALLOWLIST_BINDINGS.has(entry.key)) return entry;
    installed.add(entry.key);
    return clone(operatorBindings.get(entry.key));
  });
  for (const [key, entry] of operatorBindings) {
    if (!installed.has(key)) web.envs.push(clone(entry));
  }
  const modeEntry = web.envs.find((entry) => entry && typeof entry === 'object' && entry.key === 'SPLOOT_ENROLLMENT_MODE');
  if (!modeEntry) throw new Error('services[name=web] is missing SPLOOT_ENROLLMENT_MODE');
  modeEntry.value = 'closed';

  const jobs = Array.isArray(next.jobs) ? next.jobs : null;
  if (!jobs) throw new Error('spec must contain jobs for the closed staging patch');
  const sourceDescriptor = productionSourceDescriptor(liveSpec);
  const databaseBinding = webDatabaseBinding(liveSpec);
  applySourceDescriptor(web, sourceDescriptor);
  const migrationJobs = jobs.filter((job) => job && typeof job === 'object' && job.name === MIGRATION_JOB_NAME);
  if (migrationJobs.length > 1) throw new Error(`spec has duplicate migration jobs: ${MIGRATION_JOB_NAME}`);
  if (migrationJobs.length === 1) {
    const job = migrationJobs[0];
    job.kind = MIGRATION_JOB_KIND;
    job.run_command = MIGRATION_RUN_COMMAND;
    applySourceDescriptor(job, sourceDescriptor);
    // App Platform builds jobs as independent components. The migrator needs
    // dependencies and a generated Prisma client, never the Next.js artifact
    // or web-only auth bindings.
    job.build_command = MIGRATION_BUILD_COMMAND;
    if (!Array.isArray(job.envs)) job.envs = [];
    const existing = job.envs.filter((env) => env?.key === 'DATABASE_URL');
    if (existing.length > 1) throw new Error('migration job has duplicate DATABASE_URL bindings');
    if (existing.length === 0) job.envs.push(databaseBinding);
    else job.envs = job.envs.map((env) => (env?.key === 'DATABASE_URL' ? databaseBinding : env));
  } else {
    const job = {
      name: MIGRATION_JOB_NAME,
      kind: MIGRATION_JOB_KIND,
      run_command: MIGRATION_RUN_COMMAND,
      envs: [databaseBinding],
    };
    applySourceDescriptor(job, sourceDescriptor);
    job.build_command = MIGRATION_BUILD_COMMAND;
    jobs.push(job);
  }
  web.run_command = SERVICE_RUN_COMMAND;
  // Route platform health on the shallow liveness endpoint while preserving
  // every other authored probe knob from the live snapshot.
  const liveHealthCheck = web.health_check;
  web.health_check = {
    ...(liveHealthCheck && typeof liveHealthCheck === 'object' && !Array.isArray(liveHealthCheck) ? clone(liveHealthCheck) : {}),
    http_path: LIVENESS_HEALTH_PATH,
  };
  return next;
}

export function deriveGaLiftSpec(closedStageSpec) {
  // GA derives from a staged closed spec; a stage that somehow lost the
  // liveness routing must fail here rather than reach the provider.
  assertWebLivenessRouting(closedStageSpec);
  return promoteClosedStageSpecToGa(closedStageSpec);
}

/** The only provider mutation engine; callers supply a patch spec and oracle. */
export function createDeploymentProviderTransaction({ appId, runDoctl, runtimeProbe }) {
  let lastTargetReceipt;
  let lastPreparedSpec;
  let mutationState = 'idle';
  const pollAttempts = boundedInteger(process.env.SPLOOT_LIFECYCLE_POLL_ATTEMPTS, 60, 120);
  const pollDelayMs = boundedDelay(process.env.SPLOOT_LIFECYCLE_POLL_DELAY_MS, 5000, 30000);
  const getApp = () => parseAppsGetResponse(runDoctl(['apps', 'get', appId, '--output', 'json']));
  const getDeployment = (deploymentId) => parseGetDeploymentResponse(
    runDoctl(['apps', 'get-deployment', appId, deploymentId, '--output', 'json']),
    deploymentId,
  );
  const assertSourceStageAllowed = (spec, expectedMode, updateSources) => {
    if (expectedMode === 'ga' && updateSources) throw new Error('GA lift must be spec-only');
    return spec;
  };
  const prepareSpec = (spec, validateSpec, validationContext) => {
    const proposal = parseAppsProposalResponse(runDoctl(
      ['apps', 'propose', '--app', appId, '--spec', '-', '--output', 'json'],
      { input: JSON.stringify(spec) },
    ));
    assertProviderNormalization(spec, proposal.spec);
    validateSpec(proposal.spec, validationContext);
    return proposal.spec;
  };
  const waitForActive = async (deploymentId, spec, commit) => {
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
      const deploymentResponse = getDeployment(deploymentId);
      assertDeploymentContents(deploymentResponse, { deploymentId, spec, commit });
      if (deploymentResponse.phase === 'ACTIVE') return deploymentResponse;
      if (['ERROR', 'CANCELED', 'FAILED', 'SUPERSEDED'].includes(deploymentResponse.phase)) throw new Error('the observed DigitalOcean deployment did not become active');
      await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
    }
    throw new Error('timed out waiting for the observed DigitalOcean deployment');
  };
  const observeDeployment = async (before, updateState) => {
    if (updateState.inProgressDeploymentId) {
      const deploymentId = deploymentIdAfterUpdate(before, updateState);
      if (!deploymentId) throw new Error('provider update did not expose a distinct deployment identity');
      return { after: updateState, deploymentId };
    }
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
      const after = getApp();
      if (!after.inProgressDeploymentId) {
        // An active-only change cannot be tied to this transaction safely.
        if (after.activeDeploymentId !== before.activeDeploymentId) throw new Error('provider update returned an ambiguous active-only deployment');
      } else {
        const deploymentId = deploymentIdAfterUpdate(before, after);
        return { after, deploymentId };
      }
      await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
    }
    throw new Error('DigitalOcean did not expose one in-progress deployment after update');
  };
  const apply = async ({ spec, commit, expectedMode, expectedMarker, expectedChangeId, expectedAppId, updateSources = false, validateSpec = assertSpecBindings, probeRuntime = true }) => {
    assertSourceStageAllowed(spec, expectedMode, updateSources);
    const intendedSpec = prepareSpec(spec, validateSpec, { mode: expectedMode, marker: expectedMarker, changeId: expectedChangeId });
    lastPreparedSpec = intendedSpec;
    const before = getApp();
    if (before.inProgressDeploymentId) throw new Error('preexisting in-progress deployment prevents mutation');
    mutationState = 'possibly-mutated';
    const updateArgs = ['apps', 'update', appId, '--spec', '-', ...(updateSources ? ['--update-sources'] : []), '--output', 'json'];
    const updateState = parseAppsUpdateResponse(runDoctl(updateArgs, { input: JSON.stringify(intendedSpec) }), appId);
    const observed = await observeDeployment(before, updateState);
    validateSpec(observed.after.spec, { mode: expectedMode, marker: expectedMarker, changeId: expectedChangeId });
    const firstObservedDeployment = getDeployment(observed.deploymentId);
    assertDeploymentContents(firstObservedDeployment, { deploymentId: observed.deploymentId, spec: intendedSpec, commit });
    lastTargetReceipt = { providerDeploymentId: observed.deploymentId, sourceCommitHash: commit };
    mutationState = 'identity-known';
    const deploymentResponse = await waitForActive(observed.deploymentId, intendedSpec, commit);
    const active = getApp();
    if (active.activeDeploymentId !== observed.deploymentId || active.inProgressDeploymentId) throw new Error('DigitalOcean active deployment is ambiguous after the update');
    if (!isDeepStrictEqual(active.spec, intendedSpec)) throw new Error('active provider spec changed after deployment verification');
    validateSpec(active.spec, { mode: expectedMode, marker: expectedMarker, changeId: expectedChangeId });
    assertDeploymentContents(deploymentResponse, { deploymentId: observed.deploymentId, spec: intendedSpec, commit });
    const readback = probeRuntime
      ? await runtimeProbe({ mode: expectedMode, appId: expectedAppId, changeId: expectedChangeId, marker: expectedMarker, commit })
      : undefined;
    mutationState = 'committed';
    return { providerDeploymentId: observed.deploymentId, app: active, deployment: deploymentResponse, readback };
  };
  return {
    getApp,
    getDeployment,
    snapshotDescriptor: (app, deployment) => snapshotDescriptor(app, deployment),
    lastTarget: () => lastTargetReceipt,
    lastPreparedSpec: () => (lastPreparedSpec === undefined ? undefined : clone(lastPreparedSpec)),
    mutationState: () => mutationState,
    apply,
    assertCompensationFence,
  };
}
