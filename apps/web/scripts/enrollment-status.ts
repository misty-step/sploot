#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { getEnrollmentReadback } from '../lib/enrollment/enrollment-policy';

function expectedMode(): string | undefined {
  const index = process.argv.indexOf('--expect-mode');
  return index === -1 ? undefined : process.argv[index + 1];
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Enrollment readback unavailable: DATABASE_URL is not configured.');
    process.exitCode = 2;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const accountCount = await prisma.user.count();
    const readback = getEnrollmentReadback(accountCount);
    const expected = expectedMode();
    if (expected && readback.mode !== expected) {
      throw new Error(`Enrollment mode mismatch: expected ${expected}, got ${readback.mode}`);
    }
    const expectedAppId = argument('--expect-app-id');
    const expectedChangeId = argument('--expect-change-id');
    const expectedCommit = argument('--expect-commit');
    const expectedMarker = argument('--expect-marker');
    if (expectedAppId && readback.deploymentAppId !== expectedAppId) {
      throw new Error(`Deployment app ID mismatch: expected ${expectedAppId}, got ${readback.deploymentAppId ?? 'missing'}`);
    }
    if (expectedChangeId && readback.deploymentChangeId !== expectedChangeId) {
      throw new Error(`Deployment change ID mismatch: expected ${expectedChangeId}, got ${readback.deploymentChangeId ?? 'missing'}`);
    }
    if (expectedCommit && readback.deploymentCommit !== expectedCommit) {
      throw new Error(`Deployment commit mismatch: expected ${expectedCommit}, got ${readback.deploymentCommit ?? 'missing'}`);
    }
    if (expectedMarker && readback.deploymentMarker !== expectedMarker) {
      throw new Error(`Deployment marker mismatch: expected ${expectedMarker}, got ${readback.deploymentMarker ?? 'missing'}`);
    }
    if (readback.configuration !== 'valid') {
      throw new Error(`Enrollment configuration is ${readback.configuration}: ${readback.configurationReason}`);
    }
    console.log(JSON.stringify(readback, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Enrollment readback failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
