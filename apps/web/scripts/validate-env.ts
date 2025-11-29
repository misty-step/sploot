#!/usr/bin/env tsx
/**
 * Environment Variable Validation Script
 *
 * Validates that DATABASE_URL is properly configured for Prisma + Neon.
 * Run this before deployment to catch configuration errors early.
 *
 * Usage:
 *   pnpm validate:env              # Validate current environment
 *   NODE_ENV=production pnpm validate:env  # Validate production config
 */

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateDatabaseUrl(): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  const databaseUrl = process.env.DATABASE_URL;

  // Check 1: DATABASE_URL must be set
  if (!databaseUrl) {
    result.valid = false;
    result.errors.push('DATABASE_URL is not set');
    result.errors.push('  Set it to your Neon pooler endpoint:');
    result.errors.push('  postgresql://user:pass@host-pooler.neon.tech/db?sslmode=require&pgbouncer=true');
    return result;
  }

  // Check 2: Must be a valid PostgreSQL URL
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch (e) {
    result.valid = false;
    // Redact password before logging
    const redacted = databaseUrl
      ? databaseUrl.replace(/:[^:@]*@/, ':***@')
      : '(not set)';
    result.errors.push(`DATABASE_URL is not a valid URL: ${redacted}`);
    result.errors.push('  Check that URL follows postgresql://user:pass@host/db format');
    return result;
  }

  // Check 3: Must be postgresql:// protocol
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    result.valid = false;
    result.errors.push(`DATABASE_URL must use postgresql:// protocol, got: ${url.protocol}`);
  }

  // Check 4: Must have hostname
  if (!url.hostname) {
    result.valid = false;
    result.errors.push('DATABASE_URL must include hostname');
  }

  // Check 5: If hostname contains -pooler, must have pgbouncer=true
  if (url.hostname.includes('-pooler')) {
    const hasPgBouncer = url.searchParams.has('pgbouncer');
    const pgbouncerValue = url.searchParams.get('pgbouncer');

    if (!hasPgBouncer || pgbouncerValue !== 'true') {
      result.valid = false;
      result.errors.push('Pooler endpoint detected but pgbouncer=true parameter is missing');
      result.errors.push('  Add: ?pgbouncer=true to the connection string');
      result.errors.push('  Prisma requires this to disable prepared statements with PgBouncer');
    }
  }

  // Check 6: Should have sslmode=require for Neon
  const sslmode = url.searchParams.get('sslmode');
  if (!sslmode || sslmode !== 'require') {
    result.warnings.push('Recommended: Add sslmode=require for secure connections to Neon');
  }

  // Check 7: Warn about channel_binding (should not be present)
  const channelBinding = url.searchParams.get('channel_binding');
  if (channelBinding === 'require') {
    result.warnings.push('Warning: channel_binding=require may cause issues with PgBouncer');
    result.warnings.push('  Consider removing this parameter');
  }

  // Check 8: Warn if deprecated env vars are still set
  if (process.env.POSTGRES_URL) {
    result.warnings.push('POSTGRES_URL is set but deprecated - use DATABASE_URL instead');
  }
  if (process.env.POSTGRES_URL_NON_POOLING) {
    result.warnings.push('POSTGRES_URL_NON_POOLING is set but deprecated - use DATABASE_URL instead');
  }

  return result;
}

function printResult(result: ValidationResult) {
  console.log('\n🔍 Database Configuration Validation\n');

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:\n');
    result.errors.forEach(error => console.log(`  ${error}`));
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:\n');
    result.warnings.forEach(warning => console.log(`  ${warning}`));
  }

  if (result.valid && result.errors.length === 0) {
    console.log('✅ DATABASE_URL is valid\n');

    // Show redacted URL for confirmation
    const url = new URL(process.env.DATABASE_URL!);
    const redacted = process.env.DATABASE_URL!.replace(/:[^:@]*@/, ':***@');
    console.log(`  Host: ${url.hostname}`);
    console.log(`  Database: ${url.pathname.slice(1)}`);
    console.log(`  URL: ${redacted}\n`);
  }
}

function main() {
  const result = validateDatabaseUrl();
  printResult(result);

  if (!result.valid) {
    console.log('\n❌ Validation failed\n');
    process.exit(1);
  }

  console.log('✅ All checks passed\n');
  process.exit(0);
}

main();
