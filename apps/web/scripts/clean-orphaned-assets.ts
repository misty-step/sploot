#!/usr/bin/env tsx
/**
 * Clean Orphaned Assets Script
 *
 * Identifies and removes database records for assets with invalid or missing blob URLs.
 * This script is idempotent and safe to run multiple times.
 *
 * Usage: pnpm tsx scripts/clean-orphaned-assets.ts [--dry-run] [--user-id=<id>]
 *
 * Flags:
 *   --dry-run    Show what would be deleted without actually deleting
 *   --user-id    Target specific user (defaults to all users)
 *   --yes        Skip confirmation prompt (use with caution)
 *
 * Examples:
 *   pnpm tsx scripts/clean-orphaned-assets.ts --dry-run
 *   pnpm tsx scripts/clean-orphaned-assets.ts --user-id=user_123abc
 *   pnpm tsx scripts/clean-orphaned-assets.ts --yes
 */

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

interface AuditResult {
  id: string;
  blobUrl: string;
  pathname: string;
  size: number;
  createdAt: Date;
  status: 'valid' | 'broken' | 'error';
  statusCode?: number;
  error?: string;
  ownerUserId: string;
}

interface CleanupSummary {
  totalScanned: number;
  brokenFound: number;
  deleted: number;
  errors: number;
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    skipConfirmation: args.includes('--yes'),
    userId: args.find(arg => arg.startsWith('--user-id='))?.split('=')[1] || null,
  };
  return options;
}

/**
 * Validate a single blob URL by checking if it's accessible
 */
async function validateBlobUrl(url: string): Promise<{ valid: boolean; statusCode?: number; error?: string }> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });

    return {
      valid: response.ok,
      statusCode: response.status,
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Scan database for assets with invalid blob URLs
 */
async function scanForOrphanedAssets(userId?: string | null): Promise<AuditResult[]> {
  console.log('\n🔍 Scanning for orphaned assets...\n');

  const whereClause: any = {
    deletedAt: null,
  };

  if (userId) {
    whereClause.ownerUserId = userId;
  }

  const assets = await prisma.asset.findMany({
    where: whereClause,
    select: {
      id: true,
      blobUrl: true,
      pathname: true,
      size: true,
      createdAt: true,
      ownerUserId: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log(`Found ${assets.length} assets to check`);

  const results: AuditResult[] = [];
  const brokenAssets: AuditResult[] = [];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    process.stdout.write(`\rChecking asset ${i + 1}/${assets.length}...`);

    const validation = await validateBlobUrl(asset.blobUrl);

    const result: AuditResult = {
      id: asset.id,
      blobUrl: asset.blobUrl,
      pathname: asset.pathname,
      size: asset.size,
      createdAt: asset.createdAt,
      ownerUserId: asset.ownerUserId,
      status: validation.valid ? 'valid' : 'broken',
      statusCode: validation.statusCode,
      error: validation.error,
    };

    results.push(result);

    if (!validation.valid) {
      brokenAssets.push(result);
    }
  }

  console.log('\n'); // New line after progress

  return brokenAssets;
}

/**
 * Display broken assets in a formatted table
 */
function displayBrokenAssets(assets: AuditResult[]) {
  console.log('\n📋 Orphaned Assets Found:\n');
  console.log('┌────────────────────────────────────────────────────────────────────────┐');
  console.log('│ ID                      │ Created At         │ Size     │ Status      │');
  console.log('├────────────────────────────────────────────────────────────────────────┤');

  for (const asset of assets) {
    const id = asset.id.substring(0, 24).padEnd(24);
    const date = asset.createdAt.toISOString().substring(0, 19).replace('T', ' ');
    const size = `${(asset.size / 1024).toFixed(1)}KB`.padEnd(9);
    const status = (asset.statusCode ? `HTTP ${asset.statusCode}` : 'Network').padEnd(12);

    console.log(`│ ${id} │ ${date} │ ${size} │ ${status} │`);
  }

  console.log('└────────────────────────────────────────────────────────────────────────┘');
  console.log('');
}

/**
 * Prompt user for confirmation
 */
async function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Delete orphaned assets from database
 */
async function deleteOrphanedAssets(assets: AuditResult[]): Promise<CleanupSummary> {
  const summary: CleanupSummary = {
    totalScanned: assets.length,
    brokenFound: assets.length,
    deleted: 0,
    errors: 0,
  };

  console.log('\n🗑️  Deleting orphaned assets...\n');

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    process.stdout.write(`\rDeleting asset ${i + 1}/${assets.length}...`);

    try {
      await prisma.asset.delete({
        where: { id: asset.id },
      });

      summary.deleted++;

      // Log to audit trail
      console.log(`\n[DELETED] Asset ${asset.id} (${asset.blobUrl})`);
    } catch (err) {
      summary.errors++;
      console.error(`\n[ERROR] Failed to delete asset ${asset.id}:`, err);
    }
  }

  console.log('\n');
  return summary;
}

/**
 * Main execution function
 */
async function main() {
  const options = parseArgs();

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           Orphaned Assets Cleanup Script                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  if (options.dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No assets will be deleted\n');
  }

  if (options.userId) {
    console.log(`🎯 Targeting user: ${options.userId}\n`);
  }

  try {
    // Step 1: Scan for orphaned assets
    const brokenAssets = await scanForOrphanedAssets(options.userId);

    if (brokenAssets.length === 0) {
      console.log('✅ No orphaned assets found. Database is clean!\n');
      return;
    }

    // Step 2: Display results
    displayBrokenAssets(brokenAssets);

    console.log(`Found ${brokenAssets.length} orphaned asset(s) with invalid blob URLs\n`);

    // Step 3: Confirm deletion (unless in dry-run or --yes flag)
    if (options.dryRun) {
      console.log('ℹ️  Dry run complete. No changes made.\n');
      return;
    }

    if (!options.skipConfirmation) {
      const confirmed = await promptConfirmation(
        `\n⚠️  Are you sure you want to delete ${brokenAssets.length} orphaned asset(s)?`
      );

      if (!confirmed) {
        console.log('\n❌ Deletion cancelled by user.\n');
        return;
      }
    }

    // Step 4: Delete orphaned assets
    const summary = await deleteOrphanedAssets(brokenAssets);

    // Step 5: Display summary
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                      Cleanup Summary                           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`\n  Total scanned:       ${summary.totalScanned}`);
    console.log(`  Broken found:        ${summary.brokenFound}`);
    console.log(`  Successfully deleted: ${summary.deleted}`);
    console.log(`  Errors:              ${summary.errors}\n`);

    if (summary.deleted > 0) {
      console.log('✅ Cleanup completed successfully!\n');
    } else {
      console.log('⚠️  No assets were deleted.\n');
    }
  } catch (error) {
    console.error('\n❌ Script failed with error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});