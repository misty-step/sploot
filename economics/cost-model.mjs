import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('./', import.meta.url);
const INPUT_FILES = ['rates.json', 'live-usage.json', 'workloads.json', 'policy.json'];
const round = (value, digits = 4) => Number(value.toFixed(digits));
const money = (value) => `$${value.toFixed(2)}`;
const percent = (value) => value === null ? 'n/a' : `${value.toFixed(1)}%`;
const rateMoney = (value) => value < 0.01 ? `$${value.toFixed(6)}` : value < 1 ? `$${value.toFixed(3)}` : money(value);

export async function loadInputs() {
  const [rates, liveUsage, workloads, policy] = await Promise.all(
    INPUT_FILES.map(async (name) => JSON.parse(await readFile(new URL(name, ROOT), 'utf8'))),
  );
  return { rates: rates.rates, liveUsage, scenarios: workloads.scenarios, policy };
}

export function validateInputs(inputs) {
  const errors = [];
  const rateIds = new Set();
  for (const rate of inputs.rates) {
    if (rateIds.has(rate.id)) errors.push(`duplicate rate: ${rate.id}`);
    rateIds.add(rate.id);
    if (!Array.isArray(rate.capabilities) || rate.capabilities.length === 0) errors.push(`capabilities missing: ${rate.id}`);
    if (typeof rate.value !== 'number' || rate.value < 0) errors.push(`invalid value: ${rate.id}`);
    if (!rate.sourceUrl || !rate.retrievedAt || !rate.unit || !rate.planAssumption) errors.push(`authority missing: ${rate.id}`);
  }
  for (const scenario of inputs.scenarios) {
    for (const [key, value] of Object.entries(scenario)) {
      if (key !== 'id' && key !== 'label' && typeof value !== 'number') errors.push(`scenario ${scenario.id}.${key} must be numeric`);
      if (typeof value === 'number' && value < 0) errors.push(`scenario ${scenario.id}.${key} must be nonnegative`);
    }
  }
  return errors;
}

const rateMap = (inputs) => Object.fromEntries(inputs.rates.map((rate) => [rate.id, rate]));

