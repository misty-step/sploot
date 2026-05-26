export const UPLOAD_PROGRESS_UPDATE_THRESHOLD = 10;
export const UPLOAD_PROGRESS_UPDATE_INTERVAL_MS = 500;
export const UPLOAD_PROGRESS_UI_CAP = 90;

export interface UploadProgressThrottleInput {
  now: number;
  progressPercent: number;
  lastUpdateAt: number;
  lastProgressPercent: number;
  threshold?: number;
  intervalMs?: number;
  completionPercent?: number;
}

export function shouldEmitUploadProgressUpdate({
  now,
  progressPercent,
  lastUpdateAt,
  lastProgressPercent,
  threshold = UPLOAD_PROGRESS_UPDATE_THRESHOLD,
  intervalMs = UPLOAD_PROGRESS_UPDATE_INTERVAL_MS,
  completionPercent = UPLOAD_PROGRESS_UI_CAP,
}: UploadProgressThrottleInput): boolean {
  const percentDiff = Math.abs(progressPercent - lastProgressPercent);
  const timeDiff = now - lastUpdateAt;

  return (
    percentDiff >= threshold ||
    timeDiff >= intervalMs ||
    progressPercent >= completionPercent
  );
}
