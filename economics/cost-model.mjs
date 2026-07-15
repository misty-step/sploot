import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('./', import.meta.url);
const INPUT_FILES = ['rates.json', 'live-usage.json', 'workloads.json', 'policy.json'];
const REQUIRED_RATE_IDS = [
  'vercel-blob-storage',
  'vercel-blob-simple-ops',
  'vercel-blob-advanced-ops',
  'vercel-blob-transfer',
  'vercel-edge-requests',
  'vercel-fast-origin-transfer',
  'replicate-clip-prediction',
  'neon-launch-compute',
  'neon-database-storage',
  'neon-history-storage',
  'neon-network-transfer',
  'digitalocean-web-service',
  'digitalocean-small-job-runtime',
  'digitalocean-egress',
  'clerk-hobby-mru',
  'clerk-pro-mru-overage',
  'canary-shared-service',
  'github-actions-public-standard',
  'github-actions-cache-overage',
  'stripe-domestic-card',
];
const REQUIRED_SCENARIO_NUMBERS = [
  'priceUsd',
  'sourceTrashStorageGb',
  'uploads',
  'uniqueTextQueries',
  'blobDeliveryGb',
  'edgeRequests',
  'blobSimpleOps',
  'blobAdvancedOps',
  'databaseStorageGb',
  'neonHistoryGb',
  'neonCuHours',
  'neonTransferGb',
  'appEgressGib',
  'jobInvocations',
  'jobSecondsPerInvocation',
  'canaryAllocationUsd',
  'clerkMru',
];
const REQUIRED_PROVIDER_CAPS = [
  'Application admission',
  'Replicate',
  'Vercel Blob/CDN',
  'Neon',
  'DigitalOcean',
  'Clerk',
  'Stripe',
];
const REQUIRED_SENSITIVITY_NUMBERS = [
  'renditionMultiplier',
  'originMissRatio',
  'inferenceAttemptMultiplier',
  'databaseComputeMultiplier',
  'stripeVariableSurcharge',
];
const REQUIRED_PLAN_BUDGET_NUMBERS = [
  'monthlyInfrastructureUsd',
  'dailyInferenceUsd',
  'monthlyInferenceUsd',
  'dailyInferenceAttempts',
  'monthlyInferenceAttempts',
];
const REQUIRED_GLOBAL_NUMBERS = [
  'preGaDailyVariableUsd',
  'preGaMonthlyVariableUsd',
  'replicateDailyUsd',
  'replicateDailyAttempts',
  'replicateMonthlyUsd',
  'replicateMonthlyAttempts',
];
const REQUIRED_LIVE_NUMBER_PATHS = [
  'storage.blobObjects',
  'storage.blobBytes',
  'storage.databaseSourceBytesLive',
  'storage.databaseSourceBytesDeleted',
  'storage.liveAssets',
  'storage.deletedAssets',
  'storage.liveThumbnails',
  'database.databaseBytes',
  'database.users',
  'database.readyEmbeddings',
  'database.failedEmbeddings',
  'database.processingEmbeddings',
  'database.pendingEmbeddings',
  'database.searches30d',
  'database.textCacheRows',
  'inference.latestPredictionSample.size',
  'inference.latestPredictionSample.failed',
  'inference.latestPredictionSample.canceled',
  'inference.latestPredictionSample.succeeded',
  'digitalOcean.webInstances',
  'digitalOcean.scheduledSmallJobs',
  'digitalOcean.embeddingJobEstimatedMonthlyUsd',
  'digitalOcean.invoicePreviewUsd',
  'digitalOcean.monthToDateUsageUsd',
  'digitalOcean.namedVarianceUsd',
  'vercel.projectEffectiveUsageUsd',
  'vercel.subCentRemainderUsd',
  'telemetry.errors30d',
  'telemetry.errorGroupsReturned',
  'github.activeCacheCount',
  'github.activeCacheBytes',
];
const REQUIRED_LIVE_STRING_PATHS = [
  'storage.reconciliation',
  'inference.latestPredictionSample.model',
  'inference.latestPredictionSample.modelVersion',
  'inference.reconciliation',
  'digitalOcean.webInstance',
  'digitalOcean.embeddingJobSchedule',
  'digitalOcean.varianceExplanation',
  'vercel.periodStart',
  'vercel.periodEnd',
  'vercel.reconciliation',
  'vercel.blobAttribution',
  'telemetry.reconciliation',
  'github.repositoryVisibility',
  'github.reconciliation',
];
const REQUIRED_LIVE_TIMESTAMP_PATHS = [
  'capturedAt',
  'inference.latestPredictionSample.from',
  'inference.latestPredictionSample.to',
];
const SUPPORTED_POLICY_SCHEMA_VERSION = 1;
const round = (value, digits = 4) => Number(value.toFixed(digits));
const money = (value) => `$${value.toFixed(2)}`;
const preciseMoney = (value, digits = 10) => `$${value.toFixed(digits)}`;
const percent = (value) => value === null ? 'n/a' : `${value.toFixed(1)}%`;
const rateMoney = (value) => value < 0.01 ? `$${value.toFixed(6)}` : value < 1 ? `$${value.toFixed(3)}` : money(value);
const sensitivityMultiplierText = (inputs, key) => ['low', 'base', 'high']
  .map((id) => `${inputs.policy.sensitivity[id][key].toFixed(2)}×`).join('/');
const sensitivityPercentText = (inputs, key) => ['low', 'base', 'high']
  .map((id) => `${(inputs.policy.sensitivity[id][key] * 100).toFixed(key === 'stripeVariableSurcharge' ? 1 : 0).replace(/\.0$/, '')}%`).join('/');
const getPath = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const ceilCents = (value) => Math.ceil((value - Number.EPSILON) * 100) / 100;
const EVIDENCE_KEYS = new Set([
  'provider',
  'account',
  'control',
  'scope',
  'value',
  'unit',
  'currency',
  'sourceUrl',
  'receiptIdentifier',
  'receiptClass',
  'observedAt',
  'reviewer',
  'reviewerRole',
  'runsPerUsd',
]);

