import { fetchImage } from './image-fetcher';
import { showErrorNotification } from './notifications';
import { saveToSploot } from './save-flow';

export const CONTEXT_MENU_QUEUE_KEY = 'sploot:context-menu-queue';
export const MAX_CONTEXT_MENU_SAVE_QUEUE_SIZE = 50;
export const MAX_CONTEXT_MENU_SAVE_ATTEMPTS = 5;
export const MAX_CONTEXT_MENU_SAVE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const PROCESSING_STALE_TIMEOUT_MS = 5 * 60 * 1000;
export const RETRY_BACKOFF_BASE_MS = 30 * 1000;
export const RETRY_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;

export type ContextMenuSaveJobState = 'pending' | 'processing' | 'failed';

export interface ContextMenuSaveJob {
  id: string;
  imageUrl: string;
  filename: string;
  state: ContextMenuSaveJobState;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  processingStartedAt?: number;
  lastError?: string;
  failedAt?: number;
}

export class ContextMenuSaveQueueError extends Error {
  constructor(
    message: string,
    public readonly code: 'queue-full',
  ) {
    super(message);
    this.name = 'ContextMenuSaveQueueError';
  }
}

let queueOperations = Promise.resolve();

function exclusively<T>(operation: () => Promise<T>): Promise<T> {
  const next = queueOperations.then(operation, operation);
  queueOperations = next.then(() => undefined, () => undefined);
  return next;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
    || (candidate.state !== 'pending' && candidate.state !== 'processing' && candidate.state !== 'failed')
    || typeof candidate.createdAt !== 'number'
    || !Number.isFinite(candidate.createdAt)
  ) {
    return null;
  }

  const attempts = Math.max(0, Math.floor(finiteNumber(candidate.attempts, 0)));
  const normalized: ContextMenuSaveJob = {
    id: candidate.id,
    imageUrl: candidate.imageUrl,
    filename: candidate.filename,
    state: candidate.state,
    createdAt: candidate.createdAt,
    attempts,
    nextAttemptAt: finiteNumber(candidate.nextAttemptAt, candidate.createdAt),
  };

  if (typeof candidate.processingStartedAt === 'number' && Number.isFinite(candidate.processingStartedAt)) {
    normalized.processingStartedAt = candidate.processingStartedAt;
  }
  if (typeof candidate.lastError === 'string') {
    normalized.lastError = candidate.lastError;
  }
  if (typeof candidate.failedAt === 'number' && Number.isFinite(candidate.failedAt)) {
    normalized.failedAt = candidate.failedAt;
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

async function writeJobs(jobs: ContextMenuSaveJob[]): Promise<void> {
  await chrome.storage.local.set({ [CONTEXT_MENU_QUEUE_KEY]: jobs });
}

function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(RETRY_BACKOFF_MAX_MS, RETRY_BACKOFF_BASE_MS * (2 ** exponent));
}

function isTooOld(job: ContextMenuSaveJob, now: number): boolean {
  return now - job.createdAt >= MAX_CONTEXT_MENU_SAVE_AGE_MS;
}

function terminalFailure(
  job: ContextMenuSaveJob,
  now: number,
  error: string,
): ContextMenuSaveJob {
  return {
    ...job,
    state: 'failed',
    nextAttemptAt: 0,
    processingStartedAt: undefined,
    lastError: error,
    failedAt: now,
  };
}

function notifyTerminalFailure(job: ContextMenuSaveJob): void {
  showErrorNotification({
    message: `${job.lastError ?? 'Could not save this image.'} Save is retained. Open the extension popup to Retry or discard it.`,
  });
}

async function terminalizeIfNeeded(
  jobs: ContextMenuSaveJob[],
  job: ContextMenuSaveJob,
  now: number,
): Promise<{ jobs: ContextMenuSaveJob[]; job: ContextMenuSaveJob; terminalized: boolean }> {
  if (job.state === 'failed') {
    return { jobs, job, terminalized: false };
  }

  if (job.attempts < MAX_CONTEXT_MENU_SAVE_ATTEMPTS && !isTooOld(job, now)) {
    return { jobs, job, terminalized: false };
  }

  const terminal = terminalFailure(
    job,
    now,
    job.lastError ?? (isTooOld(job, now) ? 'Save expired before it could complete.' : 'Save reached its retry limit.'),
  );
  const nextJobs = jobs.map(candidate => candidate.id === job.id ? terminal : candidate);
  await writeJobs(nextJobs);
  return { jobs: nextJobs, job: terminal, terminalized: true };
}

async function processJob(job: ContextMenuSaveJob): Promise<void> {
  const jobs = await readJobs();
  const current = jobs.find(candidate => candidate.id === job.id);
  if (!current || current.state !== 'pending' || current.nextAttemptAt > Date.now()) {
    return;
  }

  const now = Date.now();
  const terminalized = await terminalizeIfNeeded(jobs, current, now);
  if (terminalized.terminalized) {
    notifyTerminalFailure(terminalized.job);
    return;
  }

  const processing: ContextMenuSaveJob = {
    ...current,
    state: 'processing',
    attempts: current.attempts + 1,
    processingStartedAt: now,
  };
  await writeJobs(jobs.map(candidate => candidate.id === current.id ? processing : candidate));

  let outcome: Awaited<ReturnType<typeof saveToSploot>>;
  try {
    outcome = await saveToSploot(
      async () => ({
        blob: await fetchImage(current.imageUrl),
        filename: current.filename,
      }),
      'image',
    );
  } catch (error) {
    outcome = {
      ok: false,
      error: error instanceof Error ? error : new Error('Could not save this image.'),
    };
  }

  const remaining = await readJobs();
  if (outcome.ok) {
    // The API's checksum uniqueness turns a post-upload worker crash into a
    // harmless duplicate response when this durable job is replayed.
    await writeJobs(remaining.filter(candidate => candidate.id !== current.id));
    return;
  }

  const failed = remaining.find(candidate => candidate.id === current.id);
  if (!failed) {
    return;
  }

  const failure = {
    ...failed,
    state: 'pending' as const,
    processingStartedAt: undefined,
    lastError: outcome.error.message,
    nextAttemptAt: Date.now() + retryDelayMs(processing.attempts),
  };
  const afterFailure = remaining.map(candidate => candidate.id === current.id ? failure : candidate);
  const terminal = await terminalizeIfNeeded(afterFailure, failure, Date.now());
  if (terminal.terminalized) {
    notifyTerminalFailure(terminal.job);
    return;
  }
  await writeJobs(afterFailure);
}

async function recoverPendingSavesLocked(): Promise<void> {
  const jobs = await readJobs();
  const now = Date.now();
  let changed = false;
  const recovered = jobs.map(job => {
    if (
      job.state === 'processing'
      && now - (job.processingStartedAt ?? job.createdAt) >= PROCESSING_STALE_TIMEOUT_MS
    ) {
      changed = true;
      return {
        ...job,
        state: 'pending' as const,
        processingStartedAt: undefined,
        nextAttemptAt: Math.max(job.nextAttemptAt, now),
      };
    }
    return job;
  });

  if (changed || JSON.stringify(recovered) !== JSON.stringify(jobs)) {
    await writeJobs(recovered);
  }

  for (const job of recovered) {
    await processJob(job);
  }
}

export function enqueueContextMenuSave(imageUrl: string, filename: string): Promise<void> {
  return exclusively(async () => {
    const jobs = await readJobs();
    if (jobs.length >= MAX_CONTEXT_MENU_SAVE_QUEUE_SIZE) {
      throw new ContextMenuSaveQueueError(
        'Save queue is full. Open the extension popup to retry or discard a failed save, then try again.',
        'queue-full',
      );
    }

    const now = Date.now();
    const job: ContextMenuSaveJob = {
      id: crypto.randomUUID(),
      imageUrl,
      filename,
      state: 'pending',
      createdAt: now,
      attempts: 0,
      nextAttemptAt: now,
    };
    await writeJobs([...jobs, job]);
    await processJob(job);
  });
}

export function recoverPendingContextMenuSaves(): Promise<void> {
  return exclusively(recoverPendingSavesLocked);
}

export function listFailedContextMenuSaves(): Promise<ContextMenuSaveJob[]> {
  return exclusively(async () => (await readJobs()).filter(job => job.state === 'failed'));
}

export function retryContextMenuSave(jobId: string): Promise<boolean> {
  return exclusively(async () => {
    const jobs = await readJobs();
    const failed = jobs.find(job => job.id === jobId && job.state === 'failed');
    if (!failed) {
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
      failedAt: undefined,
      lastError: undefined,
    };
    await writeJobs(jobs.map(job => job.id === jobId ? retryable : job));
    await processJob(retryable);
    return true;
  });
}

export function discardContextMenuSave(jobId: string): Promise<boolean> {
  return exclusively(async () => {
    const jobs = await readJobs();
    if (!jobs.some(job => job.id === jobId && job.state === 'failed')) {
      return false;
    }
    await writeJobs(jobs.filter(job => job.id !== jobId));
    return true;
  });
}
