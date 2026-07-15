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
  'jobSeconds',
  'canaryAllocationUsd',
  'clerkMru',
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
  'telemetry.reconciliation',
  'github.repositoryVisibility',
  'github.reconciliation',
];
const REQUIRED_LIVE_TIMESTAMP_PATHS = [
  'capturedAt',
  'inference.latestPredictionSample.from',
  'inference.latestPredictionSample.to',
];
const round = (value, digits = 4) => Number(value.toFixed(digits));
const money = (value) => `$${value.toFixed(2)}`;
const percent = (value) => value === null ? 'n/a' : `${value.toFixed(1)}%`;
const rateMoney = (value) => value < 0.01 ? `$${value.toFixed(6)}` : value < 1 ? `$${value.toFixed(3)}` : money(value);
const sensitivityMultiplierText = (inputs, key) => ['low', 'base', 'high']
  .map((id) => `${inputs.policy.sensitivity[id][key].toFixed(2)}×`).join('/');
const sensitivityPercentText = (inputs, key) => ['low', 'base', 'high']
  .map((id) => `${(inputs.policy.sensitivity[id][key] * 100).toFixed(key === 'stripeVariableSurcharge' ? 1 : 0).replace(/\.0$/, '')}%`).join('/');
const getPath = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const ceilCents = (value) => Math.ceil((value - Number.EPSILON) * 100) / 100;

