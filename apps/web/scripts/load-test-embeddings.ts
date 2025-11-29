#!/usr/bin/env tsx
/**
 * Load Test for Embedding Generation
 *
 * Simulates concurrent users uploading images and generating embeddings
 * to identify bottlenecks and measure system performance under load.
 *
 * Usage: pnpm tsx scripts/load-test-embeddings.ts [users] [images-per-user]
 * Example: pnpm tsx scripts/load-test-embeddings.ts 10 5
 */

import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

interface LoadTestConfig {
  concurrentUsers: number;
  imagesPerUser: number;
  apiBaseUrl: string;
  authToken?: string;
  verbose: boolean;
}

interface TestMetrics {
  totalRequests: number;
  successfulUploads: number;
  failedUploads: number;
  successfulEmbeddings: number;
  failedEmbeddings: number;
  uploadResponseTimes: number[];
  embeddingResponseTimes: number[];
  totalTestDuration: number;
  queueDepthSnapshots: number[];
  errorTypes: Map<string, number>;
}

interface UploadResult {
  assetId?: string;
  success: boolean;
  responseTime: number;
  error?: string;
}

interface EmbeddingCheckResult {
  ready: boolean;
  failed: boolean;
  responseTime: number;
  status?: string;
}

class LoadTestRunner {
  private config: LoadTestConfig;
  private metrics: TestMetrics;
  private testStartTime: number = 0;

  constructor(config: LoadTestConfig) {
    this.config = config;
    this.metrics = {
      totalRequests: 0,
      successfulUploads: 0,
      failedUploads: 0,
      successfulEmbeddings: 0,
      failedEmbeddings: 0,
      uploadResponseTimes: [],
      embeddingResponseTimes: [],
      totalTestDuration: 0,
      queueDepthSnapshots: [],
      errorTypes: new Map(),
    };
  }