const PROVIDER_EVIDENCE_CONTRACTS = Object.freeze({
  'Application admission': Object.freeze({
    account: null,
    control: 'application admission',
    scope: 'calendar month',
    value: 25,
    unit: 'USD per calendar month',
    currency: 'USD',
    sourceOrigins: Object.freeze([]),
    receiptClasses: Object.freeze(['internal-control-record']),
    reviewers: Object.freeze([{ identity: 'economics-review', role: 'economics reviewer' }]),
  }),
  Replicate: Object.freeze({
    account: 'replicate-production-redacted',
    control: 'monthly provider spend control',
    scope: 'calendar month',
    value: 15,
    unit: 'USD per calendar month',
    currency: 'USD',
    sourceOrigins: Object.freeze(['https://replicate.com']),
    receiptClasses: Object.freeze(['provider-billing-export']),
    reviewers: Object.freeze([{ identity: 'economics-review', role: 'economics reviewer' }]),
  }),
  'Vercel Blob/CDN': Object.freeze({
    account: null,
    control: 'provider billing control',
    scope: 'current billing cycle',
    value: null,
    unit: 'USD per current billing cycle',
    currency: 'USD',
    sourceOrigins: Object.freeze(['https://vercel.com']),
    receiptClasses: Object.freeze(['provider-billing-export']),
    reviewers: Object.freeze([{ identity: 'economics-review', role: 'economics reviewer' }]),
  }),
  Neon: Object.freeze({
    account: null,
    control: 'provider billing control',
    scope: 'current billing cycle',
    value: null,
    unit: 'USD per current billing cycle',
    currency: 'USD',
    sourceOrigins: Object.freeze(['https://neon.com']),
    receiptClasses: Object.freeze(['provider-billing-export']),
    reviewers: Object.freeze([{ identity: 'economics-review', role: 'economics reviewer' }]),
  }),
  DigitalOcean: Object.freeze({
    account: null,
    control: 'provider billing control',
    scope: 'current billing cycle',
    value: null,
    unit: 'USD per current billing cycle',
    currency: 'USD',
    sourceOrigins: Object.freeze(['https://www.digitalocean.com']),
    receiptClasses: Object.freeze(['provider-billing-export']),
    reviewers: Object.freeze([{ identity: 'economics-review', role: 'economics reviewer' }]),
  }),
  Clerk: Object.freeze({
    account: null,
    control: 'provider billing control',
    scope: 'current billing cycle',
    value: null,
    unit: 'USD per current billing cycle',
    currency: 'USD',
    sourceOrigins: Object.freeze(['https://clerk.com']),
    receiptClasses: Object.freeze(['provider-billing-export']),
    reviewers: Object.freeze([{ identity: 'economics-review', role: 'economics reviewer' }]),
  }),
  Stripe: Object.freeze({
    account: null,
    control: 'provider billing control',
    scope: 'current billing cycle',
    value: null,
    unit: 'USD per current billing cycle',
    currency: 'USD',
    sourceOrigins: Object.freeze(['https://stripe.com']),
    receiptClasses: Object.freeze(['provider-billing-export']),
    reviewers: Object.freeze([{ identity: 'economics-review', role: 'economics reviewer' }]),
  }),
});

const REPLICATE_RATE_EVIDENCE_CONTRACT = Object.freeze({
  provider: 'Replicate',
  account: null,
  control: 'model page price estimate',
  scope: 'krthr/clip-embeddings typical prediction',
  value: 0.00073,
  unit: 'typical prediction',
  currency: 'USD',
  exactSourceUrl: 'https://replicate.com/krthr/clip-embeddings',
  sourceOrigins: Object.freeze(['https://replicate.com']),
  receiptClasses: Object.freeze(['provider-model-page-estimate']),
  reviewers: Object.freeze([{ identity: 'economics-review', role: 'economics reviewer' }]),
});

const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function parseEvidenceTimestamp(value, path, errors) {
  if (typeof value !== 'string' || !ISO_UTC_TIMESTAMP.test(value)) {
    errors.push(`${path} must be an ISO-8601 UTC timestamp`);
    return Number.NaN;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) errors.push(`${path} must be a valid timestamp`);
  return timestamp;
}

function validateEvidence(evidence, expected, path, errors, now, freshnessDays) {
  if (!isRecord(evidence)) {
    errors.push(`${path} must be a complete machine-readable object`);
    return;
  }
  for (const key of Object.keys(evidence)) {
    if (!EVIDENCE_KEYS.has(key)) errors.push(`${path}.${key} is not an allowed evidence field`);
  }
  for (const key of ['provider', 'control', 'scope', 'unit', 'currency', 'reviewer', 'reviewerRole']) {
    if (typeof evidence[key] !== 'string' || evidence[key].trim().length === 0) {
      errors.push(`${path}.${key} must be a non-empty string`);
    }
  }
  if (evidence.account !== null && (typeof evidence.account !== 'string' || evidence.account.trim().length === 0)) {
    errors.push(`${path}.account must be a non-empty string or null`);
  }
  if (evidence.value !== null && (!Number.isFinite(evidence.value) || evidence.value < 0)) {
    errors.push(`${path}.value must be null or a finite nonnegative number`);
  }
  const hasSourceUrl = evidence.sourceUrl !== undefined;
  const hasReceipt = evidence.receiptIdentifier !== undefined;
  if (hasSourceUrl === hasReceipt) {
    errors.push(`${path} must include exactly one sourceUrl or receiptIdentifier`);
  }
  if (hasSourceUrl) {
    try {
      const source = new URL(evidence.sourceUrl);
      if (source.protocol !== 'https:' || !expected.sourceOrigins.includes(source.origin)) {
        errors.push(`${path}.sourceUrl is not authorized by the evidence contract`);
      }
    } catch {
      errors.push(`${path}.sourceUrl must be a valid https URL`);
    }
  }
  if (hasReceipt) {
    if (typeof evidence.receiptIdentifier !== 'string' || evidence.receiptIdentifier.trim().length === 0) {
      errors.push(`${path}.receiptIdentifier must be a non-empty string`);
    }
    if (!expected.receiptClasses.includes(evidence.receiptClass)) {
      errors.push(`${path}.receiptClass is not authorized by the evidence contract`);
    }
  } else if (evidence.receiptClass !== undefined) {
    errors.push(`${path}.receiptClass requires receiptIdentifier`);
  }
  const observedAt = parseEvidenceTimestamp(evidence.observedAt, `${path}.observedAt`, errors);
  if (Number.isFinite(observedAt)) {
    if (observedAt > now.getTime()) errors.push(`${path}.observedAt is future-dated`);
    if (now.getTime() - observedAt > freshnessDays * 86_400_000) errors.push(`${path}.observedAt is stale`);
  }
  if (evidence.provider !== expected.provider) errors.push(`${path}.provider does not match the evidence contract`);
  if (evidence.account !== expected.account) errors.push(`${path}.account does not match the evidence contract`);
  if (evidence.control !== expected.control) errors.push(`${path}.control does not match the evidence contract`);
  if (evidence.scope !== expected.scope) errors.push(`${path}.scope does not match the evidence contract`);
  if (evidence.value !== expected.value) errors.push(`${path}.value does not match the evidence contract`);
  if (evidence.unit !== expected.unit) errors.push(`${path}.unit does not match the evidence contract`);
  if (evidence.currency !== expected.currency) errors.push(`${path}.currency does not match the evidence contract`);
  if (evidence.reviewer !== expected.reviewers[0]?.identity
    || evidence.reviewerRole !== expected.reviewers[0]?.role) {
    errors.push(`${path}.reviewer identity or role is not authorized by the evidence contract`);
  }
  if (expected.exactSourceUrl !== undefined && evidence.sourceUrl !== expected.exactSourceUrl) {
    errors.push(`${path}.sourceUrl must match the exact reviewed source URL`);
  }
  return observedAt;
}

