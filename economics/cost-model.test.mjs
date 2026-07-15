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
  assert.equal(replicate.value, 0.00073);
  assert.equal(replicate.sourceUrl, 'https://replicate.com/krthr/clip-embeddings');
  assert.match(replicate.sourceEvidence, /0\.00073/);
  assert.match(replicate.sourceEvidence, /1369/);
  const vercelOrigin = inputs.rates.find((rate) => rate.id === 'vercel-fast-origin-transfer');
  assert.equal(vercelOrigin.value, 0.06);
  assert.equal(vercelOrigin.sourceUrl, 'https://vercel.com/docs/manage-cdn-usage');
  assert.match(vercelOrigin.includedAllowance, /Hobby: first 10 GB; Pro: N\/A/);
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

  const divergentDates = structuredClone(inputs);
  divergentDates.rates[0].retrievedAt = '2026-07-14';
  assert.match(validateInputs(divergentDates).join('\n'), /rate registry must use one retrieval date/);
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

test('free subsidy and paid full-allowance margins satisfy the vision ratchets', async () => {
  const inputs = await loadInputs();
  const free = calculateScenario(inputs, 'free', 'high');
  const collector = calculateScenario(inputs, 'collector', 'high');
  const archive = calculateScenario(inputs, 'archive', 'high');

  assert.ok(free.totalCostUsd * inputs.policy.freeFullAllowanceAccounts < 25);
  assert.ok(collector.grossMarginPct >= 70);
  assert.ok(archive.grossMarginPct >= 70);
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

test('paid margin and price-floor gates use unrounded economics', async () => {
  const inputs = await loadInputs();
  const collector = calculateScenario(inputs, 'collector', 'high');
  assert.ok(collector.grossMarginPct >= 70, `exact Collector margin was ${collector.grossMarginPct}`);
  assert.equal(minimumPriceForMargin(inputs, 'collector'), 12.01);
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
    if (scenario.priceUsd > 0) assert.ok(high.grossMarginPct >= 70);
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
  assert.ok(inputs.policy.providerHardCaps.every((cap) => cap.enforcement !== 'none'));
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
  changed.rates.forEach((rate) => { rate.retrievedAt = '2026-07-16'; });
  const free = changed.scenarios.find((scenario) => scenario.id === 'free');
  const collector = changed.scenarios.find((scenario) => scenario.id === 'collector');
  free.sourceTrashStorageGb = 0.75;
  collector.priceUsd = 13;
  changed.policy.planBudgets.free.monthlyInfrastructureUsd = 999;

  const report = buildReport(changed);
  assert.match(report, /Rates were refreshed on 2026-07-16/);
  assert.match(report, /Cardless Free:\*\* 0\.75 GB/);
  assert.match(report, /Collector:\*\* \$13\/month/);
});

test('all sensitivity prose is derived from policy inputs', async () => {
  const inputs = await loadInputs();
  const changed = structuredClone(inputs);
  changed.policy.sensitivity.low.renditionMultiplier = 1.01;
  changed.policy.sensitivity.base.originMissRatio = 0.22;
  changed.policy.sensitivity.high.inferenceAttemptMultiplier = 1.35;
  changed.policy.sensitivity.low.databaseComputeMultiplier = 0.66;
  changed.policy.sensitivity.base.stripeVariableSurcharge = 0.017;
  for (const budget of Object.values(changed.policy.planBudgets)) budget.monthlyInfrastructureUsd = 999;
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
