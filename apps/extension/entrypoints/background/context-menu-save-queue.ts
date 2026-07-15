import { UPLOAD } from '@sploot/common';
import { setSaveStatus } from '../../shared/save-status';
import { getAuthAuthority, readAuthAuthority, sameAccountAuthority, type AuthAuthority } from './auth-manager';
import { fetchImage } from './image-fetcher';
import { showErrorNotification } from './notifications';
import { saveToSploot } from './save-flow';

export const CONTEXT_MENU_QUEUE_KEY = 'sploot:context-menu-queue';
export const CONTEXT_MENU_SAVE_ALARM_NAME = 'sploot:context-menu-save-wakeup';
export const MAX_CONTEXT_MENU_SAVE_QUEUE_SIZE = 50;
export const MAX_CONTEXT_MENU_SAVE_ATTEMPTS = 5;
export const MAX_CONTEXT_MENU_SAVE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Failed/paused saves are retained for the popup to retry or discard, but only
 * for a bounded window after they became terminal. Without expiry, another
 * account's invisible terminal jobs would hold global queue/byte capacity
 * forever and permanently wedge this profile.
 */
export const TERMINAL_SAVE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const PROCESSING_STALE_TIMEOUT_MS = 5 * 60 * 1000;
export const RETRY_BACKOFF_BASE_MS = 30 * 1000;
export const RETRY_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;
export const MAX_CONTEXT_MENU_SAVE_CONCURRENCY = 2;
/** Base64-encoded source bytes retained across worker crashes. */
export const MAX_CONTEXT_MENU_SAVE_STORAGE_BYTES = 8 * 1024 * 1024;
/** Fetch, conversion, and upload each have a finite worker deadline. */
export const CONTEXT_MENU_SAVE_DEADLINE_MS = UPLOAD.timeout;

export type ContextMenuSaveJobState = 'pending' | 'processing' | 'failed' | 'paused';

export interface ContextMenuSaveJob {
  id: string;
  imageUrl: string;
  filename: string;
  state: ContextMenuSaveJobState;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  processingStartedAt?: number;
  processingToken?: string;
  /** A timed-out operation must settle before its token can be retried. */
  processingSettling?: boolean;
  lastError?: string;
  failedAt?: number;
  /** When the job was paused for an owner change; bounds terminal retention. */
  pausedAt?: number;
  /**
   * Stable Clerk ACCOUNT identity that owns the durable job (the recorded
   * sessionId is credential provenance only — ownership checks compare
   * account identity via sameAccountAuthority). Never shown in popup summaries.
   */
  owner?: AuthAuthority;
  /** Original bytes are persisted before the job is authoritative. */
  sourceBytes?: string;
  sourceType?: string;
  /** SHA-256 of the exact persisted source bytes, used to fence replay drift. */
  sourceSha256?: string;
}

export class ContextMenuSaveQueueError extends Error {
  constructor(
    message: string,
    public readonly code: 'queue-full' | 'owner-unavailable' | 'owner-changed',
  ) {
    super(message);
    this.name = 'ContextMenuSaveQueueError';
  }
}

let queueOperations = Promise.resolve();
let jobMutations = Promise.resolve();

/** Exported for direct unit coverage of the admission fence. */
export class ConcurrencyGate {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    // Re-check after every wake: a new caller can be admitted synchronously
    // between a release waking this waiter and the waiter resuming, so a woken
    // waiter must never assume a free slot (that soft-over-admits the gate).
    while (this.active >= this.limit) {
      await new Promise<void>(resolve => this.waiters.push(resolve));
    }
    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }
}

const fetchAdmission = new ConcurrencyGate(MAX_CONTEXT_MENU_SAVE_CONCURRENCY);
const recoveryAdmission = new ConcurrencyGate(MAX_CONTEXT_MENU_SAVE_CONCURRENCY);

function exclusively<T>(operation: () => Promise<T>): Promise<T> {
  const next = queueOperations.then(operation, operation);
  queueOperations = next.then(() => undefined, () => undefined);
  return next;
}

function mutateJobs(operation: () => Promise<void>): Promise<void> {
  const next = jobMutations.then(operation, operation);
  jobMutations = next.then(() => undefined, () => undefined);
  return next;
}

