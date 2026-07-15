import { StripeApiClient } from '../lib/billing/stripe-api-client';
import { buildSubscriptionRecoveryPlan, executeSubscriptionRecovery, parseRecoverySnapshot, verifyRecoverySnapshotManifest, type RecoverySnapshotManifestVerifier } from '../lib/billing/stripe-recovery';
import { type StripeCredential } from '../lib/billing/stripe-policy';
import { readFile } from 'node:fs/promises';

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main(): Promise<void> {
  if (hasFlag('--help')) {
    console.log('Usage: STRIPE_SECRET_KEY=sk_test_... pnpm stripe:recreate --snapshot ./preincident.json [--dry-run|--apply]');
    console.log('Default: --dry-run. --apply additionally requires STRIPE_RECOVERY_CONFIRM=I_UNDERSTAND_TEST_MODE.');
    return;
  }

  const snapshotFlag = process.argv.indexOf('--snapshot');
  if (snapshotFlag < 0 || !process.argv[snapshotFlag + 1]) {
    throw new Error('--snapshot is required; current Stripe listings are not a recovery source');
  }
  const snapshot = parseRecoverySnapshot(JSON.parse(await readFile(process.argv[snapshotFlag + 1], 'utf8')));
  const manifestVerifier: RecoverySnapshotManifestVerifier = {
    keyId: process.env.RECOVERY_SNAPSHOT_MANIFEST_KEY_ID ?? '',
    publicKeyPem: process.env.RECOVERY_SNAPSHOT_MANIFEST_PUBLIC_KEY ?? '',
  };
  verifyRecoverySnapshotManifest(snapshot, manifestVerifier);
  const apply = hasFlag('--apply');

  if (!apply) {
    const plan = buildSubscriptionRecoveryPlan(snapshot);
    console.log(JSON.stringify({ mode: 'test', dryRun: true, creations: plan.creations.length, warnings: plan.warnings }));
    return;
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is required for --apply and must be a Stripe sandbox key');
  if (process.env.STRIPE_RECOVERY_CONFIRM !== 'I_UNDERSTAND_TEST_MODE') {
    throw new Error('refusing --apply without STRIPE_RECOVERY_CONFIRM=I_UNDERSTAND_TEST_MODE');
  }
  const credential: StripeCredential = { mode: 'test', source: 'sandbox-env', secretKey: key };
  const client = new StripeApiClient(credential);

  const result = await executeSubscriptionRecovery(client, snapshot, manifestVerifier);
  console.log(JSON.stringify({ mode: 'test', dryRun: false, created: result.created }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Stripe recovery failed');
  process.exitCode = 1;
});
