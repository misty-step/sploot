#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDuplicateEmails() {
  console.log('Checking for duplicate email records...\n');

  // Get all users
  const users = await prisma.user.findMany({
    orderBy: [{ email: 'asc' }, { createdAt: 'asc' }],
  });

  console.log(`Total users: ${users.length}\n`);

  // Group by email
  const emailGroups = new Map<string, typeof users>();
  for (const user of users) {
    const existing = emailGroups.get(user.email) || [];
    existing.push(user);
    emailGroups.set(user.email, existing);
  }

  // Find duplicates
  const duplicates: string[] = [];
  for (const [email, userList] of emailGroups.entries()) {
    if (userList.length > 1) {
      duplicates.push(email);
      console.log(`\n🔴 DUPLICATE EMAIL: ${email}`);
      for (const user of userList) {
        console.log(`  - ID: ${user.id}, Created: ${user.createdAt}, Updated: ${user.updatedAt}`);
      }
    }
  }

  if (duplicates.length === 0) {
    console.log('\n✅ No duplicate emails found');
  } else {
    console.log(`\n\n❌ Found ${duplicates.length} duplicate email(s)`);
  }

  // Check specific user
  const targetEmail = 'phrazzld@pm.me';
  console.log(`\n\nChecking specific user: ${targetEmail}`);
  const targetUsers = await prisma.user.findMany({
    where: { email: targetEmail },
  });

  console.log(`Found ${targetUsers.length} user(s) with email ${targetEmail}:`);
  for (const user of targetUsers) {
    console.log(`  - ID: ${user.id}`);
    console.log(`    Email: ${user.email}`);
    console.log(`    Role: ${user.role}`);
    console.log(`    Created: ${user.createdAt}`);
    console.log(`    Updated: ${user.updatedAt}`);

    // Check if they have assets
    const assetCount = await prisma.asset.count({
      where: { ownerUserId: user.id },
    });
    console.log(`    Assets: ${assetCount}`);
  }

  await prisma.$disconnect();
}

checkDuplicateEmails().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