export async function loadInputs() {
  const [rates, liveUsage, workloads, policy] = await Promise.all(
    INPUT_FILES.map(async (name) => JSON.parse(await readFile(new URL(name, ROOT), 'utf8'))),
  );
  return { rates: rates.rates, rateCurrency: rates.currency, liveUsage, scenarios: workloads.scenarios, policy };
}

export function validateInputs(inputs, now = new Date()) {
  const errors = [];
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
    return ['inputs object is required'];
  }
  if (!Array.isArray(inputs.rates)) errors.push('inputs.rates must be an array');
  if (!Array.isArray(inputs.scenarios)) errors.push('inputs.scenarios must be an array');
  if (!inputs.policy || typeof inputs.policy !== 'object' || Array.isArray(inputs.policy)) {
    errors.push('inputs.policy must be an object');
  }
  if (!inputs.liveUsage || typeof inputs.liveUsage !== 'object' || Array.isArray(inputs.liveUsage)) {
    errors.push('inputs.liveUsage must be an object');
  }
  if (errors.length > 0) return errors;
  if (inputs.policy.schemaVersion !== SUPPORTED_POLICY_SCHEMA_VERSION) {
    errors.push(`policy.schemaVersion must be ${SUPPORTED_POLICY_SCHEMA_VERSION}`);
  }

  const rateIds = new Set();
  for (const rate of inputs.rates) {
    if (!rate || typeof rate !== 'object' || Array.isArray(rate)) {
      errors.push('rate entries must be objects');
      continue;
    }
    if (rateIds.has(rate.id)) errors.push(`duplicate rate: ${rate.id}`);
    rateIds.add(rate.id);
    if (!Array.isArray(rate.capabilities) || rate.capabilities.length === 0) errors.push(`capabilities missing: ${rate.id}`);
    if (!Number.isFinite(rate.value) || rate.value < 0) errors.push(`invalid value: ${rate.id}`);
    if (Object.hasOwn(rate, 'fixedValue') && (!Number.isFinite(rate.fixedValue) || rate.fixedValue < 0)) {
      errors.push(`invalid fixed value: ${rate.id}`);
    }
    if (!rate.sourceUrl || !rate.retrievedAt || !rate.unit || !rate.planAssumption
      || !Object.hasOwn(rate, 'includedAllowance')) errors.push(`authority missing: ${rate.id}`);
    if (rate.id === 'replicate-clip-prediction') {
      if (rate.sourceEvidenceType !== 'provider_model_page_estimate') {
        errors.push('source evidence type missing: replicate-clip-prediction');
      }
      const observedAt = validateEvidence(rate.sourceEvidence, REPLICATE_RATE_EVIDENCE_CONTRACT,
        `rate ${rate.id}.sourceEvidence`, errors, now, inputs.policy.rateFreshnessDays);
      if (rate.value !== REPLICATE_RATE_EVIDENCE_CONTRACT.value) {
        errors.push(`rate ${rate.id}.value must match the policy evidence contract`);
      }
      if (Number.isFinite(observedAt) && rate.retrievedAt !== new Date(observedAt).toISOString().slice(0, 10)) {
        errors.push(`rate ${rate.id}.sourceEvidence.observedAt must match retrievedAt`);
      }
      if (rate.sourceEvidence?.runsPerUsd !== undefined
        && (!Number.isFinite(rate.sourceEvidence.runsPerUsd)
          || rate.sourceEvidence.runsPerUsd !== Math.floor(1 / REPLICATE_RATE_EVIDENCE_CONTRACT.value))) {
        errors.push(`rate ${rate.id}.sourceEvidence.runsPerUsd must equal floor(1 / reviewed value)`);
      }
    }
    const retrievedAt = Date.parse(`${rate.retrievedAt}T00:00:00Z`);
    if (!Number.isFinite(retrievedAt)) {
      errors.push(`invalid retrieval date: ${rate.id}`);
    } else if (Number.isFinite(inputs.policy.rateFreshnessDays)) {
      const ageDays = (now.getTime() - retrievedAt) / 86_400_000;
      if (ageDays > inputs.policy.rateFreshnessDays) errors.push(`rate sheet expired: ${rate.id}`);
      if (ageDays < -1) errors.push(`rate sheet is future-dated: ${rate.id}`);
    }
  }
  for (const rateId of REQUIRED_RATE_IDS) {
    if (!rateIds.has(rateId)) errors.push(`required rate missing: ${rateId}`);
  }
  const retrievalDates = new Set(
    inputs.rates
      .filter((rate) => rate && typeof rate.retrievedAt === 'string')
      .map((rate) => rate.retrievedAt),
  );
  if (retrievalDates.size !== 1) errors.push('rate registry must use one retrieval date');

  const scenarioIds = new Set();
  for (const scenario of inputs.scenarios) {
    if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
      errors.push('scenario entries must be objects');
      continue;
    }
    if (typeof scenario.id !== 'string' || scenario.id.length === 0) {
      errors.push('scenario id is required');
    } else if (scenarioIds.has(scenario.id)) {
      errors.push(`duplicate scenario: ${scenario.id}`);
    } else {
      scenarioIds.add(scenario.id);
    }
    if (typeof scenario.label !== 'string' || scenario.label.length === 0) errors.push(`scenario ${scenario.id ?? '<unknown>'}.label is required`);
    for (const key of REQUIRED_SCENARIO_NUMBERS) {
      const value = scenario[key];
      if (!Number.isFinite(value) || value < 0) {
        errors.push(`scenario ${scenario.id ?? '<unknown>'}.${key} must be a finite nonnegative number`);
      }
    }
    if (!Number.isInteger(scenario.jobInvocations)) {
      errors.push(`scenario ${scenario.id ?? '<unknown>'}.jobInvocations must be an integer`);
    }
    if (scenario.jobSecondsPerInvocation > 3_600) {
      errors.push(`scenario ${scenario.id ?? '<unknown>'}.jobSecondsPerInvocation exceeds the one-run bound`);
    }
    if (scenario.jobInvocations === 0 && scenario.jobSecondsPerInvocation !== 0) {
      errors.push(`scenario ${scenario.id ?? '<unknown>'}.jobSecondsPerInvocation must be zero when jobInvocations is zero`);
    }
  }

  if (!Number.isInteger(inputs.policy.rateFreshnessDays) || inputs.policy.rateFreshnessDays <= 0) {
    errors.push('policy.rateFreshnessDays must be a positive integer');
  }
  if (!Number.isInteger(inputs.policy.freeFullAllowanceAccounts)
    || inputs.policy.freeFullAllowanceAccounts <= 0) {
    errors.push('policy.freeFullAllowanceAccounts must be a positive integer');
  }
  if (inputs.policy.enrollmentMode !== 'CLOSED') {
    errors.push('policy.enrollmentMode must remain CLOSED until durable dollar admission exists');
  }
  if (!isRecord(inputs.policy.targetPolicy)
    || inputs.policy.targetPolicy.freeSourceStorageGb !== 0.5
    || inputs.policy.targetPolicy.freeDeliveryGb !== 1
    || inputs.policy.targetPolicy.freeFullAllowanceAccounts !== 75
    || inputs.policy.targetPolicy.admissionImplementation !== 'unimplemented; enrollment remains CLOSED') {
    errors.push('policy.targetPolicy must declare the closed 75-account, 0.5 GB source, 1 GB delivery target');
  }
  if (!Number.isInteger(inputs.policy.liveUsageFreshnessHours)
    || inputs.policy.liveUsageFreshnessHours <= 0) {
    errors.push('policy.liveUsageFreshnessHours must be a positive integer');
  }
  if (typeof inputs.policy.planBudgetSemantics !== 'string' || inputs.policy.planBudgetSemantics.length === 0) {
    errors.push('policy.planBudgetSemantics must be a non-empty string');
  }
  for (const sensitivityId of ['low', 'base', 'high']) {
    const sensitivity = inputs.policy.sensitivity?.[sensitivityId];
    if (!sensitivity || typeof sensitivity !== 'object') {
      errors.push(`policy sensitivity missing: ${sensitivityId}`);
      continue;
    }
    for (const key of REQUIRED_SENSITIVITY_NUMBERS) {
      if (!Number.isFinite(sensitivity[key]) || sensitivity[key] < 0) {
        errors.push(`policy sensitivity ${sensitivityId}.${key} must be a finite nonnegative number`);
      }
    }
  }
  if (!inputs.policy.planBudgets || typeof inputs.policy.planBudgets !== 'object'
    || Array.isArray(inputs.policy.planBudgets)) {
    errors.push('policy.planBudgets must be an object');
  } else {
    for (const planId of ['free', 'collector', 'archive']) {
      const budget = inputs.policy.planBudgets[planId];
      if (!budget || typeof budget !== 'object' || Array.isArray(budget)) {
        errors.push(`policy.planBudgets.${planId} must be an object`);
        continue;
      }
      for (const key of REQUIRED_PLAN_BUDGET_NUMBERS) {
        if (!Number.isFinite(budget[key]) || budget[key] < 0) {
          errors.push(`policy.planBudgets.${planId}.${key} must be a finite nonnegative number`);
        }
      }
    }
  }
  if (!inputs.policy.global || typeof inputs.policy.global !== 'object'
    || Array.isArray(inputs.policy.global)) {
    errors.push('policy.global must be an object');
  } else {
    for (const key of REQUIRED_GLOBAL_NUMBERS) {
      if (!Number.isFinite(inputs.policy.global[key]) || inputs.policy.global[key] < 0) {
        errors.push(`policy.global.${key} must be a finite nonnegative number`);
      }
    }
    if (inputs.policy.global.preGaMonthlyVariableUsd > 25) {
      errors.push('policy.global.preGaMonthlyVariableUsd must not exceed $25 before dollar admission exists');
    }
    for (const key of ['paidMonthlyFormula', 'paidDailyFormula']) {
      if (typeof inputs.policy.global[key] !== 'string' || inputs.policy.global[key].length === 0) {
        errors.push(`policy.global.${key} must be a non-empty string`);
      }
    }
  }
  for (const path of REQUIRED_LIVE_NUMBER_PATHS) {
    const value = getPath(inputs.liveUsage, path);
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`liveUsage.${path} must be a finite nonnegative number`);
    }
  }
  for (const path of REQUIRED_LIVE_STRING_PATHS) {
    const value = getPath(inputs.liveUsage, path);
    if (typeof value !== 'string' || value.length === 0) {
      errors.push(`liveUsage.${path} must be a non-empty string`);
    }
  }
  const liveTimestampValues = Object.fromEntries(REQUIRED_LIVE_TIMESTAMP_PATHS.map((path) => [path, getPath(inputs.liveUsage, path)]));
  for (const [path, value] of Object.entries(liveTimestampValues)) {
    const timestamp = typeof value === 'string' ? Date.parse(value) : Number.NaN;
    if (!Number.isFinite(timestamp)) {
      errors.push(`liveUsage.${path} must be a valid timestamp`);
      continue;
    }
    if (timestamp > now.getTime() + 300_000) errors.push(`liveUsage.${path} is future-dated`);
  }
  const capturedAt = Date.parse(liveTimestampValues.capturedAt);
  if (Number.isFinite(capturedAt) && Number.isFinite(inputs.policy.liveUsageFreshnessHours)) {
    const ageHours = (now.getTime() - capturedAt) / 3_600_000;
    if (ageHours > inputs.policy.liveUsageFreshnessHours) errors.push('liveUsage.capturedAt is stale');
  }
  const sampleFrom = Date.parse(liveTimestampValues['inference.latestPredictionSample.from']);
  const sampleTo = Date.parse(liveTimestampValues['inference.latestPredictionSample.to']);
  if (Number.isFinite(sampleFrom) && Number.isFinite(sampleTo) && sampleFrom > sampleTo) {
    errors.push('liveUsage.inference.latestPredictionSample.from must not be after to');
  }
  if (!Array.isArray(inputs.liveUsage.unknowns)) {
    errors.push('liveUsage.unknowns must be an array');
  } else {
    inputs.liveUsage.unknowns.forEach((unknown, index) => {
      if (!isRecord(unknown)) {
        errors.push(`liveUsage.unknowns[${index}] must be an object`);
        return;
      }
      for (const key of ['name', 'impact']) {
        if (typeof unknown[key] !== 'string' || unknown[key].length === 0) {
          errors.push(`liveUsage.unknowns[${index}].${key} must be a non-empty string`);
        }
      }
      if (unknown.value !== null) errors.push(`liveUsage.unknowns[${index}].value must be null`);
    });
  }
  const vercel = inputs.liveUsage.vercel;
  if (!isRecord(vercel)) {
    errors.push('liveUsage.vercel must be an object');
  } else {
    const periodStart = Date.parse(`${vercel.periodStart}T00:00:00Z`);
    const periodEnd = Date.parse(`${vercel.periodEnd}T00:00:00Z`);
    if (!Number.isFinite(periodStart) || !Number.isFinite(periodEnd) || periodStart > periodEnd) {
      errors.push('liveUsage.vercel period must be an ordered pair of valid dates');
    }
    if (!Array.isArray(vercel.categories) || vercel.categories.length === 0) {
      errors.push('liveUsage.vercel.categories must be a non-empty array');
    } else {
      vercel.categories.forEach((category, index) => {
        if (!isRecord(category)) {
          errors.push(`liveUsage.vercel.categories[${index}] must be an object`);
          return;
        }
        if (typeof category.name !== 'string' || category.name.length === 0) {
          errors.push(`liveUsage.vercel.categories[${index}].name must be a non-empty string`);
        }
        if (!Number.isFinite(category.effectiveUsageUsd) || category.effectiveUsageUsd < 0) {
          errors.push(`liveUsage.vercel.categories[${index}].effectiveUsageUsd must be a finite nonnegative number`);
        }
      });
      const categoryTotal = vercel.categories.reduce((sum, category) => sum + category.effectiveUsageUsd, 0);
      if (Number.isFinite(categoryTotal)
        && Number.isFinite(vercel.subCentRemainderUsd)
        && Math.abs(categoryTotal + vercel.subCentRemainderUsd - vercel.projectEffectiveUsageUsd) > 1e-9) {
        errors.push('liveUsage.vercel category total must equal project effective usage');
      }
    }
    if (Number.isFinite(vercel.projectEffectiveUsageUsd)
      && Number.isFinite(vercel.allowanceAbsorbedUsd)
      && Number.isFinite(vercel.billedAfterAllowanceUsd)
      && Math.abs(vercel.allowanceAbsorbedUsd + vercel.billedAfterAllowanceUsd - vercel.projectEffectiveUsageUsd) > 1e-9) {
      errors.push('liveUsage.vercel allowance and billed usage must equal project effective usage');
    }
    for (const key of ['allowanceAbsorbedUsd', 'billedAfterAllowanceUsd']) {
      if (vercel[key] !== null && (!Number.isFinite(vercel[key]) || vercel[key] < 0)) {
        errors.push(`liveUsage.vercel.${key} must be null or a finite nonnegative number`);
      }
    }
    if (Number.isFinite(vercel.subCentRemainderUsd) && vercel.subCentRemainderUsd >= 0.01) {
      errors.push('liveUsage.vercel.subCentRemainderUsd must remain below one cent');
    }
  }
  if (REQUIRED_RATE_IDS.every((id) => rateIds.has(id))
    && isRecord(inputs.policy.global)
    && isRecord(inputs.policy.planBudgets)
    && isRecord(inputs.policy.sensitivity?.high)
    && ['free', 'collector', 'archive'].every((id) => inputs.scenarios.some((scenario) => scenario.id === id))) {
    const rates = rateMap(inputs);
    const replicateRate = rates['replicate-clip-prediction'].value;
    for (const planId of ['free', 'collector', 'archive']) {
      const budget = inputs.policy.planBudgets?.[planId];
      const workload = inputs.scenarios.find((scenario) => scenario.id === planId);
      if (!budget || !workload) continue;
      const high = calculateScenarioRaw(inputs, workload, inputs.policy.sensitivity?.high);
      if (Number.isFinite(budget.monthlyInfrastructureUsd)
        && budget.monthlyInfrastructureUsd < high.infrastructureCostUsd) {
        errors.push(`policy.planBudgets.${planId}.monthlyInfrastructureUsd must cover exact high-case infrastructure cost`);
      }
      if (planId === 'free'
        && Number.isFinite(inputs.policy.global.preGaMonthlyVariableUsd)
        && high.totalCostUsd * inputs.policy.freeFullAllowanceAccounts
          >= inputs.policy.global.preGaMonthlyVariableUsd) {
        errors.push('free high-case subsidy pool must be strictly below policy.global.preGaMonthlyVariableUsd');
      }
      for (const [period, usdKey, attemptsKey] of [
        ['daily', 'dailyInferenceUsd', 'dailyInferenceAttempts'],
        ['monthly', 'monthlyInferenceUsd', 'monthlyInferenceAttempts'],
      ]) {
        const attempts = budget[attemptsKey];
        const dollars = budget[usdKey];
        if (Number.isFinite(attempts) && Number.isFinite(dollars)
          && (attempts * replicateRate > dollars + Number.EPSILON
            || attempts !== Math.floor((dollars + Number.EPSILON) / replicateRate))) {
          errors.push(`policy.planBudgets.${planId}.${period} inference budget must equal its dollar-derived attempt cap`);
        }
      }
    }
    for (const [period, usdKey, attemptsKey] of [
      ['daily', 'replicateDailyUsd', 'replicateDailyAttempts'],
      ['monthly', 'replicateMonthlyUsd', 'replicateMonthlyAttempts'],
    ]) {
      const attempts = inputs.policy.global[attemptsKey];
      const dollars = inputs.policy.global[usdKey];
      if (Number.isFinite(attempts) && Number.isFinite(dollars)
        && (attempts * replicateRate > dollars + Number.EPSILON
          || attempts !== Math.floor((dollars + Number.EPSILON) / replicateRate))) {
        errors.push(`policy.global.${period} Replicate budget must equal its dollar-derived attempt cap`);
      }
    }
  }
  if (!Array.isArray(inputs.policy.providerHardCaps)
    || inputs.policy.providerHardCaps.length === 0) {
    errors.push('policy.providerHardCaps must be a non-empty array');
  } else {
    const providers = new Set();
    inputs.policy.providerHardCaps.forEach((cap, index) => {
      if (!cap || typeof cap !== 'object' || Array.isArray(cap)) {
        errors.push(`policy.providerHardCaps[${index}] must be an object`);
        return;
      }
      for (const key of ['provider', 'period', 'action', 'enforcementStatus', 'evidenceStatus', 'evidenceNote']) {
        if (typeof cap[key] !== 'string' || cap[key].length === 0) {
          errors.push(`policy.providerHardCaps[${index}].${key} must be a non-empty string`);
        }
      }
      if (providers.has(cap.provider)) errors.push(`duplicate provider cap: ${cap.provider}`);
      providers.add(cap.provider);
      if (cap.amountUsd !== null && (!Number.isFinite(cap.amountUsd) || cap.amountUsd < 0)) {
        errors.push(`policy.providerHardCaps[${index}].amountUsd must be null or a finite nonnegative number`);
      }
      if (!Object.hasOwn(cap, 'evidence') || (cap.evidence !== null && !isRecord(cap.evidence))) {
        errors.push(`policy.providerHardCaps[${index}].evidence must be an object or null`);
      }
      if (!Object.hasOwn(cap, 'lastVerifiedAt')) {
        errors.push(`policy.providerHardCaps[${index}].lastVerifiedAt is required`);
      }
      if (!['unimplemented', 'unverified', 'attempt_only'].includes(cap.enforcementStatus)) {
        errors.push(`policy.providerHardCaps[${index}].enforcementStatus is invalid`);
      }
      if (!['unverified', 'verified'].includes(cap.evidenceStatus)) {
        errors.push(`policy.providerHardCaps[${index}].evidenceStatus is invalid`);
      }
      if (cap.evidenceStatus === 'verified' && (!isRecord(cap.evidence) || typeof cap.lastVerifiedAt !== 'string')) {
        errors.push(`policy.providerHardCaps[${index}] verified evidence requires lastVerifiedAt and complete evidence`);
      }
      if (cap.evidenceStatus === 'verified' && typeof cap.lastVerifiedAt === 'string') {
        const verifiedAt = parseEvidenceTimestamp(
          cap.lastVerifiedAt,
          `policy.providerHardCaps[${index}].lastVerifiedAt`,
          errors,
        );
        if (Number.isFinite(verifiedAt)) {
          if (verifiedAt > now.getTime()) errors.push(`policy.providerHardCaps[${index}].lastVerifiedAt is future-dated`);
          if (now.getTime() - verifiedAt > inputs.policy.rateFreshnessDays * 86_400_000) errors.push(`provider cap evidence stale: ${cap.provider}`);
        }
      }
      if (cap.evidenceStatus === 'verified' && isRecord(cap.evidence)) {
        const contract = PROVIDER_EVIDENCE_CONTRACTS[cap.provider];
        if (!contract) {
          errors.push(`policy.providerHardCaps[${index}] has no evidence authority contract`);
        } else {
          if (cap.period !== contract.scope) {
            errors.push(`policy.providerHardCaps[${index}].period must match the evidence authority contract`);
          }
          validateEvidence(cap.evidence, {
            provider: cap.provider,
            account: contract.account,
            control: contract.control,
            scope: contract.scope,
            value: contract.value,
            unit: contract.unit,
            currency: contract.currency,
            sourceOrigins: contract.sourceOrigins,
            receiptClasses: contract.receiptClasses,
            reviewers: contract.reviewers,
          }, `policy.providerHardCaps[${index}].evidence`, errors, now, inputs.policy.rateFreshnessDays);
        }
      }
      if (cap.evidenceStatus === 'unverified' && cap.evidence !== null) {
        errors.push(`policy.providerHardCaps[${index}] unverified evidence must be null`);
      }
      if (cap.evidenceStatus === 'unverified' && cap.lastVerifiedAt !== null) {
        errors.push(`policy.providerHardCaps[${index}] unverified evidence must have null lastVerifiedAt`);
      }
    });
    if (providers.size !== REQUIRED_PROVIDER_CAPS.length
      || REQUIRED_PROVIDER_CAPS.some((provider) => !providers.has(provider))) {
      errors.push('policy.providerHardCaps must contain exactly the required provider set');
    }
  }
  return errors;
}