function startRecovery(trigger: RecoveryTrigger = 'alarm', onlyJobId?: string): {
  started: Promise<void>;
  completed: Promise<void>;
} {
  let markStarted!: () => void;
  const started = new Promise<void>(resolve => {
    markStarted = resolve;
  });
  const completed = exclusively(async () => {
    markStarted();
    await recoverPendingSavesLocked(trigger, onlyJobId);
  });
  return { started, completed };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function validAuthority(value: unknown): value is AuthAuthority {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as AuthAuthority).userId === 'string'
    && (value as AuthAuthority).userId.length > 0
    && ((value as AuthAuthority).accountId === undefined || typeof (value as AuthAuthority).accountId === 'string')
    && typeof (value as AuthAuthority).sessionId === 'string'
    && (value as AuthAuthority).sessionId.length > 0,
  );
}

function normalizeJob(job: unknown): ContextMenuSaveJob | null {
  if (!job || typeof job !== 'object') {
    return null;
  }

  const candidate = job as Partial<ContextMenuSaveJob>;
  if (
    typeof candidate.id !== 'string'
    || typeof candidate.imageUrl !== 'string'
    || typeof candidate.filename !== 'string'
    || !['pending', 'processing', 'failed', 'paused'].includes(candidate.state ?? '')
    || typeof candidate.createdAt !== 'number'
    || !Number.isFinite(candidate.createdAt)
  ) {
    return null;
  }

  const normalized: ContextMenuSaveJob = {
    id: candidate.id,
    imageUrl: candidate.imageUrl,
    filename: candidate.filename,
    state: candidate.state as ContextMenuSaveJobState,
    createdAt: candidate.createdAt,
    attempts: Math.max(0, Math.floor(finiteNumber(candidate.attempts, 0))),
    nextAttemptAt: finiteNumber(candidate.nextAttemptAt, candidate.createdAt),
  };

  if (validAuthority(candidate.owner)) {
    normalized.owner = candidate.owner;
  }
  if (typeof candidate.processingStartedAt === 'number' && Number.isFinite(candidate.processingStartedAt)) {
    normalized.processingStartedAt = candidate.processingStartedAt;
  }
  if (typeof candidate.processingToken === 'string') {
    normalized.processingToken = candidate.processingToken;
  }
  if (candidate.processingSettling === true) {
    normalized.processingSettling = true;
  }
  if (typeof candidate.lastError === 'string') {
    normalized.lastError = candidate.lastError;
  }
  if (typeof candidate.failedAt === 'number' && Number.isFinite(candidate.failedAt)) {
    normalized.failedAt = candidate.failedAt;
  }
  if (typeof candidate.pausedAt === 'number' && Number.isFinite(candidate.pausedAt)) {
    normalized.pausedAt = candidate.pausedAt;
  }
  if (typeof candidate.sourceBytes === 'string' && typeof candidate.sourceType === 'string') {
    normalized.sourceBytes = candidate.sourceBytes;
    normalized.sourceType = candidate.sourceType;
  }
  if (typeof candidate.sourceSha256 === 'string' && /^[a-f0-9]{64}$/.test(candidate.sourceSha256)) {
    normalized.sourceSha256 = candidate.sourceSha256;
  }

  return normalized;
}

async function readJobs(): Promise<ContextMenuSaveJob[]> {
  const stored = await chrome.storage.local.get(CONTEXT_MENU_QUEUE_KEY);
  const jobs = stored[CONTEXT_MENU_QUEUE_KEY];
  if (!Array.isArray(jobs)) {
    return [];
  }

  return jobs.flatMap(job => {
    const normalized = normalizeJob(job);
    return normalized ? [normalized] : [];
  });
}

function queueError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Queue storage is unavailable.');
}

function retainedSourceBytes(jobs: ContextMenuSaveJob[]): number {
  return jobs.reduce((total, job) => total + (job.sourceBytes?.length ?? 0), 0);
}