  /**
   * Create a test image file buffer
   */
  private createTestImage(userId: number, imageNum: number): Buffer {
    // Create a simple 1x1 pixel PNG for testing
    const png = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
      0x54, 0x08, 0x99, 0x63, 0xF8, 0x0F, 0x00, 0x00,
      0x01, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ]);
    return png;
  }

  /**
   * Simulate a single image upload
   */
  private async uploadImage(userId: number, imageNum: number): Promise<UploadResult> {
    const startTime = performance.now();
    const filename = `load-test-user${userId}-img${imageNum}-${Date.now()}.png`;

    try {
      // In a real test, you'd make actual HTTP requests to your API
      // For now, simulating with timing
      const formData = new FormData();
      const imageBuffer = this.createTestImage(userId, imageNum);
      const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
      formData.append('file', blob, filename);

      const response = await fetch(`${this.config.apiBaseUrl}/api/upload`, {
        method: 'POST',
        headers: this.config.authToken ? {
          'Authorization': `Bearer ${this.config.authToken}`
        } : {},
        body: formData,
      });

      const responseTime = performance.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        return {
          assetId: data.assetId,
          success: true,
          responseTime,
        };
      } else {
        const error = `Upload failed: ${response.status}`;
        this.recordError(error);
        return {
          success: false,
          responseTime,
          error,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.recordError(errorMsg);
      return {
        success: false,
        responseTime: performance.now() - startTime,
        error: errorMsg,
      };
    }
  }

  /**
   * Check if embedding is ready for an asset
   */
  private async checkEmbeddingStatus(assetIds: string[]): Promise<Map<string, EmbeddingCheckResult>> {
    const startTime = performance.now();
    const results = new Map<string, EmbeddingCheckResult>();

    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/assets/batch/embedding-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.authToken ? {
            'Authorization': `Bearer ${this.config.authToken}`
          } : {}),
        },
        body: JSON.stringify({ assetIds }),
      });

      const responseTime = performance.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        for (const assetId of assetIds) {
          const status = data.statuses[assetId];
          results.set(assetId, {
            ready: status?.status === 'ready',
            failed: status?.status === 'failed',
            responseTime,
            status: status?.status,
          });
        }
      } else {
        // All assets fail if request fails
        for (const assetId of assetIds) {
          results.set(assetId, {
            ready: false,
            failed: true,
            responseTime,
          });
        }
      }
    } catch (error) {
      // All assets fail on error
      const responseTime = performance.now() - startTime;
      for (const assetId of assetIds) {
        results.set(assetId, {
          ready: false,
          failed: true,
          responseTime,
        });
      }
    }

    return results;
  }

  /**
   * Simulate a single user uploading multiple images
   */
  private async simulateUser(userId: number): Promise<void> {
    const uploadPromises: Promise<UploadResult>[] = [];

    // Upload all images for this user concurrently
    for (let i = 0; i < this.config.imagesPerUser; i++) {
      uploadPromises.push(this.uploadImage(userId, i));
    }

    const uploadResults = await Promise.all(uploadPromises);

    // Track upload metrics
    for (const result of uploadResults) {
      this.metrics.totalRequests++;
      this.metrics.uploadResponseTimes.push(result.responseTime);

      if (result.success) {
        this.metrics.successfulUploads++;
      } else {
        this.metrics.failedUploads++;
      }
    }

    // Extract successful asset IDs for embedding monitoring
    const assetIds = uploadResults
      .filter(r => r.success && r.assetId)
      .map(r => r.assetId!);

    if (assetIds.length === 0) {
      return; // No successful uploads to monitor
    }

    // Monitor embedding generation with timeout
    const maxWaitTime = 30000; // 30 seconds max wait
    const checkInterval = 2000; // Check every 2 seconds
    const startMonitoring = performance.now();

    while (performance.now() - startMonitoring < maxWaitTime) {
      const statuses = await this.checkEmbeddingStatus(assetIds);

      // Update metrics for each asset
      const pendingAssets: string[] = [];
      for (const [assetId, status] of statuses) {
        this.metrics.embeddingResponseTimes.push(status.responseTime);

        if (status.ready) {
          this.metrics.successfulEmbeddings++;
        } else if (status.failed) {
          this.metrics.failedEmbeddings++;
        } else {
          pendingAssets.push(assetId);
        }
      }

      // If all embeddings are processed, stop monitoring
      if (pendingAssets.length === 0) {
        break;
      }

      // Wait before next check
      await this.sleep(checkInterval);
    }
  }

  /**
   * Record error type for analysis
   */
  private recordError(error: string): void {
    const currentCount = this.metrics.errorTypes.get(error) || 0;
    this.metrics.errorTypes.set(error, currentCount + 1);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate percentile from array of numbers
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  /**
   * Run the load test
   */
  async run(): Promise<void> {
    console.log('🚀 Starting Load Test for Embedding Generation');
    console.log(`📊 Configuration:`);
    console.log(`   - Concurrent Users: ${this.config.concurrentUsers}`);
    console.log(`   - Images per User: ${this.config.imagesPerUser}`);
    console.log(`   - Total Images: ${this.config.concurrentUsers * this.config.imagesPerUser}`);
    console.log(`   - API Base URL: ${this.config.apiBaseUrl}`);
    console.log('');

    this.testStartTime = performance.now();

    // Create promises for all concurrent users
    const userPromises: Promise<void>[] = [];
    for (let userId = 0; userId < this.config.concurrentUsers; userId++) {
      userPromises.push(this.simulateUser(userId));

      // Small delay between starting each user to avoid thundering herd
      await this.sleep(100);
    }

    // Wait for all users to complete
    await Promise.all(userPromises);

    this.metrics.totalTestDuration = performance.now() - this.testStartTime;

    // Print results
    this.printResults();
  }

  /**
   * Print test results and analysis
   */
  private printResults(): void {
    const totalImages = this.config.concurrentUsers * this.config.imagesPerUser;

    console.log('\n📈 LOAD TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════════');

    // Overall statistics
    console.log('\n📊 Overall Statistics:');
    console.log(`   Total Test Duration: ${(this.metrics.totalTestDuration / 1000).toFixed(2)}s`);
    console.log(`   Total Images Attempted: ${totalImages}`);
    console.log(`   Successful Uploads: ${this.metrics.successfulUploads} (${((this.metrics.successfulUploads / totalImages) * 100).toFixed(1)}%)`);
    console.log(`   Failed Uploads: ${this.metrics.failedUploads} (${((this.metrics.failedUploads / totalImages) * 100).toFixed(1)}%)`);
    console.log(`   Successful Embeddings: ${this.metrics.successfulEmbeddings}`);
    console.log(`   Failed Embeddings: ${this.metrics.failedEmbeddings}`);

    // Upload performance
    if (this.metrics.uploadResponseTimes.length > 0) {
      console.log('\n⚡ Upload Performance:');
      console.log(`   Average Response Time: ${(this.metrics.uploadResponseTimes.reduce((a, b) => a + b, 0) / this.metrics.uploadResponseTimes.length).toFixed(0)}ms`);
      console.log(`   P50 Response Time: ${this.calculatePercentile(this.metrics.uploadResponseTimes, 50).toFixed(0)}ms`);
      console.log(`   P95 Response Time: ${this.calculatePercentile(this.metrics.uploadResponseTimes, 95).toFixed(0)}ms`);
      console.log(`   P99 Response Time: ${this.calculatePercentile(this.metrics.uploadResponseTimes, 99).toFixed(0)}ms`);
      console.log(`   Min Response Time: ${Math.min(...this.metrics.uploadResponseTimes).toFixed(0)}ms`);
      console.log(`   Max Response Time: ${Math.max(...this.metrics.uploadResponseTimes).toFixed(0)}ms`);
    }

    // Embedding performance
    if (this.metrics.embeddingResponseTimes.length > 0) {
      console.log('\n🔄 Embedding Check Performance:');
      console.log(`   Average Response Time: ${(this.metrics.embeddingResponseTimes.reduce((a, b) => a + b, 0) / this.metrics.embeddingResponseTimes.length).toFixed(0)}ms`);
      console.log(`   P50 Response Time: ${this.calculatePercentile(this.metrics.embeddingResponseTimes, 50).toFixed(0)}ms`);
      console.log(`   P95 Response Time: ${this.calculatePercentile(this.metrics.embeddingResponseTimes, 95).toFixed(0)}ms`);
    }

    // Throughput
    const totalSeconds = this.metrics.totalTestDuration / 1000;
    console.log('\n📉 Throughput:');
    console.log(`   Uploads per Second: ${(this.metrics.successfulUploads / totalSeconds).toFixed(2)}`);
    console.log(`   Embeddings per Second: ${(this.metrics.successfulEmbeddings / totalSeconds).toFixed(2)}`);

    // Error analysis
    if (this.metrics.errorTypes.size > 0) {
      console.log('\n⚠️  Error Analysis:');
      for (const [error, count] of this.metrics.errorTypes) {
        console.log(`   ${error}: ${count} occurrences`);
      }
    }

    // Bottleneck identification
    console.log('\n🔍 Bottleneck Analysis:');

    const avgUploadTime = this.metrics.uploadResponseTimes.length > 0
      ? this.metrics.uploadResponseTimes.reduce((a, b) => a + b, 0) / this.metrics.uploadResponseTimes.length
      : 0;

    if (avgUploadTime > 2500) {
      console.log(`   ❌ Upload API is a bottleneck (avg ${avgUploadTime.toFixed(0)}ms > 2500ms SLO)`);
    } else {
      console.log(`   ✅ Upload API performing within SLO (avg ${avgUploadTime.toFixed(0)}ms < 2500ms)`);
    }

    const uploadSuccessRate = (this.metrics.successfulUploads / totalImages) * 100;
    if (uploadSuccessRate < 95) {
      console.log(`   ❌ High upload failure rate (${uploadSuccessRate.toFixed(1)}% < 95% target)`);
    } else {
      console.log(`   ✅ Upload success rate acceptable (${uploadSuccessRate.toFixed(1)}% >= 95%)`);
    }

    const embeddingSuccessRate = this.metrics.successfulUploads > 0
      ? (this.metrics.successfulEmbeddings / this.metrics.successfulUploads) * 100
      : 0;
    if (embeddingSuccessRate < 90) {
      console.log(`   ❌ Embedding generation reliability issue (${embeddingSuccessRate.toFixed(1)}% < 90% target)`);
    } else {
      console.log(`   ✅ Embedding generation reliable (${embeddingSuccessRate.toFixed(1)}% >= 90%)`);
    }

    // System responsiveness verdict
    console.log('\n🎯 System Responsiveness Verdict:');
    const isResponsive = avgUploadTime <= 2500 &&
                        uploadSuccessRate >= 95 &&
                        embeddingSuccessRate >= 90;

    if (isResponsive) {
      console.log('   ✅ PASS - System remains responsive under load');
    } else {
      console.log('   ❌ FAIL - System performance degrades under load');
      process.exitCode = 1;
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');
  }
}

/**
 * Main entry point
 */
async function main() {
  const concurrentUsers = parseInt(process.argv[2] || '10', 10);
  const imagesPerUser = parseInt(process.argv[3] || '5', 10);
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
  const authToken = process.env.AUTH_TOKEN;

  // Validate inputs
  if (concurrentUsers > 100) {
    console.error('⚠️  Warning: Testing with more than 100 concurrent users may overwhelm the system');
    console.error('   Consider running multiple smaller tests instead');
  }

  if (concurrentUsers * imagesPerUser > 1000) {
    console.error('⚠️  Warning: Testing with more than 1000 total images may take a very long time');
  }

  // Check if running against production
  if (apiBaseUrl.includes('vercel.app') || apiBaseUrl.includes('production')) {
    console.error('⚠️  WARNING: You appear to be testing against a production environment!');
    console.error('   This load test may impact real users.');
    console.error('   Press Ctrl+C to cancel, or wait 5 seconds to continue...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  const config: LoadTestConfig = {
    concurrentUsers,
    imagesPerUser,
    apiBaseUrl,
    authToken,
    verbose: process.env.VERBOSE === 'true',
  };

  const runner = new LoadTestRunner(config);
  await runner.run();
}

// Run the test
main().catch(error => {
  console.error('❌ Load test failed with error:', error);
  process.exitCode = 1;
});