function assertValidInputs(inputs, now = new Date()) {
  const errors = validateInputs(inputs, now);
  if (errors.length > 0) throw new Error(errors.join('\n'));
}

const rateMap = (inputs) => Object.fromEntries(inputs.rates.map((rate) => [rate.id, rate]));

function calculateScenarioRaw(inputs, workload, sensitivity) {
  const rates = rateMap(inputs);
  const predictions = (workload.uploads + workload.uniqueTextQueries) * sensitivity.inferenceAttemptMultiplier;
  const jobSecondRate = rates['digitalocean-small-job-runtime'].value / (30 * 24 * 60 * 60);

  const infrastructure = {
    blobStorage: workload.sourceTrashStorageGb * sensitivity.renditionMultiplier * rates['vercel-blob-storage'].value,
    blobSimpleOps: workload.blobSimpleOps / 1_000_000 * rates['vercel-blob-simple-ops'].value,
    blobAdvancedOps: workload.blobAdvancedOps / 1_000_000 * rates['vercel-blob-advanced-ops'].value,
    blobTransfer: workload.blobDeliveryGb * rates['vercel-blob-transfer'].value,
    edgeRequests: workload.edgeRequests / 1_000_000 * rates['vercel-edge-requests'].value,
    fastOriginTransfer: workload.blobDeliveryGb * sensitivity.originMissRatio * rates['vercel-fast-origin-transfer'].value,
    inference: predictions * rates['replicate-clip-prediction'].value,
    databaseStorage: workload.databaseStorageGb * rates['neon-database-storage'].value,
    databaseHistory: workload.neonHistoryGb * rates['neon-history-storage'].value,
    databaseCompute: workload.neonCuHours * sensitivity.databaseComputeMultiplier * rates['neon-launch-compute'].value,
    databaseTransfer: workload.neonTransferGb * rates['neon-network-transfer'].value,
    appEgress: workload.appEgressGib * rates['digitalocean-egress'].value,
    jobs: workload.jobInvocations * Math.max(60, workload.jobSecondsPerInvocation) * jobSecondRate,
    canaryAllocation: workload.canaryAllocationUsd,
    clerkOverage: Math.max(0, workload.clerkMru - 50_000) * rates['clerk-pro-mru-overage'].value,
  };
  const infrastructureCostUsd = Object.values(infrastructure).reduce((sum, value) => sum + value, 0);
  const paymentFeeUsd = workload.priceUsd > 0
    ? workload.priceUsd * (rates['stripe-domestic-card'].value + sensitivity.stripeVariableSurcharge)
      + rates['stripe-domestic-card'].fixedValue
    : 0;
  const totalCostUsd = infrastructureCostUsd + paymentFeeUsd;
  const grossMarginPct = workload.priceUsd > 0
    ? (workload.priceUsd - totalCostUsd) / workload.priceUsd * 100
    : null;
  return { infrastructure, predictions, infrastructureCostUsd, paymentFeeUsd, totalCostUsd, grossMarginPct };
}