export async function loadInputs() {
  const [rates, liveUsage, workloads, policy] = await Promise.all(
    INPUT_FILES.map(async (name) => JSON.parse(await readFile(new URL(name, ROOT), 'utf8'))),
  );
  return { rates: rates.rates, liveUsage, scenarios: workloads.scenarios, policy };
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
    if (rate.id === 'replicate-clip-prediction'
      && (typeof rate.sourceEvidence !== 'string' || !rate.sourceEvidence.includes('0.00073')
        || !rate.sourceEvidence.includes('1369'))) {
      errors.push('source evidence missing: replicate-clip-prediction');
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

  for (const scenario of inputs.scenarios) {
    if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
      errors.push('scenario entries must be objects');
      continue;
    }
    if (typeof scenario.id !== 'string' || scenario.id.length === 0) errors.push('scenario id is required');
    if (typeof scenario.label !== 'string' || scenario.label.length === 0) errors.push(`scenario ${scenario.id ?? '<unknown>'}.label is required`);
    for (const key of REQUIRED_SCENARIO_NUMBERS) {
      const value = scenario[key];
      if (!Number.isFinite(value) || value < 0) {
        errors.push(`scenario ${scenario.id ?? '<unknown>'}.${key} must be a finite nonnegative number`);
      }
    }
  }

  if (!Number.isInteger(inputs.policy.rateFreshnessDays) || inputs.policy.rateFreshnessDays <= 0) {
    errors.push('policy.rateFreshnessDays must be a positive integer');
  }
  if (!Number.isInteger(inputs.policy.freeFullAllowanceAccounts)
    || inputs.policy.freeFullAllowanceAccounts <= 0) {
    errors.push('policy.freeFullAllowanceAccounts must be a positive integer');
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
      if (planId !== 'free' && Number.isFinite(high.grossMarginPct) && high.grossMarginPct < 70) {
        errors.push(`scenario ${planId} high-case gross margin must be at least 70% unrounded`);
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
    inputs.policy.providerHardCaps.forEach((cap, index) => {
      if (!cap || typeof cap !== 'object' || Array.isArray(cap)) {
        errors.push(`policy.providerHardCaps[${index}] must be an object`);
        return;
      }
      for (const key of ['provider', 'enforcement']) {
        if (typeof cap[key] !== 'string' || cap[key].length === 0) {
          errors.push(`policy.providerHardCaps[${index}].${key} must be a non-empty string`);
        }
      }
    });
  }
  return errors;
}

function assertValidInputs(inputs) {
  const errors = validateInputs(inputs);
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
    jobs: workload.jobSeconds * jobSecondRate,
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

export function calculateScenario(inputs, scenarioId, sensitivityId = 'base') {
  assertValidInputs(inputs);
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

export function minimumPriceForMargin(inputs, scenarioId, targetMargin = 0.7) {
  assertValidInputs(inputs);
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

export function calculateLiveKnownFloor(inputs) {
  assertValidInputs(inputs);
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

function scenarioTable(inputs) {
  return inputs.scenarios.map((scenario) => {
    const low = calculateScenario(inputs, scenario.id, 'low');
    const base = calculateScenario(inputs, scenario.id, 'base');
    const high = calculateScenario(inputs, scenario.id, 'high');
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

export function buildReport(inputs) {
  assertValidInputs(inputs);
  const freeHigh = calculateScenario(inputs, 'free', 'high');
  const collectorHigh = calculateScenario(inputs, 'collector', 'high');
  const archiveHigh = calculateScenario(inputs, 'archive', 'high');
  const collectorFloor = minimumPriceForMargin(inputs, 'collector');
  const archiveFloor = minimumPriceForMargin(inputs, 'archive');
  const liveFloor = calculateLiveKnownFloor(inputs);
  const freePool = freeHigh.totalCostUsd * inputs.policy.freeFullAllowanceAccounts;
  const live = inputs.liveUsage;
  const plans = Object.fromEntries(inputs.scenarios.map((scenario) => [scenario.id, scenario]));
  const refreshDate = inputs.rates[0].retrievedAt;
  const providerCaps = inputs.policy.providerHardCaps.map((cap) => `- **${cap.provider}:** ${cap.enforcement}.`).join('\n');
  const unknowns = live.unknowns.map((item) => `- **${item.name}:** unknown, not zero. ${item.impact}`).join('\n');
  const highInferenceReservePct = (inputs.policy.sensitivity.high.inferenceAttemptMultiplier - 1) * 100;
  const sensitivitySummary = [
    `physical rendition overhead (${sensitivityMultiplierText(inputs, 'renditionMultiplier')})`,
    `Blob origin-miss share (${sensitivityPercentText(inputs, 'originMissRatio')})`,
    `potentially billed inference attempts (${sensitivityMultiplierText(inputs, 'inferenceAttemptMultiplier')})`,
    `database compute (${sensitivityMultiplierText(inputs, 'databaseComputeMultiplier')})`,
    `Stripe variable surcharge (${sensitivityPercentText(inputs, 'stripeVariableSurcharge')})`,
  ].join(', ');
  return `# Sploot economic safety envelope

Generated deterministically from the versioned inputs in this directory. Rates were refreshed on ${refreshDate} and CI expires them after ${inputs.policy.rateFreshnessDays} days. This is a release gate, not a forecast: paid-tier margins charge on-demand rates so shared included pools cannot make an unprofitable plan look safe.

## Recommendation

- **Cardless Free:** ${plans.free.sourceTrashStorageGb} GB user-visible source-plus-trash allowance (rendition overhead is reserved separately), ${plans.free.uploads.toLocaleString('en-US')} new indexes and ${plans.free.uniqueTextQueries.toLocaleString('en-US')} novel text embeddings per month, ${plans.free.blobDeliveryGb} GB delivery, and at most ${inputs.policy.freeFullAllowanceAccounts} project-wide full-allowance equivalents before waitlist/paid admission. High-case variable cost is ${money(freeHigh.totalCostUsd)} per full account and ${money(freePool)} for the pool, below the ${money(inputs.policy.global.preGaMonthlyVariableUsd)} subsidy ceiling.
- **Collector:** $${plans.collector.priceUsd}/month, ${plans.collector.sourceTrashStorageGb} GB, ${plans.collector.uploads.toLocaleString('en-US')} new indexes, ${plans.collector.uniqueTextQueries.toLocaleString('en-US')} novel text embeddings, and ${plans.collector.blobDeliveryGb} GB delivery. High-case COGS is ${money(collectorHigh.totalCostUsd)} and gross margin is ${percent(collectorHigh.grossMarginPct)}. The computed 70%-margin price floor is ${money(collectorFloor)}.
- **Archive:** $${plans.archive.priceUsd}/month, ${plans.archive.sourceTrashStorageGb} GB, ${plans.archive.uploads.toLocaleString('en-US')} new indexes, ${plans.archive.uniqueTextQueries.toLocaleString('en-US')} novel text embeddings, and ${plans.archive.blobDeliveryGb} GB delivery. High-case COGS is ${money(archiveHigh.totalCostUsd)} and gross margin is ${percent(archiveHigh.grossMarginPct)}. The computed 70%-margin price floor is ${money(archiveFloor)}.
- Existing content remains readable, exportable, and deletable after a cost boundary closes. No plan permits silent overage.

These are candidates for entitlement and billing cards, not live promises. International/FX Stripe charges, provider-plan readbacks, and hard-cap receipts must be locked before GA.

## Workload and sensitivity results

Low/base/high vary ${sensitivitySummary}. Storage includes retained trash.

| Workload | Revenue | Low COGS | Base COGS | High COGS | High gross margin |
|---|---:|---:|---:|---:|---:|
${scenarioTable(inputs)}

The abusive and viral rows deliberately exceed their account/global budgets; they prove quotas must cover novel inference, bytes, and request delivery rather than storage alone.

## Dollar-derived budgets

| Plan | Monthly infrastructure ceiling | Daily inference ceiling | Monthly inference ceiling |
|---|---:|---:|---:|
${budgetTable(inputs)}

${inputs.policy.planBudgetSemantics} Plan inference ceilings include the high-sensitivity ${highInferenceReservePct.toFixed(0)}% retry/cancel reserve, so full advertised use cannot exhaust its own budget merely because a provider attempt is retried. Pre-GA global variable spend is capped at ${money(inputs.policy.global.preGaDailyVariableUsd)}/day and ${money(inputs.policy.global.preGaMonthlyVariableUsd)}/month. Replicate is a sub-budget of ${money(inputs.policy.global.replicateDailyUsd)}/day (${inputs.policy.global.replicateDailyAttempts} attempts) and ${money(inputs.policy.global.replicateMonthlyUsd)}/month (${inputs.policy.global.replicateMonthlyAttempts} attempts). After paid admission, the monthly ceiling is \`${inputs.policy.global.paidMonthlyFormula}\`; daily is \`${inputs.policy.global.paidDailyFormula}\`. Counters reserve worst-case dollars transactionally before work and reconcile provider usage afterward.

## Provider hard-cap map

${providerCaps}

## Live reconciliation (redacted)

- Vercel Blob: ${live.storage.blobObjects.toLocaleString('en-US')} objects / ${(live.storage.blobBytes / 1_000_000).toFixed(1)} MB versus ${(live.storage.databaseSourceBytesLive / 1_000_000).toFixed(1)} MB of live source bytes in Postgres. ${live.storage.reconciliation}
- Neon/Postgres: ${(live.database.databaseBytes / 1_000_000).toFixed(1)} MB database, ${live.database.users} users, ${live.database.readyEmbeddings.toLocaleString('en-US')} ready embeddings.
- Replicate: latest ${live.inference.latestPredictionSample.size} predictions were ${live.inference.latestPredictionSample.failed} failed, ${live.inference.latestPredictionSample.canceled} canceled, and ${live.inference.latestPredictionSample.succeeded} succeeded. ${live.inference.reconciliation}
- DigitalOcean: invoice preview ${money(live.digitalOcean.invoicePreviewUsd)} versus account month-to-date usage ${money(live.digitalOcean.monthToDateUsageUsd)}, a named ${money(live.digitalOcean.namedVarianceUsd)} variance. ${live.digitalOcean.varianceExplanation}
  - Fixed baseline: the Sploot web service is ${money(rateMap(inputs)['digitalocean-web-service'].value)}/month. The current sleep-heavy embedding schedule is estimated at ${money(live.digitalOcean.embeddingJobEstimatedMonthlyUsd)}/month before other short jobs; Canary is a ${money(rateMap(inputs)['canary-shared-service'].value)}/month service shared across projects. These fixed costs are visible but excluded from the Vision's ${money(inputs.policy.global.preGaMonthlyVariableUsd)} variable free-subsidy ratchet and per-account margin.
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