async function blobToStoredSource(blob: Blob): Promise<Required<Pick<ContextMenuSaveJob, 'sourceBytes' | 'sourceType' | 'sourceSha256'>>> {
  if (blob.size <= 0 || blob.size > UPLOAD.multipartSafeSize) {
    throw new Error('Original image cannot be retained within the bounded retry storage budget.');
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return {
    sourceBytes: btoa(binary),
    sourceType: blob.type || 'application/octet-stream',
    sourceSha256: await sha256Hex(bytes),
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function storedSourceToBlob(job: ContextMenuSaveJob): Promise<Blob> {
  if (!job.sourceBytes || !job.sourceType) {
    throw new Error('Durable image bytes are unavailable; this save must be discarded.');
  }

  const binary = atob(job.sourceBytes);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (job.sourceSha256 && await sha256Hex(bytes) !== job.sourceSha256) {
    throw new Error('Durable image bytes failed integrity verification; this save must be discarded.');
  }
  return new Blob([bytes], { type: job.sourceType });
}

function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(RETRY_BACKOFF_MAX_MS, RETRY_BACKOFF_BASE_MS * (2 ** exponent));
}

function isTooOld(job: ContextMenuSaveJob, now: number): boolean {
  return now - job.createdAt >= MAX_CONTEXT_MENU_SAVE_AGE_MS;
}

/** Terminal (failed/paused) saves age out after the bounded retention window. */
function isTerminalExpired(job: ContextMenuSaveJob, now: number): boolean {
  if (job.state !== 'failed' && job.state !== 'paused') {
    return false;
  }
  const terminalAt = job.state === 'failed'
    ? (job.failedAt ?? job.createdAt)
    : (job.pausedAt ?? job.createdAt);
  return now - terminalAt >= TERMINAL_SAVE_RETENTION_MS;
}

function terminalFailure(job: ContextMenuSaveJob, now: number, error: string): ContextMenuSaveJob {
  return {
    ...job,
    state: 'failed',
    nextAttemptAt: 0,
    processingStartedAt: undefined,
    processingToken: undefined,
    processingSettling: undefined,
    lastError: error,
    failedAt: now,
  };
}

function pauseForOwnerChange(job: ContextMenuSaveJob, now: number): ContextMenuSaveJob {
  return {
    ...job,
    state: 'paused',
    nextAttemptAt: 0,
    processingStartedAt: undefined,
    processingToken: undefined,
    processingSettling: undefined,
    lastError: 'Sign in to the original Sploot account to resume this save.',
    pausedAt: now,
  };
}

async function releaseTimedOutProcessing(processing: ContextMenuSaveJob): Promise<void> {
  await mutateJobs(async () => {
    const latest = await readJobs();
    const active = latest.find(candidate => (
      candidate.id === processing.id
      && candidate.state === 'processing'
      && candidate.processingToken === processing.processingToken
      && candidate.processingSettling === true
    ));
    if (!active) return;

    const retryable: ContextMenuSaveJob = {
      ...active,
      state: 'pending',
      processingStartedAt: undefined,
      processingToken: undefined,
      processingSettling: undefined,
      nextAttemptAt: Date.now() + retryDelayMs(active.attempts),
    };
    await writeJobs(latest.map(candidate => candidate.id === active.id ? retryable : candidate));
    setSaveStatus({
      state: 'retrying',
      label: `Retry scheduled for ${retryable.filename}.`,
      nextAttemptAt: retryable.nextAttemptAt,
      at: Date.now(),
    });
  });
}

function notifyTerminalFailure(job: ContextMenuSaveJob): void {
  try {
    showErrorNotification({
      message: `${job.lastError ?? 'Could not save this image.'} Save is retained. Open the extension popup to Retry or discard it.`,
    });
  } catch (error) {
    console.error('[Background][ContextMenu] Terminal failure feedback failed', error);
  }
}

function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  message: string,
  timeoutMs = CONTEXT_MENU_SAVE_DEADLINE_MS,
): Promise<T> {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = setTimeout(() => {
      controller.abort();
      finish(() => reject(new Error(message)));
    }, timeoutMs);
    operation(controller.signal).then(
      value => {
        finish(() => resolve(value));
      },
      error => {
        finish(() => reject(error));
      },
    );
  });
}

