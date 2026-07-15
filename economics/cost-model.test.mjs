import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildReport,
  calculateLiveKnownFloor,
  calculateScenario,
  loadInputs,
  minimumPriceForMargin,
  validateInputs,
} from './cost-model.mjs';

const REQUIRED_CAPABILITIES = new Set([
  'storage',
  'retained-trash',
  'renditions',
  'blob-operations',
  'blob-egress',
  'image-inference',
  'text-inference',
  'vector-storage',
  'database-compute',
  'app-compute',
  'app-bandwidth',
  'logs',
  'auth',
  'telemetry-canary',
  'jobs',
  'payment-fees',
]);

test('the rate registry names every cost-bearing capability and its authority', async () => {
  const inputs = await loadInputs();
  assert.deepEqual(validateInputs(inputs), []);

  const covered = new Set(inputs.rates.flatMap((rate) => rate.capabilities));
  assert.deepEqual(
    [...REQUIRED_CAPABILITIES].filter((capability) => !covered.has(capability)),
    [],
  );

  for (const rate of inputs.rates) {
    assert.match(rate.sourceUrl, /^https:\/\//);
    assert.match(rate.retrievedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(rate.unit.length > 0);
    assert.ok(Object.hasOwn(rate, 'includedAllowance'));
    assert.ok(rate.planAssumption.length > 0);
  }

  assert.match(
    validateInputs(inputs, new Date('2026-08-15T00:00:00Z')).join('\n'),
    /rate sheet expired/,
  );

  const replicate = inputs.rates.find((rate) => rate.id === 'replicate-clip-prediction');
  assert.equal(replicate.value, 0.00022);
  assert.equal(replicate.sourceUrl, 'https://replicate.com/krthr/clip-embeddings');
  assert.equal(replicate.sourceEvidence.provider, 'Replicate');
  assert.equal(replicate.sourceEvidence.value, 0.00022);
  assert.equal(replicate.sourceEvidence.currency, 'USD');
  assert.equal(replicate.sourceEvidence.sourceUrl, replicate.sourceUrl);
  assert.equal(replicate.sourceEvidence.reviewerRole, 'economics reviewer');
  assert.equal(replicate.sourceEvidence.runsPerUsd, 4545);
  assert.match(replicate.sourceEvidence.evidenceDigest, /^[0-9a-f]{64}$/);
  assert.equal(replicate.sourceEvidenceType, 'provider_model_page_estimate');
  const vercelOrigin = inputs.rates.find((rate) => rate.id === 'vercel-fast-origin-transfer');
  assert.equal(vercelOrigin.value, 0.06);
  assert.equal(vercelOrigin.sourceUrl, 'https://vercel.com/docs/manage-cdn-usage');
  assert.match(vercelOrigin.includedAllowance, /Hobby: first 10 GB; Pro: N\/A/);

  const genericRate = inputs.rates.find((rate) => rate.id === 'neon-launch-compute');
  for (const [label, field, value] of [
    ['provider', 'provider', 'Other provider'],
    ['value', 'value', 0.107],
    ['unit', 'unit', 'CU-minute'],
    ['currency', 'currency', 'EUR'],
    ['source', 'sourceUrl', 'https://neon.com/pricing/other'],
    ['reviewer', 'reviewer', 'other-reviewer'],
    ['digest', 'evidenceDigest', '0'.repeat(64)],
  ]) {
    const changed = structuredClone(inputs);
    const rate = changed.rates.find((candidate) => candidate.id === genericRate.id);
    rate.sourceEvidence[field] = value;
    if (field === 'value') rate.value = value;
    assert.notDeepEqual(validateInputs(changed), [], `generic rate ${label} mutation must fail`);
  }
});

test('malformed or incomplete inputs fail closed instead of becoming zero or NaN', async () => {
  assert.deepEqual(validateInputs(null), ['inputs object is required']);

  const inputs = await loadInputs();
  const missingRate = structuredClone(inputs);
  missingRate.rates = missingRate.rates.filter((rate) => rate.id !== 'vercel-blob-storage');
  assert.match(validateInputs(missingRate).join('\n'), /required rate missing: vercel-blob-storage/);
  assert.throws(
    () => calculateScenario(missingRate, 'free', 'high'),
    /required rate missing: vercel-blob-storage/,
  );

  const missingWorkloadField = structuredClone(inputs);
  delete missingWorkloadField.scenarios[0].blobDeliveryGb;
  assert.match(
    validateInputs(missingWorkloadField).join('\n'),
    /scenario free.blobDeliveryGb must be a finite nonnegative number/,
  );
  assert.throws(
    () => calculateScenario(missingWorkloadField, 'free', 'high'),
    /scenario free.blobDeliveryGb must be a finite nonnegative number/,
  );

  const duplicateScenarioIds = structuredClone(inputs);
  duplicateScenarioIds.scenarios[1].id = duplicateScenarioIds.scenarios[0].id;
  assert.match(
    validateInputs(duplicateScenarioIds).join('\n'),
    /duplicate scenario: free/,
  );
  assert.throws(
    () => calculateScenario(duplicateScenarioIds, 'free', 'high'),
    /duplicate scenario: free/,
  );

  const malformedPolicy = structuredClone(inputs);
  malformedPolicy.policy.planBudgets.free.monthlyInfrastructureUsd = Number.NaN;
  malformedPolicy.policy.global.replicateDailyAttempts = -1;
  malformedPolicy.policy.providerHardCaps = [];
  const policyErrors = validateInputs(malformedPolicy).join('\n');
  assert.match(policyErrors, /policy\.planBudgets\.free\.monthlyInfrastructureUsd/);
  assert.match(policyErrors, /policy\.global\.replicateDailyAttempts/);
  assert.match(policyErrors, /policy\.providerHardCaps must be a non-empty array/);

  const unsupportedPolicySchema = structuredClone(inputs);
  unsupportedPolicySchema.policy.schemaVersion = 2;
  assert.match(validateInputs(unsupportedPolicySchema).join('\n'), /policy\.schemaVersion must be 1/);

  const missingProviderCap = structuredClone(inputs);
  missingProviderCap.policy.providerHardCaps = missingProviderCap.policy.providerHardCaps.slice(1);
  assert.match(validateInputs(missingProviderCap).join('\n'), /exactly the required provider set/);

  const staleProviderEvidence = structuredClone(inputs);
  staleProviderEvidence.policy.providerHardCaps[0].evidenceStatus = 'verified';
  staleProviderEvidence.policy.providerHardCaps[0].evidence = { source: 'redacted' };
  staleProviderEvidence.policy.providerHardCaps[0].lastVerifiedAt = '2020-01-01T00:00:00Z';
  assert.match(validateInputs(staleProviderEvidence).join('\n'), /provider cap evidence stale/);

  const emptyVerifiedProviderEvidence = structuredClone(inputs);
  emptyVerifiedProviderEvidence.policy.providerHardCaps[0].evidenceStatus = 'verified';
  emptyVerifiedProviderEvidence.policy.providerHardCaps[0].evidence = {};
  emptyVerifiedProviderEvidence.policy.providerHardCaps[0].lastVerifiedAt = '2026-07-15T10:00:00Z';
  assert.match(
    validateInputs(emptyVerifiedProviderEvidence).join('\n'),
    /complete machine-readable object|\.provider must be a non-empty string/,
  );

  const incompleteVerifiedProviderEvidence = structuredClone(inputs);
  incompleteVerifiedProviderEvidence.policy.providerHardCaps[0].evidenceStatus = 'verified';
  incompleteVerifiedProviderEvidence.policy.providerHardCaps[0].evidence = {
    provider: 'Application admission',
    account: null,
    control: 'application admission',
    scope: 'calendar month',
    value: 25,
    unit: 'USD per calendar month',
    currency: 'USD',
    receiptIdentifier: 'test-fixture-receipt',
    receiptClass: 'internal-control-record',
    observedAt: '2026-07-15T10:00:00Z',
    reviewer: 'economics-review',
    secret: 'must-not-be-accepted',
  };
  incompleteVerifiedProviderEvidence.policy.providerHardCaps[0].lastVerifiedAt = '2026-07-15T10:00:00Z';
  assert.match(validateInputs(incompleteVerifiedProviderEvidence).join('\n'), /not an allowed evidence field/);

  const evidenceNow = new Date('2026-07-15T14:00:00Z');
  const validEvidence = {
    provider: 'Application admission',
    account: null,
    control: 'application admission',
    scope: 'calendar month',
    value: 25,
    unit: 'USD per calendar month',
    currency: 'USD',
    receiptIdentifier: 'test-fixture-receipt',
    receiptClass: 'internal-control-record',
    observedAt: '2026-07-15T10:00:00Z',
    reviewer: 'economics-review',
    reviewerRole: 'economics reviewer',
  };
  const validVerifiedProviderEvidence = structuredClone(inputs);
  validVerifiedProviderEvidence.policy.providerHardCaps[0].evidenceStatus = 'verified';
  validVerifiedProviderEvidence.policy.providerHardCaps[0].evidence = structuredClone(validEvidence);
  validVerifiedProviderEvidence.policy.providerHardCaps[0].lastVerifiedAt = '2026-07-15T10:00:00Z';
  assert.match(
    validateInputs(validVerifiedProviderEvidence, evidenceNow).join('\n'),
    /receiptClass is not authorized|evidenceDigest must be a non-empty string/,
  );

  const fabricatedReplicateReceipt = structuredClone(inputs);
  const replicateCap = fabricatedReplicateReceipt.policy.providerHardCaps
    .find((cap) => cap.provider === 'Replicate');
  replicateCap.evidenceStatus = 'verified';
  replicateCap.evidence = {
    provider: 'Replicate',
    account: 'replicate-production-redacted',
    control: 'monthly provider spend control',
    scope: 'calendar month',
    value: 15,
    unit: 'USD per calendar month',
    currency: 'USD',
    receiptIdentifier: 'replicate-billing-export:invented',
    receiptClass: 'provider-billing-export',
    observedAt: '2026-07-15T10:00:00Z',
    reviewer: 'economics-review',
    reviewerRole: 'economics reviewer',
    evidenceDigest: '0'.repeat(64),
  };
  replicateCap.lastVerifiedAt = '2026-07-15T10:00:00Z';
  assert.match(
    validateInputs(fabricatedReplicateReceipt, evidenceNow).join('\n'),
    /receiptClass is not authorized|evidenceDigest does not match/,
    'an opaque or self-attested Replicate receipt cannot establish verified spend authority',
  );

  const evidenceMutations = [
    ['wrong provider', { provider: 'Replicate' }],
    ['wrong account', { account: 'wrong-account' }],
    ['wrong control', { control: 'monthly cap' }],
    ['wrong scope', { scope: 'billing period' }],
    ['wrong value', { value: 25.01 }],
    ['wrong unit', { unit: 'USD per upload' }],
    ['wrong currency', { currency: 'EUR' }],
    ['alternate valid https source', { sourceUrl: 'https://replicate.com/pricing' }],
    ['wrong reviewer', { reviewer: 'other-reviewer' }],
    ['empty evidence', {}],
    ['partial evidence', { reviewerRole: undefined }],
    ['stale observedAt', { observedAt: '2020-01-01T00:00:00Z' }],
    ['one-minute future observedAt within prior grace', { observedAt: '2026-07-15T14:01:00Z' }],
    ['one-minute future lastVerifiedAt within prior grace', { lastVerifiedAt: '2026-07-15T14:01:00Z' }],
    ['NaN value', { value: Number.NaN }],
    ['Infinity value', { value: Number.POSITIVE_INFINITY }],
    ['rounding value', { value: 25.0000000001 }],
  ];
  for (const [label, mutation] of evidenceMutations) {
    const changed = structuredClone(validVerifiedProviderEvidence);
    if (label === 'empty evidence') {
      changed.policy.providerHardCaps[0].evidence = {};
    } else {
      const evidenceMutation = { ...mutation };
      if (label === 'alternate valid https source') {
        delete changed.policy.providerHardCaps[0].evidence.receiptIdentifier;
        delete changed.policy.providerHardCaps[0].evidence.receiptClass;
      }
      if (label === 'partial evidence') delete changed.policy.providerHardCaps[0].evidence.reviewerRole;
      if (Object.hasOwn(mutation, 'lastVerifiedAt')) delete evidenceMutation.lastVerifiedAt;
      Object.assign(changed.policy.providerHardCaps[0].evidence, evidenceMutation);
      if (Object.hasOwn(mutation, 'lastVerifiedAt')) {
        changed.policy.providerHardCaps[0].lastVerifiedAt = mutation.lastVerifiedAt;
      }
    }
    assert.notDeepEqual(validateInputs(changed, evidenceNow), [], label);
  }

  const staleObservedProviderEvidence = structuredClone(validVerifiedProviderEvidence);
  staleObservedProviderEvidence.policy.providerHardCaps[0].evidence.observedAt = '2020-01-01T00:00:00Z';
  staleObservedProviderEvidence.policy.providerHardCaps[0].lastVerifiedAt = '2026-07-15T10:00:00Z';
  assert.match(validateInputs(staleObservedProviderEvidence).join('\n'), /provider cap evidence stale|evidence\.observedAt is stale/);

  const overConfiguredPreGaCap = structuredClone(inputs);
  overConfiguredPreGaCap.policy.global.preGaMonthlyVariableUsd = 250;
  assert.match(
    validateInputs(overConfiguredPreGaCap).join('\n'),
    /preGaMonthlyVariableUsd must not exceed \$25/,
  );
  assert.throws(
    () => calculateScenario(overConfiguredPreGaCap, 'free', 'high'),
    /preGaMonthlyVariableUsd must not exceed \$25/,
  );

  const divergentDates = structuredClone(inputs);
  divergentDates.rates[0].retrievedAt = '2026-07-14';
  assert.match(validateInputs(divergentDates).join('\n'), /rate registry must use one retrieval date/);
});

test('Replicate rate evidence is independent of recomputed policy caps', async () => {
  const inputs = await loadInputs();
  const changed = structuredClone(inputs);
  const newRate = 0.0001;
  const replicate = changed.rates.find((rate) => rate.id === 'replicate-clip-prediction');
  replicate.value = newRate;
  for (const budget of Object.values(changed.policy.planBudgets)) {
    for (const [usdKey, attemptsKey] of [
      ['dailyInferenceUsd', 'dailyInferenceAttempts'],
      ['monthlyInferenceUsd', 'monthlyInferenceAttempts'],
    ]) {
      budget[attemptsKey] = Math.floor(budget[usdKey] / newRate);
      budget[usdKey] = Number((budget[attemptsKey] * newRate).toFixed(6));
    }
  }
  for (const [usdKey, attemptsKey] of [
    ['replicateDailyUsd', 'replicateDailyAttempts'],
    ['replicateMonthlyUsd', 'replicateMonthlyAttempts'],
  ]) {
    changed.policy.global[attemptsKey] = Math.floor(changed.policy.global[usdKey] / newRate);
    changed.policy.global[usdKey] = Number((changed.policy.global[attemptsKey] * newRate).toFixed(6));
  }
  for (const cap of changed.policy.providerHardCaps) {
    if (cap.amountUsd !== null) cap.amountUsd = Number((cap.amountUsd * newRate / 0.00022).toFixed(6));
  }
  const errors = validateInputs(changed).join('\n');
  assert.match(errors, /value must match the policy evidence contract|value does not match the evidence contract/);
});

test('Replicate runsPerUsd is derived from the reviewed rate', async () => {
  const inputs = await loadInputs();
  const changed = structuredClone(inputs);
  changed.rates.find((rate) => rate.id === 'replicate-clip-prediction').sourceEvidence.runsPerUsd = 4546;
  assert.match(validateInputs(changed).join('\n'), /runsPerUsd must equal floor\(1 \/ reviewed value\)/);
});

test('mutable caps and derived attempt ceilings fail without the policy-bound formula', async () => {
  const inputs = await loadInputs();
  const mutations = [
    ['plan dollar cap', (changed) => { changed.policy.planBudgets.free.monthlyInferenceUsd += 0.00022; }],
    ['plan attempt cap', (changed) => { changed.policy.planBudgets.free.monthlyInferenceAttempts += 1; }],
    ['global dollar ceiling', (changed) => { changed.policy.global.replicateMonthlyUsd += 0.00022; }],
    ['global attempt ceiling', (changed) => { changed.policy.global.replicateMonthlyAttempts += 1; }],
    ['provider cap amount', (changed) => { changed.policy.providerHardCaps.find((cap) => cap.provider === 'Replicate').amountUsd = 14.99; }],
  ];
  for (const [label, mutate] of mutations) {
    const changed = structuredClone(inputs);
    mutate(changed);
    assert.notDeepEqual(validateInputs(changed), [], `${label} mutation must fail`);
  }
});

test('every required live usage field is validated table-first', async () => {
  const inputs = await loadInputs();
  const cases = [
    ['storage.blobBytes', (live) => delete live.storage.blobBytes, /liveUsage\.storage\.blobBytes/],
    ['database.databaseBytes NaN', (live) => { live.database.databaseBytes = Number.NaN; }, /liveUsage\.database\.databaseBytes/],
    ['github.activeCacheBytes Infinity', (live) => { live.github.activeCacheBytes = Number.POSITIVE_INFINITY; }, /liveUsage\.github\.activeCacheBytes/],
    ['capturedAt missing', (live) => delete live.capturedAt, /liveUsage\.capturedAt/],
    ['inference sample from missing', (live) => delete live.inference.latestPredictionSample.from, /liveUsage\.inference\.latestPredictionSample\.from/],
    ['stale capturedAt', (live) => { live.capturedAt = '2026-01-01T00:00:00Z'; }, /liveUsage\.capturedAt is stale/],
  ];

  for (const [label, mutate, expected] of cases) {
    const changed = structuredClone(inputs);
    mutate(changed.liveUsage);
    assert.match(validateInputs(changed).join('\n'), expected, label);
    assert.throws(() => calculateLiveKnownFloor(changed), expected, label);
  }
});

test('live usage reconciles without identifiers or silently-zero unknowns', async () => {
  const inputs = await loadInputs();
  const serialized = JSON.stringify(inputs.liveUsage);
  assert.doesNotMatch(serialized, /token|secret|account[_ -]?id|invoice[_ -]?(id|uuid)/i);
  assert.equal(inputs.liveUsage.storage.blobObjects, 6_461);
  assert.equal(inputs.liveUsage.storage.blobBytes, 532_395_408);
  assert.equal(inputs.liveUsage.database.databaseBytes, 42_016_768);
  assert.equal(inputs.liveUsage.inference.latestPredictionSample.failed, 95);
  assert.equal(inputs.liveUsage.telemetry.errors30d, 5_917);
  assert.equal(inputs.liveUsage.digitalOcean.monthToDateUsageUsd, 45.84);
  assert.equal(inputs.liveUsage.digitalOcean.invoicePreviewUsd, 41.69);
  assert.equal(inputs.liveUsage.digitalOcean.namedVarianceUsd, 4.15);
  const vercel = inputs.liveUsage.vercel;
  const vercelCategoryTotal = vercel.categories.reduce(
    (sum, category) => sum + category.effectiveUsageUsd,
    0,
  );
  assert.equal(
    Number((vercelCategoryTotal + vercel.subCentRemainderUsd).toFixed(10)),
    vercel.projectEffectiveUsageUsd,
  );
  assert.equal(vercel.allowanceAbsorbedUsd, null);
  assert.equal(vercel.billedAfterAllowanceUsd, null);
  assert.equal(
    Number((inputs.liveUsage.digitalOcean.monthToDateUsageUsd
      - inputs.liveUsage.digitalOcean.invoicePreviewUsd).toFixed(2)),
    inputs.liveUsage.digitalOcean.namedVarianceUsd,
  );
  assert.ok(inputs.liveUsage.digitalOcean.varianceExplanation.length > 20);
  assert.ok(inputs.liveUsage.unknowns.every((unknown) => unknown.value === null));
});

test('free subsidy and direct-variable economics remain bounded without claiming fully loaded margin', async () => {
  const inputs = await loadInputs();
  const free = calculateScenario(inputs, 'free', 'high');
  const collector = calculateScenario(inputs, 'collector', 'high');
  const archive = calculateScenario(inputs, 'archive', 'high');

  assert.ok(free.totalCostUsd * inputs.policy.freeFullAllowanceAccounts < 25);
  assert.ok(collector.grossMarginPct >= 0);
  assert.ok(archive.grossMarginPct >= 0);
  assert.ok(collector.paymentFeeUsd > 12 * 0.029 + 0.3);
  assert.ok(archive.paymentFeeUsd > 49 * 0.029 + 0.3);
  assert.ok(13 >= minimumPriceForMargin(inputs, 'collector'));
  assert.ok(49 >= minimumPriceForMargin(inputs, 'archive'));
  assert.ok(collector.infrastructureCostUsd <= inputs.policy.planBudgets.collector.monthlyInfrastructureUsd);
  assert.ok(archive.infrastructureCostUsd <= inputs.policy.planBudgets.archive.monthlyInfrastructureUsd);
  for (const result of [free, collector, archive]) {
    const budget = inputs.policy.planBudgets[result.id];
    assert.ok(budget.monthlyInferenceAttempts >= result.predictions);
    assert.ok(budget.monthlyInferenceUsd >= result.infrastructure.inference);
  }
});

test('direct-variable price floors and target budgets use unrounded economics', async () => {
  const inputs = await loadInputs();
  const collector = calculateScenario(inputs, 'collector', 'high');
  assert.ok(collector.grossMarginPct >= 0, `exact Collector direct margin was ${collector.grossMarginPct}`);
  assert.equal(minimumPriceForMargin(inputs, 'collector'), 8.27);
  assert.equal(inputs.scenarios.find((scenario) => scenario.id === 'collector').priceUsd, 13);
  assert.ok(inputs.policy.planBudgets.free.monthlyInfrastructureUsd >= 0.4);
  assert.ok(inputs.policy.planBudgets.collector.monthlyInfrastructureUsd >= 3);
  assert.ok(inputs.policy.planBudgets.archive.monthlyInfrastructureUsd >= 13);
  for (const scenarioId of ['free', 'collector', 'archive']) {
    const scenario = inputs.scenarios.find((candidate) => candidate.id === scenarioId);
    const high = calculateScenario(inputs, scenarioId, 'high');
    assert.ok(
      inputs.policy.planBudgets[scenarioId].monthlyInfrastructureUsd >= high.infrastructureCostUsd,
      `${scenarioId} cap must cover exact high-case infrastructure cost`,
    );
    if (scenario.priceUsd > 0) assert.ok(high.grossMarginPct >= 0);
  }
});

test('known live costs reconcile to a named account-level remainder', async () => {
  const inputs = await loadInputs();
  const floor = calculateLiveKnownFloor(inputs);
  assert.equal(floor.knownSplootFloorUsd, 28.36);
  assert.equal(floor.accountPreviewDifferenceUsd, 13.33);
});

test('abusive and viral workloads trip explicit dollar budgets', async () => {
  const inputs = await loadInputs();
  const abusive = calculateScenario(inputs, 'abusive', 'high');
  const viral = calculateScenario(inputs, 'viral-share', 'high');

  assert.ok(abusive.infrastructureCostUsd > inputs.policy.planBudgets.free.monthlyInfrastructureUsd);
  assert.ok(viral.infrastructureCostUsd > inputs.policy.global.preGaMonthlyVariableUsd);
  assert.ok(inputs.policy.global.preGaDailyVariableUsd > 0);
  assert.equal(inputs.policy.enrollmentMode, 'CLOSED');
  assert.deepEqual(
    inputs.policy.providerHardCaps.map((cap) => cap.provider),
    ['Application admission', 'Replicate', 'Vercel Blob/CDN', 'Neon', 'DigitalOcean', 'Clerk', 'Stripe'],
  );
  assert.ok(inputs.policy.providerHardCaps.every((cap) => cap.evidenceStatus === 'unverified'));
});

test('DigitalOcean jobs apply a one-minute minimum per invocation and bound each run', async () => {
  const inputs = await loadInputs();
  const free = calculateScenario(inputs, 'free', 'base');
  const rate = inputs.rates.find((candidate) => candidate.id === 'digitalocean-small-job-runtime').value;
  assert.equal(free.infrastructure.jobs, Number((rate / (30 * 24 * 60 * 60) * 60).toFixed(6)));

  const adversarial = structuredClone(inputs);
  adversarial.scenarios[0].jobInvocations = 2;
  adversarial.scenarios[0].jobSecondsPerInvocation = 1;
  const twoMinimumRuns = calculateScenario(adversarial, 'free', 'base');
  assert.equal(twoMinimumRuns.infrastructure.jobs, Number((rate / (30 * 24 * 60 * 60) * 120).toFixed(6)));

  const unbounded = structuredClone(inputs);
  unbounded.scenarios[0].jobSecondsPerInvocation = 3601;
  assert.match(validateInputs(unbounded).join('\n'), /exceeds the one-run bound/);
});

test('the checked-in report is exactly reproducible', async () => {
  const inputs = await loadInputs();
  const expected = buildReport(inputs);
  const actual = await readFile(new URL('./REPORT.md', import.meta.url), 'utf8');
  assert.equal(actual, expected);
});

test('recommendations are derived from versioned rates and workloads', async () => {
  const inputs = await loadInputs();
  const changed = structuredClone(inputs);
  const free = changed.scenarios.find((scenario) => scenario.id === 'free');
  const collector = changed.scenarios.find((scenario) => scenario.id === 'collector');
  free.sourceTrashStorageGb = 0.75;
  collector.priceUsd = 13;

  const report = buildReport(changed, new Date('2026-07-15T14:00:00Z'));
  assert.match(report, /Rates were refreshed on 2026-07-15/);
  assert.match(report, /Cardless Free:\*\* 0\.75 GB/);
  assert.match(report, /Collector:\*\* \$13\/month/);
  assert.match(report, /fully loaded margin is unavailable/);
  assert.match(report, /live-plus-deleted source bytes/);
});

test('all sensitivity prose is derived from policy inputs', async () => {
  const inputs = await loadInputs();
  const changed = structuredClone(inputs);
  changed.policy.sensitivity.low.renditionMultiplier = 1.01;
  changed.policy.sensitivity.base.originMissRatio = 0.22;
  changed.policy.sensitivity.high.inferenceAttemptMultiplier = 1.35;
  changed.policy.sensitivity.low.databaseComputeMultiplier = 0.66;
  changed.policy.sensitivity.base.stripeVariableSurcharge = 0.017;
  changed.scenarios.find((scenario) => scenario.id === 'collector').priceUsd = 100;
  changed.scenarios.find((scenario) => scenario.id === 'archive').priceUsd = 100;

  const report = buildReport(changed);
  assert.match(report, /1\.01×\/1\.10×\/1\.20×/);
  assert.match(report, /5%\/22%\/30%/);
  assert.match(report, /1\.00×\/1\.05×\/1\.35×/);
  assert.match(report, /0\.66×\/1\.00×\/1\.50×/);
  assert.match(report, /0%\/1\.7%\/2\.5%/);
  assert.match(report, /35% retry\/cancel reserve/);
  assert.doesNotMatch(report, /1\.05×\/1\.10×\/1\.20×/);
});