export function calculateScenario(inputs, scenarioId, sensitivityId = 'base', now = new Date()) {
  assertValidInputs(inputs, now);
  const workload = inputs.scenarios.find((scenario) => scenario.id === scenarioId);
  if (!workload) throw new Error(`unknown scenario: ${scenarioId}`);
  const sensitivity = inputs.policy.sensitivity[sensitivityId];
  if (!sensitivity) throw new Error(`unknown sensitivity: ${sensitivityId}`);
  const raw = calculateScenarioRaw(inputs, workload, sensitivity);
  return {
    id: workload.id,
    label: workload.label,
    sensitivity: sensitivityId,
    priceUsd: workload.priceUsd,
    predictions: round(raw.predictions, 1),
    infrastructure: Object.fromEntries(Object.entries(raw.infrastructure).map(([key, value]) => [key, round(value, 6)])),
    infrastructureCostUsd: raw.infrastructureCostUsd,
    paymentFeeUsd: raw.paymentFeeUsd,
    totalCostUsd: raw.totalCostUsd,
    grossMarginPct: raw.grossMarginPct,
  };
}

export function minimumPriceForMargin(inputs, scenarioId, targetMargin = 0.7, now = new Date()) {
  assertValidInputs(inputs, now);
  const workload = inputs.scenarios.find((scenario) => scenario.id === scenarioId);
  if (!workload) throw new Error(`unknown scenario: ${scenarioId}`);
  const result = calculateScenarioRaw(inputs, workload, inputs.policy.sensitivity.high);
  const high = inputs.policy.sensitivity.high;
  const stripe = rateMap(inputs)['stripe-domestic-card'];
  const variablePaymentRate = stripe.value + high.stripeVariableSurcharge;
  return ceilCents(
    (result.infrastructureCostUsd + stripe.fixedValue)
      / (1 - targetMargin - variablePaymentRate),
  );
}

