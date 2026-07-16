export const EXPORT_BACKPRESSURE_TIMEOUT_MS = 60_000;
export const EXPORT_BACKPRESSURE_POLL_MS = 5;
/** Maximum bytes accepted from a provider or emitted per stream enqueue. */
export const EXPORT_STREAM_CHUNK_BYTES = 64 * 1024;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForExportCapacity(
  getDesiredSize: () => number | null,
  isCanceled: () => boolean,
  timeoutMs: number = EXPORT_BACKPRESSURE_TIMEOUT_MS,
  onTimeout?: () => void,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!isCanceled()) {
    const desiredSize = getDesiredSize();
    if (desiredSize === null || desiredSize > 0) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      onTimeout?.();
      throw new Error('export stream backpressure timed out');
    }
    await sleep(Math.min(EXPORT_BACKPRESSURE_POLL_MS, remaining));
  }
}
