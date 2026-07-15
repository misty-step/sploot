import { fetchImage } from './image-fetcher';
import { saveToSploot } from './save-flow';

export const CONTEXT_MENU_QUEUE_KEY = 'sploot:context-menu-queue';

interface ContextMenuSaveJob {
  id: string;
  imageUrl: string;
  filename: string;
  state: 'pending' | 'processing';
  createdAt: number;
  lastError?: string;
}

let queueOperations = Promise.resolve();

function exclusively<T>(operation: () => Promise<T>): Promise<T> {
  const next = queueOperations.then(operation, operation);
  queueOperations = next.then(() => undefined, () => undefined);
  return next;
}

async function readJobs(): Promise<ContextMenuSaveJob[]> {
  const stored = await chrome.storage.local.get(CONTEXT_MENU_QUEUE_KEY);
  const jobs = stored[CONTEXT_MENU_QUEUE_KEY];
  if (!Array.isArray(jobs)) {
    return [];
  }

  return jobs.filter((job): job is ContextMenuSaveJob => (
    Boolean(job)
    && typeof job.id === 'string'
    && typeof job.imageUrl === 'string'
    && typeof job.filename === 'string'
    && (job.state === 'pending' || job.state === 'processing')
    && typeof job.createdAt === 'number'
  ));
}

async function writeJobs(jobs: ContextMenuSaveJob[]): Promise<void> {
  await chrome.storage.local.set({ [CONTEXT_MENU_QUEUE_KEY]: jobs });
}

async function processJob(job: ContextMenuSaveJob): Promise<void> {
  const jobs = await readJobs();
  if (!jobs.some(candidate => candidate.id === job.id)) {
    return;
  }

  await writeJobs(jobs.map(candidate => (
    candidate.id === job.id ? { ...candidate, state: 'processing' as const } : candidate
  )));

  const outcome = await saveToSploot(
    async () => ({
      blob: await fetchImage(job.imageUrl),
      filename: job.filename,
    }),
    'image',
  );

  const remaining = await readJobs();
  if (outcome.ok) {
    // The API's checksum uniqueness turns a post-upload worker crash into a
    // harmless duplicate response when this durable job is replayed.
    await writeJobs(remaining.filter(candidate => candidate.id !== job.id));
    return;
  }

  await writeJobs(remaining.map(candidate => (
    candidate.id === job.id
      ? { ...candidate, state: 'pending' as const, lastError: outcome.error.message }
      : candidate
  )));
}

async function recoverPendingSavesLocked(): Promise<void> {
  const jobs = await readJobs();
  const pendingJobs = jobs.map(job => (
    job.state === 'processing' ? { ...job, state: 'pending' as const } : job
  ));

  if (pendingJobs.some((job, index) => job.state !== jobs[index]?.state)) {
    await writeJobs(pendingJobs);
  }

  for (const job of pendingJobs) {
    await processJob(job);
  }
}

export function enqueueContextMenuSave(imageUrl: string, filename: string): Promise<void> {
  return exclusively(async () => {
    const jobs = await readJobs();
    const job: ContextMenuSaveJob = {
      id: crypto.randomUUID(),
      imageUrl,
      filename,
      state: 'pending',
      createdAt: Date.now(),
    };
    await writeJobs([...jobs, job]);
    await processJob(job);
  });
}

export function recoverPendingContextMenuSaves(): Promise<void> {
  return exclusively(recoverPendingSavesLocked);
}