export function calculateLiveKnownFloor(inputs, now = new Date()) {
  assertValidInputs(inputs, now);
  const rates = rateMap(inputs);
  const live = inputs.liveUsage;
  const blobStorage = live.storage.blobBytes / 1_000_000_000 * rates['vercel-blob-storage'].value;
  const databaseStorage = live.database.databaseBytes / 1_000_000_000
    * rates['neon-database-storage'].value;
  const knownSplootFloorUsd = rates['digitalocean-web-service'].value
    + live.digitalOcean.embeddingJobEstimatedMonthlyUsd
    + blobStorage
    + databaseStorage;
  return {
    blobStorageUsd: round(blobStorage, 4),
    databaseStorageUsd: round(databaseStorage, 4),
    knownSplootFloorUsd: round(knownSplootFloorUsd, 2),
    accountPreviewDifferenceUsd: round(
      live.digitalOcean.invoicePreviewUsd - knownSplootFloorUsd,
      2,
    ),
  };
}

function scenarioTable(inputs, now = new Date()) {
  return inputs.scenarios.map((scenario) => {
    const low = calculateScenario(inputs, scenario.id, 'low', now);
    const base = calculateScenario(inputs, scenario.id, 'base', now);
    const high = calculateScenario(inputs, scenario.id, 'high', now);
    return `| ${scenario.label} | ${money(scenario.priceUsd)} | ${money(low.totalCostUsd)} | ${money(base.totalCostUsd)} | ${money(high.totalCostUsd)} | ${percent(high.grossMarginPct)} |`;
  }).join('\n');
}

