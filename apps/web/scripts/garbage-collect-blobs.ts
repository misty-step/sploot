/**
 * Blob Garbage Collection Script
 *
 * Finds and optionally deletes orphaned blobs in Vercel Blob storage
 * that have no corresponding database records.
 *
 * Usage:
 *   pnpm tsx scripts/garbage-collect-blobs.ts [--dry-run] [--delete]
 *
 * Options:
 *   --dry-run   List orphaned blobs without deleting (default)
 *   --delete    Actually delete orphaned blobs (requires confirmation)
 */

import { list as listBlobs, del as deleteBlob } from '@vercel/blob';
import { prisma } from '../lib/db';
import * as readline from 'readline/promises';

interface GarbageCollectionStats {
  totalBlobs: number;
  referencedBlobs: number;
  orphanedBlobs: number;
  deletedBlobs: number;
  errors: number;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--delete');
  const stats: GarbageCollectionStats = {
    totalBlobs: 0,
    referencedBlobs: 0,
    orphanedBlobs: 0,
    deletedBlobs: 0,
    errors: 0,
  };

  console.log('🔍 Blob Garbage Collection');
  console.log('═'.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no deletions)' : 'DELETE MODE'}\n`);

  try {
    // Check database connection
    if (!prisma) {
      console.error('❌ Database connection not available');
      process.exit(1);
    }

    // Step 1: Fetch all blob URLs from Vercel Blob storage
    console.log('📦 Fetching blobs from Vercel Blob storage...');
    const { blobs } = await listBlobs();
    stats.totalBlobs = blobs.length;
    console.log(`   Found ${stats.totalBlobs} blobs in storage\n`);

    if (stats.totalBlobs === 0) {
      console.log('✅ No blobs found. Nothing to clean up.');
      return;
    }

    // Step 2: Fetch all blob URLs from database
    console.log('💾 Fetching asset references from database...');
    const assets = await prisma.asset.findMany({
      select: {
        blobUrl: true,
        thumbnailUrl: true,
      },
    });

    // Build set of referenced URLs for fast lookup
    const referencedUrls = new Set<string>();
    for (const asset of assets) {
      referencedUrls.add(asset.blobUrl);
      if (asset.thumbnailUrl) {
        referencedUrls.add(asset.thumbnailUrl);
      }
    }

    stats.referencedBlobs = referencedUrls.size;
    console.log(`   Found ${stats.referencedBlobs} referenced blob URLs\n`);

    // Step 3: Identify orphaned blobs
    console.log('🔎 Identifying orphaned blobs...');
    const orphanedBlobs = blobs.filter((blob) => !referencedUrls.has(blob.url));
    stats.orphanedBlobs = orphanedBlobs.length;

    if (stats.orphanedBlobs === 0) {
      console.log('✅ No orphaned blobs found. All blobs are referenced!\n');
      printStats(stats);
      return;
    }

    console.log(`   Found ${stats.orphanedBlobs} orphaned blobs:\n`);

    // List orphaned blobs
    orphanedBlobs.forEach((blob, index) => {
      const sizeKB = (blob.size / 1024).toFixed(2);
      const uploadedDate = new Date(blob.uploadedAt).toISOString().split('T')[0];
      console.log(`   ${index + 1}. ${blob.pathname}`);
      console.log(`      Size: ${sizeKB} KB | Uploaded: ${uploadedDate}`);
      console.log(`      URL: ${blob.url}\n`);
    });

    // Calculate total size of orphaned blobs
    const totalOrphanedSize = orphanedBlobs.reduce((sum, blob) => sum + blob.size, 0);
    const totalOrphanedMB = (totalOrphanedSize / 1024 / 1024).toFixed(2);
    console.log(`   Total orphaned size: ${totalOrphanedMB} MB\n`);

    // Step 4: Delete orphaned blobs (if not dry run)
    if (dryRun) {
      console.log('ℹ️  Dry run mode - no deletions performed');
      console.log('   Run with --delete to actually delete orphaned blobs\n');
      printStats(stats);
      return;
    }

    // Confirm deletion
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await rl.question(
      `⚠️  Delete ${stats.orphanedBlobs} orphaned blobs (${totalOrphanedMB} MB)? [y/N] `
    );
    rl.close();

    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log('\n❌ Deletion cancelled by user\n');
      printStats(stats);
      return;
    }

    console.log('\n🗑️  Deleting orphaned blobs...');
    for (const blob of orphanedBlobs) {
      try {
        await deleteBlob(blob.url);
        stats.deletedBlobs++;
        console.log(`   ✓ Deleted: ${blob.pathname}`);
      } catch (error) {
        stats.errors++;
        console.error(`   ✗ Failed to delete ${blob.pathname}:`, error);
      }
    }

    console.log(`\n✅ Deletion complete\n`);
    printStats(stats);
  } catch (error) {
    console.error('\n❌ Error during garbage collection:', error);
    process.exit(1);
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

function printStats(stats: GarbageCollectionStats) {
  console.log('📊 Summary');
  console.log('═'.repeat(50));
  console.log(`Total blobs in storage:     ${stats.totalBlobs}`);
  console.log(`Referenced by database:     ${stats.referencedBlobs}`);
  console.log(`Orphaned blobs:             ${stats.orphanedBlobs}`);
  if (stats.deletedBlobs > 0) {
    console.log(`Deleted blobs:              ${stats.deletedBlobs}`);
  }
  if (stats.errors > 0) {
    console.log(`Errors:                     ${stats.errors}`);
  }
  console.log('═'.repeat(50));
}

// Run the script
main().catch(console.error);
