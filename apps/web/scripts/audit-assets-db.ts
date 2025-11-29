#!/usr/bin/env tsx
/**
 * Audit script to check database for orphaned asset records
 * Queries all assets and validates their blob URLs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuditResult {
  id: string;
  blobUrl: string;
  filename: string;
  size: number;
  createdAt: Date;
  status: 'valid' | 'broken' | 'error';
  statusCode?: number;
  error?: string;
}

async function auditAssets() {
  try {
    console.log('🔍 Starting asset audit...\n');

    // Fetch all assets
    const assets = await prisma.asset.findMany({
      where: {
        deletedAt: null,
      },
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

    console.log(`📊 Found ${assets.length} total assets in database\n`);

    const valid: AuditResult[] = [];
    const broken: AuditResult[] = [];
    const errors: AuditResult[] = [];

    // Validate each blob URL with HEAD request
    for (const asset of assets) {
      const filename = asset.pathname.split('/').pop() || asset.pathname;
      const result: AuditResult = {
        id: asset.id,
        blobUrl: asset.blobUrl,
        filename,
        size: asset.size,
        createdAt: asset.createdAt,
        status: 'valid',
      };

      try {
        // Use HEAD request to check if blob exists without downloading
        const response = await fetch(asset.blobUrl, {
          method: 'HEAD',
          // Set timeout to avoid hanging on dead URLs
          signal: AbortSignal.timeout(5000),
        });

        result.statusCode = response.status;

        if (response.ok) {
          result.status = 'valid';
          valid.push(result);
          console.log(`✅ ${filename} (${response.status})`);
        } else {
          // 404 (Not Found), 403 (Forbidden), or other error status
          result.status = 'broken';
          broken.push(result);
          console.log(`❌ ${filename} (${response.status}) - BROKEN`);
        }
      } catch (err) {
        // Network error, timeout, or other fetch failure
        result.status = 'error';
        result.error = err instanceof Error ? err.message : 'Unknown error';
        errors.push(result);
        console.log(`⚠️  ${filename} - ERROR: ${result.error}`);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 AUDIT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total assets:     ${assets.length}`);
    console.log(`✅ Valid:         ${valid.length} (${Math.round((valid.length / assets.length) * 100)}%)`);
    console.log(`❌ Broken:        ${broken.length} (${Math.round((broken.length / assets.length) * 100)}%)`);
    console.log(`⚠️  Errors:        ${errors.length} (${Math.round((errors.length / assets.length) * 100)}%)`);
    console.log('='.repeat(60));

    // Print details of broken/error assets
    if (broken.length > 0) {
      console.log('\n🔴 BROKEN ASSETS (404/403):');
      broken.forEach((asset) => {
        console.log(`  - ${asset.filename}`);
        console.log(`    ID: ${asset.id}`);
        console.log(`    Status: ${asset.statusCode}`);
        console.log(`    URL: ${asset.blobUrl}`);
        console.log('');
      });
    }

    if (errors.length > 0) {
      console.log('\n⚠️  ERROR ASSETS (network/timeout):');
      errors.forEach((asset) => {
        console.log(`  - ${asset.filename}`);
        console.log(`    ID: ${asset.id}`);
        console.log(`    Error: ${asset.error}`);
        console.log(`    URL: ${asset.blobUrl}`);
        console.log('');
      });
    }

    // Return results for potential automation
    return {
      total: assets.length,
      valid,
      broken,
      errors,
    };
  } catch (error) {
    console.error('❌ Audit failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the audit
auditAssets()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });