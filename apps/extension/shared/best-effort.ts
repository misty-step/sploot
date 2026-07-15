/**
 * Run non-essential browser feedback without allowing a missing/closed MV3
 * API surface to reject the service worker event. Chrome APIs can fail either
 * synchronously or through a returned promise, so both paths are contained at
 * this boundary.
 */
export function runBestEffort(label: string, operation: () => unknown): void {
  try {
    void Promise.resolve(operation()).catch(error => {
      console.error(`[BestEffort] ${label} failed`, error);
    });
  } catch (error) {
    console.error(`[BestEffort] ${label} failed`, error);
  }
}
