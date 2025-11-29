import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create a test user (you'll need to use your actual Clerk user ID)
  const testUserId = 'user_test_123456789';
  const testEmail = 'test@example.com';

  console.log('Creating test user...');
  const user = await prisma.user.upsert({
    where: { id: testUserId },
    update: {},
    create: {
      id: testUserId,
      email: testEmail,
      role: 'user',
    },
  });

  console.log('Created user:', user.email);

  // Create some test tags
  console.log('Creating test tags...');
  const tags = await Promise.all([
    prisma.tag.upsert({
      where: {
        unique_user_tag: {
          ownerUserId: testUserId,
          name: 'funny',
        },
      },
      update: {},
      create: {
        ownerUserId: testUserId,
        name: 'funny',
        color: '#FFD700',
      },
    }),
    prisma.tag.upsert({
      where: {
        unique_user_tag: {
          ownerUserId: testUserId,
          name: 'reaction',
        },
      },
      update: {},
      create: {
        ownerUserId: testUserId,
        name: 'reaction',
        color: '#FF69B4',
      },
    }),
    prisma.tag.upsert({
      where: {
        unique_user_tag: {
          ownerUserId: testUserId,
          name: 'classic',
        },
      },
      update: {},
      create: {
        ownerUserId: testUserId,
        name: 'classic',
        color: '#00CED1',
      },
    }),
  ]);

  console.log(`Created ${tags.length} tags`);

  // Note: We can't create actual assets without real blob URLs and embeddings
  // In a real scenario, you would:
  // 1. Upload test images to Vercel Blob
  // 2. Generate embeddings via Replicate API
  // 3. Store the data here

  console.log('✅ Seed completed successfully!');
  console.log('');
  console.log('Note: To fully test the app, you need to:');
  console.log('1. Replace testUserId with your actual Clerk user ID');
  console.log('2. Upload real images through the app');
  console.log('3. Generate embeddings via the Replicate API');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });