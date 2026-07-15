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

  assert.ok(free.totalCostUsd * inputs.policy.freeFullAllowanceAccounts <= 25);
  assert.ok(collector.grossMarginPct >= 70);
  assert.ok(archive.grossMarginPct >= 70);
  assert.ok(collector.paymentFeeUsd > 12 * 0.029 + 0.3);
  assert.ok(archive.paymentFeeUsd > 49 * 0.029 + 0.3);
  assert.ok(12 >= minimumPriceForMargin(inputs, 'collector'));
  assert.ok(49 >= minimumPriceForMargin(inputs, 'archive'));
  assert.ok(collector.infrastructureCostUsd <= inputs.policy.planBudgets.collector.monthlyInfrastructureUsd);
  assert.ok(archive.infrastructureCostUsd <= inputs.policy.planBudgets.archive.monthlyInfrastructureUsd);
  for (const result of [free, collector, archive]) {
    const budget = inputs.policy.planBudgets[result.id];
    assert.ok(budget.monthlyInferenceAttempts >= result.predictions);
    assert.ok(budget.monthlyInferenceUsd >= result.infrastructure.inference);
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