export async function scheduleContextMenuSaveQueueWakeup(): Promise<void> {
  const jobs = await readJobs();
  const now = Date.now();
  const dueAt = jobs.reduce<number | undefined>((earliest, job) => {
    const candidate = job.state === 'pending'
      ? job.nextAttemptAt
      : job.state === 'processing'
        ? (job.processingStartedAt ?? job.createdAt) + PROCESSING_STALE_TIMEOUT_MS
        : undefined;
    if (candidate === undefined) {
      return earliest;
    }
    return earliest === undefined ? candidate : Math.min(earliest, candidate);
  }, undefined);

  if (dueAt === undefined) {
    await chrome.alarms.clear(CONTEXT_MENU_SAVE_ALARM_NAME);
    return;
  }

  await chrome.alarms.create(CONTEXT_MENU_SAVE_ALARM_NAME, { when: Math.max(now, dueAt) });
}

async function writeJobs(jobs: ContextMenuSaveJob[]): Promise<void> {
  if (retainedSourceBytes(jobs) > MAX_CONTEXT_MENU_SAVE_STORAGE_BYTES) {
    throw new Error('Original image bytes exceed the bounded retry storage budget.');
  }
  await chrome.storage.local.set({ [CONTEXT_MENU_QUEUE_KEY]: jobs });
  await scheduleContextMenuSaveQueueWakeup();
}

function setQueuedStatus(filename: string): void {
  setSaveStatus({ state: 'queued', label: `Queued ${filename} for saving…`, at: Date.now() });
}

async function terminalizeIfNeeded(
  jobs: ContextMenuSaveJob[],
  job: ContextMenuSaveJob,
  now: number,
): Promise<{ jobs: ContextMenuSaveJob[]; job: ContextMenuSaveJob; terminalized: boolean }> {
  if (job.state === 'failed' || job.state === 'paused') {
    return { jobs, job, terminalized: false };
  }

  if (job.attempts < MAX_CONTEXT_MENU_SAVE_ATTEMPTS && !isTooOld(job, now)) {
    return { jobs, job, terminalized: false };
  }

  let terminalized = false;
  let terminal = job;
  let nextJobs = jobs;
  await mutateJobs(async () => {
    const latest = await readJobs();
    const live = latest.find(candidate => (
      candidate.id === job.id
      && candidate.state === job.state
      && (!job.processingToken || candidate.processingToken === job.processingToken)
    ));
    if (!live) {
      return;
    }
    terminal = terminalFailure(
      live,
      now,
      live.lastError ?? (isTooOld(live, now) ? 'Save expired before it could complete.' : 'Save reached its retry limit.'),
    );
    nextJobs = latest.map(candidate => candidate.id === live.id ? terminal : candidate);
    await writeJobs(nextJobs);
    terminalized = true;
  });
  if (terminalized) {
    notifyTerminalFailure(terminal);
  }
  return { jobs: nextJobs, job: terminal, terminalized };
}

interface PauseSweep {
  pauseNotified: boolean;
}

/**
 * A transient auth failure is NOT an owner change: keep the job pending with a
 * bounded, visible retry instead of silently pausing it.
 */
async function deferForTransientAuthFailure(job: ContextMenuSaveJob, message: string): Promise<void> {
  const now = Date.now();
  const attempts = job.attempts + 1;
  const deferred: ContextMenuSaveJob = {
    ...job,
    state: 'pending',
    attempts,
    nextAttemptAt: now + retryDelayMs(attempts),
    lastError: message,
  };
  let persisted = false;
  await mutateJobs(async () => {
    const latest = await readJobs();
    const live = latest.find(candidate => candidate.id === job.id && candidate.state === 'pending');
    if (!live) {
      return;
    }
    await writeJobs(latest.map(candidate => candidate.id === job.id ? deferred : candidate));
    persisted = true;
  });
  if (!persisted) {
    return;
  }
  const terminal = await terminalizeIfNeeded(await readJobs(), deferred, Date.now());
  if (terminal.terminalized) {
    return;
  }
  setSaveStatus({
    state: 'retrying',
    label: `Retry scheduled for ${deferred.filename}.`,
    nextAttemptAt: deferred.nextAttemptAt,
    at: Date.now(),
  });
}

async function processJob(job: ContextMenuSaveJob, sweep: PauseSweep = { pauseNotified: false }): Promise<void> {
  const jobs = await readJobs();
  const current = jobs.find(candidate => candidate.id === job.id);
  if (!current || current.state !== 'pending') {
    return;
  }

  if (!current.owner || !current.sourceBytes || !current.sourceType) {
    const invalid = terminalFailure(current, Date.now(), 'This save has no durable owner or image bytes and must be discarded.');
    await mutateJobs(async () => {
      const latest = await readJobs();
      await writeJobs(latest.map(candidate => candidate.id === current.id ? invalid : candidate));
    });
    return;
  }

  let currentOwner: AuthAuthority | null;
  try {
    currentOwner = await withDeadline(
      signal => readAuthAuthority(signal),
      'Auth check timed out; retry scheduled.',
    );
  } catch (error) {
    if (current.nextAttemptAt > Date.now()) {
      // Not due yet; the durable alarm re-checks without burning an attempt.
      return;
    }
    await deferForTransientAuthFailure(current, queueError(error).message);
    return;
  }
  if (!sameAccountAuthority(currentOwner, current.owner)) {
    let paused = false;
    await mutateJobs(async () => {
      const latest = await readJobs();
      const live = latest.find(candidate => candidate.id === current.id && candidate.state === 'pending');
      if (!live) {
        return;
      }
      await writeJobs(latest.map(candidate => candidate.id === current.id ? pauseForOwnerChange(candidate, Date.now()) : candidate));
      paused = true;
    });
    if (paused && !sweep.pauseNotified) {
      sweep.pauseNotified = true;
      try {
        // One notification per recovery pass; never name the paused files —
        // they belong to a different account than the one signed in here.
        showErrorNotification({
          message: 'Sign in to the original Sploot account to resume paused saves. Open the extension popup to review them.',
        });
      } catch (error) {
        console.error('[Background][ContextMenu] Pause feedback failed', error);
      }
    }
    return;
  }

  // Owner fencing is authoritative even when retry backoff has not elapsed.
  // A restart must pause a job for the wrong Clerk authority immediately;
  // otherwise a future-dated job can remain pending and leak across accounts.
  if (current.nextAttemptAt > Date.now()) {
    return;
  }

  const now = Date.now();
  const terminalized = await terminalizeIfNeeded(jobs, current, now);
  if (terminalized.terminalized) {
    return;
  }

  const processing: ContextMenuSaveJob = {
    ...current,
    state: 'processing',
    attempts: current.attempts + 1,
    processingStartedAt: now,
    processingToken: crypto.randomUUID(),
    processingSettling: undefined,
  };
  let processingPersisted = false;
  await mutateJobs(async () => {
    const latest = await readJobs();
    const stillPending = latest.find(candidate => candidate.id === current.id && candidate.state === 'pending');
    if (stillPending) {
      await writeJobs(latest.map(candidate => candidate.id === current.id ? processing : candidate));
      processingPersisted = true;
    }
  });
  if (!processingPersisted) {
    return;
  }

  const controller = new AbortController();
  const sourceBlob = await storedSourceToBlob(processing);
  const operationPromise = Promise.resolve().then(() => saveToSploot(
    async () => ({ blob: sourceBlob, filename: processing.filename }),
    'image',
    { owner: processing.owner, signal: controller.signal },
  ));
  let outcome: Awaited<ReturnType<typeof saveToSploot>>;
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error('Save processing timed out; retry waits for cancellation.'));
    }, CONTEXT_MENU_SAVE_DEADLINE_MS);
  });
  try {
    outcome = await Promise.race([operationPromise, timeoutPromise]);
  } catch (error) {
    outcome = { ok: false, error: queueError(error) };
  } finally {
    if (!timedOut && timeoutId) clearTimeout(timeoutId);
  }

  if (timedOut) {
    await mutateJobs(async () => {
      const latest = await readJobs();
      const activeLatest = latest.find(candidate => (
        candidate.id === processing.id
        && candidate.state === 'processing'
        && candidate.processingToken === processing.processingToken
      ));
      if (activeLatest) {
        await writeJobs(latest.map(candidate => candidate.id === processing.id
          ? {
              ...candidate,
              processingSettling: true,
              lastError: (outcome.ok
                ? new Error('Save processing timed out; retry waits for cancellation.')
                : outcome.error).message,
            }
          : candidate));
      }
    });
    void operationPromise.then(
      () => releaseTimedOutProcessing(processing),
      () => releaseTimedOutProcessing(processing),
    );
    return;
  }

  const remaining = await readJobs();
  const active = remaining.find(candidate => (
    candidate.id === processing.id
    && candidate.state === 'processing'
    && candidate.processingToken === processing.processingToken
  ));
  if (!active) {
    return;
  }

  if (outcome.ok) {
    // The API checksum makes a post-upload worker crash safe to replay.
    await mutateJobs(async () => {
      const latest = await readJobs();
      const activeLatest = latest.find(candidate => (
        candidate.id === processing.id
        && candidate.state === 'processing'
        && candidate.processingToken === processing.processingToken
      ));
      if (activeLatest) {
        await writeJobs(latest.filter(candidate => candidate.id !== processing.id));
      }
    });
    return;
  }

  const failure: ContextMenuSaveJob = {
    ...active,
    state: 'pending',
    processingStartedAt: undefined,
    processingToken: undefined,
    processingSettling: undefined,
    lastError: outcome.error.message,
    nextAttemptAt: Date.now() + retryDelayMs(processing.attempts),
  };
  await mutateJobs(async () => {
    const latest = await readJobs();
    const activeLatest = latest.find(candidate => (
      candidate.id === processing.id
      && candidate.state === 'processing'
      && candidate.processingToken === processing.processingToken
    ));
    if (activeLatest) {
      await writeJobs(latest.map(candidate => candidate.id === processing.id ? failure : candidate));
    }
  });
  const afterFailure = await readJobs();
  const terminal = await terminalizeIfNeeded(afterFailure, failure, Date.now());
  if (terminal.terminalized) {
    return;
  }
  setSaveStatus({
    state: 'retrying',
    label: `Retry scheduled for ${failure.filename}.`,
    nextAttemptAt: failure.nextAttemptAt,
    at: Date.now(),
  });
}

type RecoveryTrigger = 'startup' | 'alarm' | 'enqueue';

async function recoverPendingSavesLocked(
  trigger: RecoveryTrigger = 'alarm',
  onlyJobId?: string,
): Promise<void> {
  const jobs = await readJobs();
  const now = Date.now();
  // Lenient read: adoption below is an optimization, so a transient auth
  // failure must not fail recovery — it simply skips adoption this pass.
  const currentAuthority = await getAuthAuthority();
  const recovered = jobs
    .filter(job => !isTerminalExpired(job, now))
    .map(job => {
      if (
        job.state === 'processing'
        && (trigger === 'startup' || now - (job.processingStartedAt ?? job.createdAt) >= PROCESSING_STALE_TIMEOUT_MS)
      ) {
        return {
          ...job,
          state: 'pending' as const,
          processingStartedAt: undefined,
          processingToken: undefined,
          nextAttemptAt: Math.max(job.nextAttemptAt, now),
        };
      }
      // Same-account adoption: a new session of the owning account resumes its
      // paused saves — sign-out/re-auth must never orphan durable work.
      if (job.state === 'paused' && job.owner && sameAccountAuthority(currentAuthority, job.owner)) {
        return {
          ...job,
          state: 'pending' as const,
          pausedAt: undefined,
          lastError: undefined,
          nextAttemptAt: Math.max(job.nextAttemptAt, now),
        };
      }
      return job;
    });

  if (JSON.stringify(recovered) !== JSON.stringify(jobs)) {
    await writeJobs(recovered);
  }

  // Re-arm future-dated pending work before attempting any recovery. This
  // makes the durable alarm boundary survive a worker restart even when every
  // eligible job is still in backoff.
  await scheduleContextMenuSaveQueueWakeup();

  const eligible = recovered.filter(job => (
    job.state === 'pending' && (!onlyJobId || job.id === onlyJobId)
  ));
  const sweep: PauseSweep = { pauseNotified: false };
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < eligible.length) {
      const index = nextIndex;
      nextIndex += 1;
      await recoveryAdmission.run(() => processJob(eligible[index], sweep));
    }
  };
  const firstWorker = worker();
  const secondWorker = worker();
  await firstWorker;
  await secondWorker;
  await scheduleContextMenuSaveQueueWakeup();
}

export function setupContextMenuSaveQueue(): void {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name !== CONTEXT_MENU_SAVE_ALARM_NAME) {
      return;
    }
    return recoverPendingContextMenuSaves().catch(error => {
      console.error('[Background][ContextMenu] Alarm recovery failed', error);
    });
  });
}

interface QueueAdmission {
  admitted: boolean;
  jobs: ContextMenuSaveJob[];
  evictedCount: number;
}

/**
 * Deterministic privacy-safe eviction order for capacity reclaim: only
 * NON-ACTIVE jobs owned by a DIFFERENT account are candidates — terminal
 * (failed/paused) before pending, oldest first, id as the final tiebreak.
 * Actively processing jobs stay fenced and current-owner jobs are never
 * evicted (the signed-in owner manages those via the popup). Evicted jobs are
 * deleted outright — never uploaded, and their filenames/URLs never surface.
 */
function evictionCandidateIndex(jobs: ContextMenuSaveJob[], owner: AuthAuthority): number {
  let best: { index: number; stateRank: number; createdAt: number; id: string } | undefined;
  jobs.forEach((job, index) => {
    if (job.state === 'processing' || sameAccountAuthority(job.owner ?? null, owner)) {
      return;
    }
    const candidate = {
      index,
      stateRank: job.state === 'failed' || job.state === 'paused' ? 0 : 1,
      createdAt: job.createdAt,
      id: job.id,
    };
    if (
      !best
      || candidate.stateRank < best.stateRank
      || (candidate.stateRank === best.stateRank && candidate.createdAt < best.createdAt)
      || (candidate.stateRank === best.stateRank && candidate.createdAt === best.createdAt && candidate.id < best.id)
    ) {
      best = candidate;
    }
  });
  return best?.index ?? -1;
}

/**
 * Make room for a new save without ever weakening the hard job/byte bounds:
 * drop terminal jobs past retention, then evict non-active foreign-owner jobs
 * in the deterministic order above. If capacity is still held by the current
 * owner's or actively processing work, admission fails closed (queue-full).
 */
function reclaimQueueCapacity(
  jobs: ContextMenuSaveJob[],
  owner: AuthAuthority,
  incomingSourceBytes: number,
  now: number,
): QueueAdmission {
  const retained = jobs.filter(job => !isTerminalExpired(job, now));
  let evictedCount = jobs.length - retained.length;
  const overCapacity = () => (
    retained.length >= MAX_CONTEXT_MENU_SAVE_QUEUE_SIZE
    || retainedSourceBytes(retained) + incomingSourceBytes > MAX_CONTEXT_MENU_SAVE_STORAGE_BYTES
  );
  while (overCapacity()) {
    const candidateIndex = evictionCandidateIndex(retained, owner);
    if (candidateIndex < 0) {
      return { admitted: false, jobs, evictedCount: 0 };
    }
    retained.splice(candidateIndex, 1);
    evictedCount += 1;
  }
  return { admitted: true, jobs: retained, evictedCount };
}

/** Persist captured bytes and owner in one authoritative storage transition. */
export function enqueueCapturedSave(blob: Blob, filename: string, imageUrl = 'captured://visible-tab'): Promise<void> {
  return withDeadline(() => blobToStoredSource(blob), 'Image preparation timed out; save was not queued.')
    .then(retained => exclusively(async () => {
      // Throwing read: a transient auth failure surfaces as its own error
      // instead of masquerading as "signed out".
      const owner = await withDeadline(
        signal => readAuthAuthority(signal),
        'Auth check timed out; save was not queued.',
      );
      if (!owner) {
        throw new ContextMenuSaveQueueError('Sign in to Sploot before saving this image.', 'owner-unavailable');
      }

      const jobs = await readJobs();
      const now = Date.now();
      const admission = reclaimQueueCapacity(jobs, owner, retained.sourceBytes.length, now);
      if (!admission.admitted) {
        throw new ContextMenuSaveQueueError(
          'Save queue is full. Open the extension popup to retry or discard a failed save, then try again.',
          'queue-full',
        );
      }
      if (admission.evictedCount > 0) {
        // Count only: evicted jobs belong to other accounts and their
        // filenames/URLs must not leak into this profile's logs.
        console.log(`[Background][ContextMenu] Reclaimed ${admission.evictedCount} expired or inactive retained save(s) to admit a new save`);
      }

      const job: ContextMenuSaveJob = {
        id: crypto.randomUUID(),
        imageUrl,
        filename,
        owner,
        ...retained,
        state: 'pending',
        createdAt: now,
        attempts: 0,
        nextAttemptAt: now,
      };
      await writeJobs([...admission.jobs, job]);
      setQueuedStatus(filename);
      return job.id;
    }))
    .then(async jobId => {
      // Start recovery before acknowledging the durable write. The attempt
      // remains detached and bounded, but is scoped to this exact durable job;
      // a late event cannot process a later job after a worker boundary.
      const recovery = startRecovery('enqueue', jobId);
      void recovery.completed.catch(error => {
        console.error('[Background][ContextMenu] Enqueued save recovery failed', error);
      });
      await recovery.started;
    });
}

