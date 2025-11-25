
import { sanitizePostgresUrl } from '@/lib/env';

async function main() {
  console.log('Testing DB Connection URL Logic...');

  const originalUrl = process.env.POSTGRES_URL;
  const originalNonPoolingUrl = process.env.POSTGRES_URL_NON_POOLING;

  console.log('--- Current Env Vars ---');
  console.log('POSTGRES_URL:', originalUrl);
  console.log('POSTGRES_URL_NON_POOLING:', originalNonPoolingUrl);

  // Simulate Vercel environment
  Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });

  // 1. Simulate sanitization
  const sanitizedUrl = sanitizePostgresUrl(originalUrl);
  const sanitizedNonPoolingUrl = sanitizePostgresUrl(originalNonPoolingUrl);

  console.log('--- Sanitized URLs ---');
  console.log('Sanitized POSTGRES_URL:', sanitizedUrl);
  console.log('Sanitized POSTGRES_URL_NON_POOLING:', sanitizedNonPoolingUrl);

  // 2. Simulate selection logic
  const selectedUrl = sanitizedNonPoolingUrl || sanitizedUrl;
  console.log('--- Selected URL for Prisma ---');
  console.log('Selected URL:', selectedUrl);

  // 3. Verify what Prisma would use
  if (selectedUrl) {
    console.log('Is using Non-Pooling?', selectedUrl === sanitizedNonPoolingUrl);
    console.log('Contains pgbouncer?', selectedUrl.includes('pgbouncer=true'));
    console.log('Contains channel_binding?', selectedUrl.includes('channel_binding=require'));
  } else {
    console.error('No URL selected!');
  }
}

main();
