import { NextResponse } from 'next/server';
import { Prisma, type PrismaClient } from '@prisma/client';

export const ENROLLMENT_DENIAL_CODE = 'enrollment_closed' as const;
export const ENROLLMENT_UNAVAILABLE_CODE = 'enrollment_unavailable' as const;
export const ENROLLMENT_IDENTITY_CONFLICT_CODE = 'enrollment_identity_conflict' as const;

export const DEPLOYMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const DEPLOYMENT_COMMIT_PATTERN = /^[0-9a-f]{7,64}$/i;

// A single application-wide advisory lock makes the aggregate count and the
// following user INSERT one indivisible admission decision. The value is
// stable across processes and does not require a coordination service.
export const ENROLLMENT_ADVISORY_LOCK_KEY = BigInt('7438219117');

export type EnrollmentMode = 'capped' | 'ga' | 'closed';

export interface EnrollmentStatus {
  mode: EnrollmentMode;
  maxAccounts: number | null;
  acceptingNewAccounts: boolean;
  configuration: 'valid' | 'invalid';
  configurationReason:
    | 'configured'
    | 'missing'
    | 'invalid_mode'
    | 'invalid_max_accounts'
    | 'missing_deployment_marker'
    | 'invalid_deployment_marker'
    | 'missing_deployment_identity'
    | 'invalid_deployment_identity';
  gaLifted: boolean;
  deploymentMarker: string | null;
  /** Runtime-resolved DigitalOcean app identity, not the provider deployment ID. */
  deploymentAppId: string | null;
  deploymentChangeId: string | null;
  deploymentCommit: string | null;
}

export class EnrollmentDeniedError extends Error {
  readonly code = ENROLLMENT_DENIAL_CODE;

  constructor() {
    super('New account enrollment is temporarily paused');
    this.name = 'EnrollmentDeniedError';
  }
}

export class EnrollmentUnavailableError extends Error {
  readonly code = ENROLLMENT_UNAVAILABLE_CODE;

  constructor() {
    super('Enrollment policy is unavailable');
    this.name = 'EnrollmentUnavailableError';
  }
}

export class EnrollmentIdentityConflictError extends Error {
  readonly code = ENROLLMENT_IDENTITY_CONFLICT_CODE;

