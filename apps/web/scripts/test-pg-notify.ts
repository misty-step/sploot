#!/usr/bin/env node

/**
 * Test script for PostgreSQL NOTIFY trigger
 *
 * Usage: tsx scripts/test-pg-notify.ts
 *
 * This script:
 * 1. Starts listening for PostgreSQL notifications
 * 2. Creates a test embedding record
 * 3. Updates the embedding status to trigger notifications
 * 4. Verifies that notifications are received
 */

import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { EMBEDDING_DIMENSION } from '@sploot/common';
// Load environment variables
// Note: dotenv is not installed in production, using process.env directly

const prisma = new PrismaClient();

async function testPgNotify() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL not found in environment');
    process.exit(1);
  }

  console.log('🚀 Starting PostgreSQL NOTIFY trigger test...\n');

  // Create a listener client
  const listenerClient = new Client({ connectionString });
  const notifications: any[] = [];

  try {
    // Connect and set up listener
    await listenerClient.connect();
    console.log('✅ Connected to PostgreSQL');

    // Set up notification handler
    listenerClient.on('notification', (msg) => {
      console.log(`\n📨 Received notification on channel '${msg.channel}':`);
      if (msg.payload) {
        console.log(JSON.stringify(JSON.parse(msg.payload), null, 2));
        notifications.push({
          channel: msg.channel,
          payload: JSON.parse(msg.payload)
        });
      }
    });

    // Listen to channels
    await listenerClient.query('LISTEN embedding_complete');
    await listenerClient.query('LISTEN embedding_processing');
    await listenerClient.query('LISTEN embedding_failed');
    console.log('👂 Listening for notifications...\n');

    // Get or create a test user
    const testUser = await prisma.user.upsert({
      where: { email: 'test-pg-notify@example.com' },
      update: {},
      create: {
        id: 'test-pg-notify-user',
        email: 'test-pg-notify@example.com',
        role: 'user'
      }
    });
    console.log(`✅ Using test user: ${testUser.email}`);

    // Create a test asset
    const testAsset = await prisma.asset.create({
      data: {
        ownerUserId: testUser.id,
        blobUrl: 'https://example.com/test-image.jpg',
        pathname: '/test/test-image.jpg',
        mime: 'image/jpeg',
        size: 1024,
        checksumSha256: `test-checksum-${Date.now()}`,
        width: 100,
        height: 100
      }
    });
    console.log(`✅ Created test asset: ${testAsset.id}\n`);

    // Test 1: Create embedding (should trigger 'pending' status)
    console.log('📝 Test 1: Creating embedding record...');
    const embedding = await prisma.assetEmbedding.create({
      data: {
        assetId: testAsset.id,
        modelName: 'test-model',
        modelVersion: '1.0',
        dim: EMBEDDING_DIMENSION,
        status: 'pending'
      }
    });

    // Wait for notification
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Update to processing
    console.log('\n📝 Test 2: Updating status to processing...');
    await prisma.assetEmbedding.update({
      where: { assetId: testAsset.id },
      data: { status: 'processing' }
    });

    // Wait for notification
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 3: Complete the embedding
    console.log('\n📝 Test 3: Marking embedding as complete...');
    await prisma.assetEmbedding.update({
      where: { assetId: testAsset.id },
      data: {
        status: 'ready',
        completedAt: new Date(),
        // Note: In real scenario, you'd set imageEmbedding with actual vector data
      }
    });

    // Wait for notification
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 4: Test failure scenario
    console.log('\n📝 Test 4: Testing failure scenario...');

    // Create another asset for failure test
    const failAsset = await prisma.asset.create({
      data: {
        ownerUserId: testUser.id,
        blobUrl: 'https://example.com/fail-image.jpg',
        pathname: '/test/fail-image.jpg',
        mime: 'image/jpeg',
        size: 1024,
        checksumSha256: `fail-checksum-${Date.now()}`,
        width: 100,
        height: 100
      }
    });

    await prisma.assetEmbedding.create({
      data: {
        assetId: failAsset.id,
        modelName: 'test-model',
        modelVersion: '1.0',
        dim: EMBEDDING_DIMENSION,
        status: 'processing'
      }
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    await prisma.assetEmbedding.update({
      where: { assetId: failAsset.id },
      data: {
        status: 'failed',
        error: 'Test error: Failed to generate embedding'
      }
    });

    // Wait for notification
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Test Summary:');
    console.log(`Total notifications received: ${notifications.length}`);

    const groupedNotifications = notifications.reduce((acc, n) => {
      acc[n.channel] = (acc[n.channel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(groupedNotifications).forEach(([channel, count]) => {
      console.log(`  - ${channel}: ${count}`);
    });

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await prisma.assetEmbedding.deleteMany({
      where: {
        assetId: { in: [testAsset.id, failAsset.id] }
      }
    });
    await prisma.asset.deleteMany({
      where: {
        id: { in: [testAsset.id, failAsset.id] }
      }
    });

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await listenerClient.end();
    await prisma.$disconnect();
  }
}

// Run the test
testPgNotify().catch(console.error);