const rateTable = (inputs) => inputs.rates
  .map((rate) => {
    const fixed = typeof rate.fixedValue === 'number' ? ` + ${money(rate.fixedValue)} fixed` : '';
    return `| ${rate.provider} | ${rate.capabilities.join(', ')} | ${rateMoney(rate.value)}${fixed} / ${rate.unit} | ${rate.includedAllowance ?? 'none'} | [official source](${rate.sourceUrl}) | ${rate.retrievedAt} |`;
  })
  .join('\n');

const budgetTable = (inputs) => Object.entries(inputs.policy.planBudgets)
  .map(([plan, budget]) => `| ${plan} | ${money(budget.monthlyInfrastructureUsd)} | ${money(budget.dailyInferenceUsd)} (${budget.dailyInferenceAttempts} attempts) | ${money(budget.monthlyInferenceUsd)} (${budget.monthlyInferenceAttempts} attempts) |`)
  .join('\n');

export function buildReport(inputs, now = new Date()) {
  assertValidInputs(inputs, now);
  const freeHigh = calculateScenario(inputs, 'free', 'high', now);
  const collectorHigh = calculateScenario(inputs, 'collector', 'high', now);
  const archiveHigh = calculateScenario(inputs, 'archive', 'high', now);
  const collectorFloor = minimumPriceForMargin(inputs, 'collector', 0.7, now);
  const archiveFloor = minimumPriceForMargin(inputs, 'archive', 0.7, now);
  const liveFloor = calculateLiveKnownFloor(inputs, now);
  const freePool = freeHigh.totalCostUsd * inputs.policy.freeFullAllowanceAccounts;
  const live = inputs.liveUsage;
  const plans = Object.fromEntries(inputs.scenarios.map((scenario) => [scenario.id, scenario]));
  const refreshDate = inputs.rates[0].retrievedAt;
  const providerCaps = inputs.policy.providerHardCaps
    .map((cap) => `- **${cap.provider}:** target ${cap.amountUsd === null ? 'amount unknown' : money(cap.amountUsd)} per ${cap.period}; action: ${cap.action}; enforcement: ${cap.enforcementStatus}; evidence: ${cap.evidenceStatus} (${cap.evidenceNote}).`)
    .join('\n');
  const unknowns = live.unknowns.map((item) => `- **${item.name}:** unknown, not zero. ${item.impact}`).join('\n');
  const vercelCategories = live.vercel.categories
    .map((category) => `${category.name} ${preciseMoney(category.effectiveUsageUsd, 6)}`)
    .join(', ');
  const highInferenceReservePct = (inputs.policy.sensitivity.high.inferenceAttemptMultiplier - 1) * 100;
  const sensitivitySummary = [
    `physical rendition overhead (${sensitivityMultiplierText(inputs, 'renditionMultiplier')})`,
    `Blob origin-miss share (${sensitivityPercentText(inputs, 'originMissRatio')})`,
    `potentially billed inference attempts (${sensitivityMultiplierText(inputs, 'inferenceAttemptMultiplier')})`,
    `database compute (${sensitivityMultiplierText(inputs, 'databaseComputeMultiplier')})`,
    `Stripe variable surcharge (${sensitivityPercentText(inputs, 'stripeVariableSurcharge')})`,
  ].join(', ');
  const sourceBytesTotal = live.storage.databaseSourceBytesLive + live.storage.databaseSourceBytesDeleted;
  const storageGapBytes = live.storage.blobBytes - sourceBytesTotal;
  const storageGapPct = sourceBytesTotal > 0 ? storageGapBytes / sourceBytesTotal * 100 : null;
  return `# Sploot economic safety envelope

Generated deterministically from the versioned inputs in this directory. Rates were refreshed on ${refreshDate} and CI expires them after ${inputs.policy.rateFreshnessDays} days. This is a release gate, not a forecast: paid-tier margins are modeled at on-demand rates so shared included pools cannot make an unprofitable plan look safe.

## Recommendation

- **Cardless Free:** ${plans.free.sourceTrashStorageGb} GB user-visible source-plus-trash allowance (rendition overhead is reserved separately), ${plans.free.uploads.toLocaleString('en-US')} new indexes and ${plans.free.uniqueTextQueries.toLocaleString('en-US')} novel text embeddings per month, ${plans.free.blobDeliveryGb} GB delivery, and at most ${inputs.policy.freeFullAllowanceAccounts} project-wide full-allowance equivalents before waitlist/paid admission. High-case variable cost is ${money(freeHigh.totalCostUsd)} per full account and ${money(freePool)} for the pool, below the ${money(inputs.policy.global.preGaMonthlyVariableUsd)} subsidy ceiling.
- **Collector:** $${plans.collector.priceUsd}/month, ${plans.collector.sourceTrashStorageGb} GB, ${plans.collector.uploads.toLocaleString('en-US')} new indexes, ${plans.collector.uniqueTextQueries.toLocaleString('en-US')} novel text embeddings, and ${plans.collector.blobDeliveryGb} GB delivery. Modeled direct-variable COGS is ${money(collectorHigh.totalCostUsd)}; the fully loaded margin is unavailable until shared provider costs and a paid-customer mix are declared and read back.
- **Archive:** $${plans.archive.priceUsd}/month, ${plans.archive.sourceTrashStorageGb} GB, ${plans.archive.uploads.toLocaleString('en-US')} new indexes, ${plans.archive.uniqueTextQueries.toLocaleString('en-US')} novel text embeddings, and ${plans.archive.blobDeliveryGb} GB delivery. Modeled direct-variable COGS is ${money(archiveHigh.totalCostUsd)}; the fully loaded margin is unavailable until shared provider costs and a paid-customer mix are declared and read back.
- Existing content remains readable, exportable, and deletable after a cost boundary closes. No plan permits silent overage.

These are target candidates for entitlement and billing cards, not live promises. Enrollment is CLOSED. The runtime currently enforces attempt counters, provider-rate ceilings, and claim/lease safety, not durable provider-dollar admission, storage-ledger attribution, or reconciliation. International/FX Stripe charges, provider-plan readbacks, shared DigitalOcean/Vercel allocation, and hard-cap receipts are unmet GA prerequisites; GA remains fail-closed.

## Fully loaded margin status

The direct-variable table deliberately excludes shared DigitalOcean hosting and Vercel platform charges (compute, analytics, and observability). No paid-customer mix is declared, so those shared costs cannot be allocated without inventing attribution. The 70% direct-variable calculations are not fully loaded gross-margin evidence and do not establish release readiness.

## Workload and sensitivity results

Low/base/high vary ${sensitivitySummary}. Storage includes retained trash.

| Workload | Revenue | Low COGS | Base COGS | High COGS | High gross margin |
|---|---:|---:|---:|---:|---:|
${scenarioTable(inputs, now)}

The abusive and viral rows deliberately exceed their account/global budgets; they prove quotas must cover novel inference, bytes, and request delivery rather than storage alone.

## Modeled dollar ceilings translated to attempt caps

| Plan | Monthly infrastructure ceiling | Daily inference ceiling | Monthly inference ceiling |
|---|---:|---:|---:|
${budgetTable(inputs)}

${inputs.policy.planBudgetSemantics} Plan inference ceilings include the high-sensitivity ${highInferenceReservePct.toFixed(0)}% retry/cancel reserve. The pre-GA modeled target is capped at ${money(inputs.policy.global.preGaDailyVariableUsd)}/day and ${money(inputs.policy.global.preGaMonthlyVariableUsd)}/month; runtime enforcement is by attempt counters and provider-rate safety, not dollar admission or reconciliation. Replicate's modeled target is ${money(inputs.policy.global.replicateDailyUsd)}/day (${inputs.policy.global.replicateDailyAttempts} attempts) and ${money(inputs.policy.global.replicateMonthlyUsd)}/month (${inputs.policy.global.replicateMonthlyAttempts} attempts); live billed dollars remain unknown. After a future cost-admission/storage-ledger implementation, the target monthly ceiling is \`${inputs.policy.global.paidMonthlyFormula}\`; it is not a current runtime guarantee.

## Provider control targets and evidence status

${providerCaps}

## Live reconciliation (redacted)

- Vercel Blob: ${live.storage.blobObjects.toLocaleString('en-US')} objects / ${(live.storage.blobBytes / 1_000_000).toFixed(1)} MB versus ${(live.storage.databaseSourceBytesLive / 1_000_000).toFixed(1)} MB live plus ${(live.storage.databaseSourceBytesDeleted / 1_000_000).toFixed(3)} MB deleted source bytes in Postgres (${(sourceBytesTotal / 1_000_000).toFixed(1)} MB total). The derived gap is ${storageGapBytes.toLocaleString('en-US')} bytes (${storageGapPct === null ? 'n/a' : `${storageGapPct.toFixed(2)}%`} of live-plus-deleted source bytes). ${live.storage.reconciliation}
- Neon/Postgres: ${(live.database.databaseBytes / 1_000_000).toFixed(1)} MB database, ${live.database.users} users, ${live.database.readyEmbeddings.toLocaleString('en-US')} ready embeddings.
- Replicate: latest ${live.inference.latestPredictionSample.size} predictions were ${live.inference.latestPredictionSample.failed} failed, ${live.inference.latestPredictionSample.canceled} canceled, and ${live.inference.latestPredictionSample.succeeded} succeeded. ${live.inference.reconciliation}
- DigitalOcean: invoice preview ${money(live.digitalOcean.invoicePreviewUsd)} versus account month-to-date usage ${money(live.digitalOcean.monthToDateUsageUsd)}, a named ${money(live.digitalOcean.namedVarianceUsd)} variance. ${live.digitalOcean.varianceExplanation}
  - Fixed baseline: the Sploot web service is ${money(rateMap(inputs)['digitalocean-web-service'].value)}/month. The current sleep-heavy embedding schedule is estimated at ${money(live.digitalOcean.embeddingJobEstimatedMonthlyUsd)}/month before other short jobs; Canary is a ${money(rateMap(inputs)['canary-shared-service'].value)}/month service shared across projects. These fixed costs are visible but excluded from the Vision's ${money(inputs.policy.global.preGaMonthlyVariableUsd)} variable free-subsidy ratchet and per-account margin.
- Vercel project (${live.vercel.periodStart}..${live.vercel.periodEnd}): effective usage ${preciseMoney(live.vercel.projectEffectiveUsageUsd)}, including ${vercelCategories}, plus a ${preciseMoney(live.vercel.subCentRemainderUsd)} aggregate remainder where each remaining category is below $0.01. ${live.vercel.reconciliation} ${live.vercel.blobAttribution}
- Modeled known-cost reconciliation: current web, embedding-job schedule, Blob bytes at the on-demand rate, and database bytes at the Launch storage rate produce a ${money(liveFloor.knownSplootFloorUsd)} monthly baseline. It deliberately excludes unknown history/WAL, operations, and transfer rather than treating them as zero. The ${money(liveFloor.accountPreviewDifferenceUsd)} difference to the account-wide invoice preview is deliberately not attributed to Sploot: it contains unrelated apps, Canary allocation, other jobs, transfer/operations, and endpoint timing.
- Canary: ${live.telemetry.errors30d.toLocaleString('en-US')} Sploot errors in 30 days. ${live.telemetry.reconciliation}
- GitHub: public repository, ${live.github.activeCacheCount} active caches / ${(live.github.activeCacheBytes / 2 ** 30).toFixed(2)} GiB. ${live.github.reconciliation}

### Unresolved provider readbacks

${unknowns}

## Rate registry

| Provider | Capabilities | Rate | Included allowance | Authority | Retrieved |
|---|---|---:|---|---|---|
${rateTable(inputs)}
`;
}

async function main() {
  const inputs = await loadInputs();
  const errors = validateInputs(inputs);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  const report = buildReport(inputs);
  if (process.argv.includes('--write')) {
    await writeFile(new URL('REPORT.md', ROOT), report);
    process.stdout.write('wrote economics/REPORT.md\n');
  } else {
    process.stdout.write(report);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