export function calculateScenario(inputs, scenarioId, sensitivityId = 'base') {
  const workload = inputs.scenarios.find((scenario) => scenario.id === scenarioId);
  if (!workload) throw new Error(`unknown scenario: ${scenarioId}`);
  const sensitivity = inputs.policy.sensitivity[sensitivityId];
  if (!sensitivity) throw new Error(`unknown sensitivity: ${sensitivityId}`);
  const rates = rateMap(inputs);
  const predictions = (workload.uploads + workload.uniqueTextQueries) * sensitivity.inferenceAttemptMultiplier;
  const jobSecondRate = rates['digitalocean-small-job-runtime'].value / (30 * 24 * 60 * 60);

  const infrastructure = {
    blobStorage: workload.storageGb * sensitivity.renditionMultiplier * rates['vercel-blob-storage'].value,
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
    appEgress: workload.appEgressGb * rates['digitalocean-egress'].value,
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
  return {
    id: workload.id,
    label: workload.label,
    sensitivity: sensitivityId,
    priceUsd: workload.priceUsd,
    predictions: round(predictions, 1),
    infrastructure: Object.fromEntries(Object.entries(infrastructure).map(([key, value]) => [key, round(value, 6)])),
    infrastructureCostUsd: round(infrastructureCostUsd, 4),
    paymentFeeUsd: round(paymentFeeUsd, 4),
    totalCostUsd: round(totalCostUsd, 4),
    grossMarginPct: grossMarginPct === null ? null : round(grossMarginPct, 2),
  };
}

export function minimumPriceForMargin(inputs, scenarioId, targetMargin = 0.7) {
  const result = calculateScenario(inputs, scenarioId, 'high');
  const high = inputs.policy.sensitivity.high;
  const stripe = rateMap(inputs)['stripe-domestic-card'];
  const variablePaymentRate = stripe.value + high.stripeVariableSurcharge;
  return round(
    (result.infrastructureCostUsd + stripe.fixedValue)
      / (1 - targetMargin - variablePaymentRate),
    2,
  );
}

export function calculateLiveKnownFloor(inputs) {
  const rates = rateMap(inputs);
  const live = inputs.liveUsage;
  const blobStorage = live.storage.blobBytes / 1_000_000_000 * rates['vercel-blob-storage'].value;
  const databaseStorage = live.database.databaseBytes / 1_000_000_000
    * (rates['neon-database-storage'].value + rates['neon-history-storage'].value);
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
  const freeHigh = calculateScenario(inputs, 'free', 'high');
  const collectorHigh = calculateScenario(inputs, 'collector', 'high');
  const archiveHigh = calculateScenario(inputs, 'archive', 'high');
  const collectorFloor = minimumPriceForMargin(inputs, 'collector');
  const archiveFloor = minimumPriceForMargin(inputs, 'archive');
  const liveFloor = calculateLiveKnownFloor(inputs);
  const freePool = freeHigh.totalCostUsd * inputs.policy.freeFullAllowanceAccounts;
  const live = inputs.liveUsage;
  const providerCaps = inputs.policy.providerHardCaps.map((cap) => `- **${cap.provider}:** ${cap.enforcement}.`).join('\n');
  const unknowns = live.unknowns.map((item) => `- **${item.name}:** unknown, not zero. ${item.impact}`).join('\n');
  return `# Sploot economic safety envelope

Generated deterministically from the versioned inputs in this directory. Rates were refreshed on 2026-07-15. This is a release gate, not a forecast: paid-tier margins charge on-demand rates so shared included pools cannot make an unprofitable plan look safe.

## Recommendation

- **Cardless Free:** 0.5 GB user-visible source-plus-trash allowance (rendition overhead is reserved separately), 100 new indexes and 100 novel text embeddings per month, 1 GB delivery, and at most ${inputs.policy.freeFullAllowanceAccounts} project-wide full-allowance equivalents before waitlist/paid admission. High-case variable cost is ${money(freeHigh.totalCostUsd)} per full account and ${money(freePool)} for the pool, below the $25 subsidy ceiling.
- **Collector:** $12/month, 10 GB, 600 new indexes, 900 novel text embeddings, and 10 GB delivery. High-case COGS is ${money(collectorHigh.totalCostUsd)} and gross margin is ${percent(collectorHigh.grossMarginPct)}. The computed 70%-margin price floor is ${money(collectorFloor)}.
- **Archive:** $49/month, 100 GB, 2,500 new indexes, 2,500 novel text embeddings, and 40 GB delivery. High-case COGS is ${money(archiveHigh.totalCostUsd)} and gross margin is ${percent(archiveHigh.grossMarginPct)}. The computed 70%-margin price floor is ${money(archiveFloor)}.
- Existing content remains readable, exportable, and deletable after a cost boundary closes. No plan permits silent overage.

These are candidates for entitlement and billing cards, not live promises. International/FX Stripe charges, provider-plan readbacks, and hard-cap receipts must be locked before GA.

## Workload and sensitivity results

Low/base/high vary physical rendition overhead (1.05×/1.10×/1.20×), Blob origin-miss share (5%/15%/30%), potentially billed inference attempts (1.00×/1.05×/1.20×), database compute (0.75×/1.00×/1.50×), and Stripe's variable surcharge (domestic / international / international plus FX). Storage includes retained trash.

| Workload | Revenue | Low COGS | Base COGS | High COGS | High gross margin |
|---|---:|---:|---:|---:|---:|
${scenarioTable(inputs)}

The abusive and viral rows deliberately exceed their account/global budgets; they prove quotas must cover novel inference, bytes, and request delivery rather than storage alone.

## Dollar-derived budgets

| Plan | Monthly infrastructure ceiling | Daily inference ceiling | Monthly inference ceiling |
|---|---:|---:|---:|
${budgetTable(inputs)}

Pre-GA global variable spend is capped at ${money(inputs.policy.global.preGaDailyVariableUsd)}/day and ${money(inputs.policy.global.preGaMonthlyVariableUsd)}/month. Replicate is a sub-budget of ${money(inputs.policy.global.replicateDailyUsd)}/day (${inputs.policy.global.replicateDailyAttempts} attempts) and ${money(inputs.policy.global.replicateMonthlyUsd)}/month. After paid admission, the monthly ceiling is \`${inputs.policy.global.paidMonthlyFormula}\`; daily is \`${inputs.policy.global.paidDailyFormula}\`. Counters reserve worst-case dollars transactionally before work and reconcile provider usage afterward.

## Provider hard-cap map

${providerCaps}

## Live reconciliation (redacted)

- Vercel Blob: ${live.storage.blobObjects.toLocaleString('en-US')} objects / ${(live.storage.blobBytes / 1_000_000).toFixed(1)} MB versus ${(live.storage.databaseSourceBytesLive / 1_000_000).toFixed(1)} MB of live source bytes in Postgres. ${live.storage.reconciliation}
- Neon/Postgres: ${(live.database.databaseBytes / 1_000_000).toFixed(1)} MB database, ${live.database.users} users, ${live.database.readyEmbeddings.toLocaleString('en-US')} ready embeddings.
- Replicate: latest ${live.inference.latestPredictionSample.size} predictions were ${live.inference.latestPredictionSample.failed} failed, ${live.inference.latestPredictionSample.canceled} canceled, and ${live.inference.latestPredictionSample.succeeded} succeeded. ${live.inference.reconciliation}
- DigitalOcean: invoice preview ${money(live.digitalOcean.invoicePreviewUsd)} versus account month-to-date usage ${money(live.digitalOcean.monthToDateUsageUsd)}, a named ${money(live.digitalOcean.namedVarianceUsd)} variance. ${live.digitalOcean.varianceExplanation}
- Fixed baseline: the Sploot web service is ${money(rateMap(inputs)['digitalocean-web-service'].value)}/month. The current sleep-heavy embedding schedule is estimated at ${money(live.digitalOcean.embeddingJobEstimatedMonthlyUsd)}/month before other short jobs; Canary is a ${money(rateMap(inputs)['canary-shared-service'].value)}/month service shared across projects. These fixed costs are visible but excluded from the Vision's $25 variable free-subsidy ratchet and per-account margin.
- Known-cost reconciliation: current web, embedding-job schedule, Blob bytes, and database bytes produce a ${money(liveFloor.knownSplootFloorUsd)} monthly floor. The ${money(liveFloor.accountPreviewDifferenceUsd)} difference to the account-wide invoice preview is deliberately not attributed to Sploot: it contains unrelated apps, Canary allocation, other jobs, transfer/operations, and endpoint timing.
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