  constructor() {
    super('The authenticated identity conflicts with an existing account');
    this.name = 'EnrollmentIdentityConflictError';
  }
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function hasValidDeploymentIdentity(env: Record<string, string | undefined>): boolean {
  const deploymentId = env.SPLOOT_DEPLOYMENT_APP_ID?.trim();
  const deploymentCommit = env.SPLOOT_DEPLOYMENT_COMMIT?.trim();
  const deploymentChangeId = env.SPLOOT_DEPLOYMENT_CHANGE_ID?.trim();
  return Boolean(
    deploymentId &&
    deploymentCommit &&
    deploymentChangeId &&
    DEPLOYMENT_ID_PATTERN.test(deploymentId) &&
    DEPLOYMENT_ID_PATTERN.test(deploymentChangeId) &&
    DEPLOYMENT_COMMIT_PATTERN.test(deploymentCommit),
  );
}

function deploymentMetadata(env: Record<string, string | undefined>) {
  const deploymentAppId = env.SPLOOT_DEPLOYMENT_APP_ID ?? null;
  return {
    deploymentAppId,
    deploymentChangeId: env.SPLOOT_DEPLOYMENT_CHANGE_ID ?? null,
    deploymentCommit: env.SPLOOT_DEPLOYMENT_COMMIT ?? null,
  };
}

export function getEnrollmentStatus(
  env: Record<string, string | undefined> = process.env,
): EnrollmentStatus {
  const deploymentMarker = env.SPLOOT_DEPLOYMENT_ENV?.trim().toLowerCase();
  const rawMode = env.SPLOOT_ENROLLMENT_MODE?.trim().toLowerCase();
  const isDeployedEnvironment = deploymentMarker === 'production' || deploymentMarker === 'staging';
  const isLocalEnvironment = deploymentMarker === 'development' || deploymentMarker === 'test';
  const isExplicitLocalEnvironment = isLocalEnvironment || env.NODE_ENV === 'development' || env.NODE_ENV === 'test';

  const invalidStatus = (configurationReason: EnrollmentStatus['configurationReason']): EnrollmentStatus => ({
    mode: 'closed',
    maxAccounts: null,
    acceptingNewAccounts: false,
    configuration: 'invalid',
    configurationReason,
    gaLifted: false,
    deploymentMarker: deploymentMarker ?? null,
    ...deploymentMetadata(env),
  });

  if (!isDeployedEnvironment && !isExplicitLocalEnvironment) {
    return invalidStatus(deploymentMarker ? 'invalid_deployment_marker' : 'missing_deployment_marker');
  }

  if (env.NODE_ENV === 'production' && !isDeployedEnvironment) {
    return invalidStatus('invalid_deployment_marker');
  }

  if (deploymentMarker && !isDeployedEnvironment && !isLocalEnvironment) {
    return invalidStatus('invalid_deployment_marker');
  }

  if (isDeployedEnvironment && !rawMode) {
    return invalidStatus('missing');
  }

  if (isDeployedEnvironment) {
    const deploymentId = env.SPLOOT_DEPLOYMENT_APP_ID?.trim();
    const deploymentCommit = env.SPLOOT_DEPLOYMENT_COMMIT?.trim();
    const deploymentChangeId = env.SPLOOT_DEPLOYMENT_CHANGE_ID?.trim();
    if (!deploymentId || !deploymentCommit || !deploymentChangeId) {
      return invalidStatus('missing_deployment_identity');
    }
    if (!hasValidDeploymentIdentity(env)) {
      return invalidStatus('invalid_deployment_identity');
    }
  }

  if (rawMode === 'ga') {
    return {
      mode: 'ga',
      maxAccounts: null,
      acceptingNewAccounts: true,
      configuration: 'valid',
      configurationReason: 'configured',
      gaLifted: true,
      deploymentMarker: deploymentMarker ?? null,
      ...deploymentMetadata(env),
    };
  }

  if (rawMode === 'capped') {
    const maxAccounts = parsePositiveInteger(env.SPLOOT_ENROLLMENT_MAX_ACCOUNTS);
    if (maxAccounts !== null) {
      return {
        mode: 'capped',
        maxAccounts,
        acceptingNewAccounts: true,
        configuration: 'valid',
        configurationReason: 'configured',
        gaLifted: false,
        deploymentMarker: deploymentMarker ?? null,
        ...deploymentMetadata(env),
      };
    }

    return {
      mode: 'closed',
      maxAccounts: null,
      acceptingNewAccounts: false,
      configuration: 'invalid',
      configurationReason: 'invalid_max_accounts',
      gaLifted: false,
      deploymentMarker: deploymentMarker ?? null,
      ...deploymentMetadata(env),
    };
  }

  if (rawMode === 'closed') {
    return {
      mode: 'closed',
      maxAccounts: null,
      acceptingNewAccounts: false,
      configuration: 'valid',
      configurationReason: 'configured',
      gaLifted: false,
      deploymentMarker: deploymentMarker ?? null,
      ...deploymentMetadata(env),
    };
  }

  // Development and tests remain usable without deployment-only config. A
  // production process with missing or malformed config is closed for new
  // accounts, while existing rows remain fully usable.
  if (isExplicitLocalEnvironment) {
    return {
      mode: 'ga',
      maxAccounts: null,
      acceptingNewAccounts: true,
      configuration: 'valid',
      configurationReason: 'missing',
      gaLifted: true,
      deploymentMarker: deploymentMarker ?? null,
      ...deploymentMetadata(env),
    };
  }

  return invalidStatus(rawMode ? 'invalid_mode' : 'missing');
}

export function getEnrollmentReadback(
  accountCount: number,
  env: Record<string, string | undefined> = process.env,
) {
  const status = getEnrollmentStatus(env);
  const remainingAccounts = status.maxAccounts === null
    ? null
    : Math.max(0, status.maxAccounts - accountCount);

  return {
    ...status,
    accountCount,
    remainingAccounts,
    acceptingNewAccounts: status.acceptingNewAccounts && (
      status.maxAccounts === null || accountCount < status.maxAccounts
    ),
  };
}

export function enrollmentDeniedResponseBody() {
  return {
    success: false,
    error: 'New account enrollment is temporarily paused.',
    code: ENROLLMENT_DENIAL_CODE,
    retryable: true,
    action: {
      type: 'try_later',
      label: 'Try again later',
    },
  } as const;
}

export function enrollmentDeniedResponse(): NextResponse {
  return NextResponse.json(enrollmentDeniedResponseBody(), { status: 403 });
}

export function enrollmentUnavailableResponse(): NextResponse {
  return NextResponse.json({
    success: false,
    error: 'Enrollment policy is temporarily unavailable.',
    code: ENROLLMENT_UNAVAILABLE_CODE,
    retryable: true,
    action: { type: 'try_later', label: 'Try again later' },
  }, { status: 503 });
}

export function enrollmentIdentityConflictResponse(): NextResponse {
  return NextResponse.json({
    success: false,
    error: 'This sign-in identity conflicts with an existing account.',
    code: ENROLLMENT_IDENTITY_CONFLICT_CODE,
    retryable: false,
    action: { type: 'contact_support', label: 'Contact support', href: '/support' },
  }, { status: 409 });
}

export function isEnrollmentDeniedError(error: unknown): error is EnrollmentDeniedError {
  return error instanceof EnrollmentDeniedError || (
    typeof error === 'object' && error !== null &&
    (error as { code?: unknown }).code === ENROLLMENT_DENIAL_CODE
  );
}

export function isEnrollmentUnavailableError(error: unknown): error is EnrollmentUnavailableError {
  return error instanceof EnrollmentUnavailableError || (
    typeof error === 'object' && error !== null &&
    (error as { code?: unknown }).code === ENROLLMENT_UNAVAILABLE_CODE
  );
}

export function isEnrollmentIdentityConflictError(error: unknown): error is EnrollmentIdentityConflictError {
  return error instanceof EnrollmentIdentityConflictError || (
    typeof error === 'object' && error !== null &&
    (error as { code?: unknown }).code === ENROLLMENT_IDENTITY_CONFLICT_CODE
  );
}

export function enrollmentResponseForError(error: unknown): NextResponse | null {
  if (isEnrollmentDeniedError(error)) return enrollmentDeniedResponse();
  if (isEnrollmentUnavailableError(error)) return enrollmentUnavailableResponse();
  if (isEnrollmentIdentityConflictError(error)) return enrollmentIdentityConflictResponse();
  return null;
}

export async function acquireEnrollmentAdvisoryLock(tx: Prisma.TransactionClient): Promise<void> {
  try {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ENROLLMENT_ADVISORY_LOCK_KEY})`;
  } catch {
    throw new EnrollmentUnavailableError();
  }
}

/**
 * Serializes every writer that can mutate rows keyed only by a user identity.
 * Writers must hold this lock and prove the User row still exists before
 * inserting; that closes the late-writer window for legacy tables without FKs.
 */
export async function acquireEnrollmentIdentityWriterLock(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  try {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sploot:enrollment:user:${userId}`}))`;
  } catch {
    throw new EnrollmentUnavailableError();
  }
}

export async function withEnrollmentIdentityWriter<T>(
  db: PrismaClient | null,
  userId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!db || typeof db.$transaction !== 'function') {
    throw new EnrollmentUnavailableError();
  }
  try {
    return await db.$transaction(async (tx) => {
      await acquireEnrollmentIdentityWriterLock(tx, userId);
      const enrolledUser = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!enrolledUser) throw new EnrollmentUnavailableError();
      return work(tx);
    });
  } catch (error: unknown) {
    if (isEnrollmentUnavailableError(error)) throw error;
    throw new EnrollmentUnavailableError();
  }
}

/**
 * Admission check for routes that can spend money without creating a user.
 * The user row is the durable enrollment receipt; no separate state table is
 * necessary. In production a missing database is fail-closed for new spend.
 */
export async function assertEnrolledUser(userId: string, db: PrismaClient | null): Promise<void> {
  if (!db?.user?.findUnique) {
    throw new EnrollmentUnavailableError();
  }

  let user: { id: string } | null;
  try {
    user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  } catch {
    throw new EnrollmentUnavailableError();
  }
  if (!user) {
    throw new EnrollmentDeniedError();
  }
}

/**
 * Must be called inside the transaction that creates a new User row.
 */
export async function assertNewEnrollmentAllowed(
  tx: Prisma.TransactionClient,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const status = getEnrollmentStatus(env);
  if (!status.acceptingNewAccounts || status.mode === 'closed') {
    throw new EnrollmentDeniedError();
  }

  if (status.mode === 'ga') return;

  let accountCount: number;
  try {
    await acquireEnrollmentAdvisoryLock(tx);
    accountCount = await tx.user.count();
  } catch (error: unknown) {
    if (error instanceof EnrollmentUnavailableError) throw error;
    throw new EnrollmentUnavailableError();
  }

  if (accountCount >= status.maxAccounts!) {
    throw new EnrollmentDeniedError();
  }
}