/** Fetch once with a deadline, then enqueue immutable bytes; retries never refetch. */
export function enqueueContextMenuSave(imageUrl: string, filename: string): Promise<void> {
  return fetchAdmission.run(() => withDeadline(
    signal => fetchImage(imageUrl, signal),
    'Image fetch timed out; retry scheduled without blocking other saves.',
  )).then(blob => enqueueCapturedSave(blob, filename, imageUrl));
}

export function recoverPendingContextMenuSaves(trigger: RecoveryTrigger = 'alarm', onlyJobId?: string): Promise<void> {
  return startRecovery(trigger, onlyJobId).completed;
}

export function listContextMenuSaves(): Promise<ContextMenuSaveJob[]> {
  return readJobs();
}

export function listContextMenuSavesForOwner(owner: AuthAuthority | null): Promise<ContextMenuSaveJob[]> {
  if (!owner) return Promise.resolve([]);
  return readJobs().then(jobs => jobs.filter(job => sameAccountAuthority(job.owner ?? null, owner)));
}

export function listFailedContextMenuSaves(): Promise<ContextMenuSaveJob[]> {
  return readJobs().then(jobs => jobs.filter(job => job.state === 'failed' || job.state === 'paused'));
}

export function listFailedContextMenuSavesForOwner(owner: AuthAuthority | null): Promise<ContextMenuSaveJob[]> {
  if (!owner) return Promise.resolve([]);
  return readJobs().then(jobs => jobs.filter(job => (
    (job.state === 'failed' || job.state === 'paused')
    && sameAccountAuthority(job.owner ?? null, owner)
  )));
}

export function retryContextMenuSave(jobId: string, expectedOwner?: AuthAuthority | null): Promise<boolean> {
  return exclusively(async () => {
    const jobs = await readJobs();
    const failed = jobs.find(job => (job.state === 'failed' || job.state === 'paused') && job.id === jobId);
    if (!failed || !failed.owner || !failed.sourceBytes || !failed.sourceType) {
      return false;
    }

    const owner = expectedOwner === undefined ? await getAuthAuthority() : expectedOwner;
    if (!sameAccountAuthority(owner, failed.owner)) {
      return false;
    }

    const now = Date.now();
    const retryable: ContextMenuSaveJob = {
      ...failed,
      createdAt: now,
      state: 'pending',
      attempts: 0,
      nextAttemptAt: now,
      processingStartedAt: undefined,
      processingToken: undefined,
      processingSettling: undefined,
      failedAt: undefined,
      lastError: undefined,
    };
    await writeJobs(jobs.map(job => job.id === jobId ? retryable : job));
    setQueuedStatus(retryable.filename);
    return true;
  });
}

export function discardContextMenuSave(jobId: string, expectedOwner?: AuthAuthority | null): Promise<boolean> {
  return exclusively(async () => {
    const jobs = await readJobs();
    const owner = expectedOwner === undefined ? await getAuthAuthority() : expectedOwner;
    if (!owner || !jobs.some(job => (
      (job.state === 'failed' || job.state === 'paused')
      && job.id === jobId
      && sameAccountAuthority(job.owner ?? null, owner)
    ))) {
      return false;
    }
    await writeJobs(jobs.filter(job => job.id !== jobId));
    return true;
  });
}
