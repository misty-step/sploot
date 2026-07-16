import { IS_DEV_BUILD } from './build-mode';
import { E2E_AUTH_MODE } from './env';

export const UPDATE_STATUS_STORAGE_KEY = 'sploot:update-status';
export const UPDATE_MESSAGES = {
  TEST_SET_AVAILABLE: 'sploot:update-status:test-set-available',
  TEST_SET_INSTALLED: 'sploot:update-status:test-set-installed',
} as const;

const UPDATE_CHECK_TIMEOUT_MS = 3_000;
const TEST_INSTALLED_VERSION_KEY = 'sploot:update-status:test-installed-version';

type UpdateCheckResult = { status?: 'update_available' | 'no_update' | 'throttled'; version?: string };
type StoredUpdateStatus = { availableVersion: string; dismissedVersion: string | null };
export type UpdateNotice = { version: string; dismissed: boolean };

let setupComplete = false;
let startupCheckStarted = false;
let statusWriteQueue = Promise.resolve();

function normalizeVersion(version: unknown): string | null {
  if (typeof version !== 'string') return null;
  const trimmed = version.trim();
  if (!/^\d+(?:\.\d+){0,3}$/.test(trimmed)) return null;
  const components = trimmed.split('.').map(Number);
  if (components.some(component => !Number.isSafeInteger(component) || component > 65_535)) return null;
  return components.join('.');
}

export function isNewerVersion(candidate: string, installed: string): boolean {
  const next = normalizeVersion(candidate);
  const current = normalizeVersion(installed);
  if (!next || !current) return false;
  const nextParts = next.split('.').map(Number);
  const currentParts = current.split('.').map(Number);
  for (let index = 0; index < Math.max(nextParts.length, currentParts.length); index += 1) {
    const difference = (nextParts[index] ?? 0) - (currentParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

async function installedVersion(): Promise<string | null> {
  if (IS_DEV_BUILD || E2E_AUTH_MODE) {
    try {
      const stored = await chrome.storage.local.get(TEST_INSTALLED_VERSION_KEY);
      const testVersion = normalizeVersion(stored[TEST_INSTALLED_VERSION_KEY]);
      if (testVersion) return testVersion;
    } catch {
      // Fall through to the manifest when the development-only seam is absent.
    }
  }
  try {
    return normalizeVersion(chrome.runtime.getManifest().version);
  } catch {
    return null;
  }
}

async function readStoredStatus(): Promise<StoredUpdateStatus | null> {
  try {
    const stored = await chrome.storage.local.get(UPDATE_STATUS_STORAGE_KEY);
    const value = stored[UPDATE_STATUS_STORAGE_KEY];
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<StoredUpdateStatus>;
    const availableVersion = normalizeVersion(candidate.availableVersion);
    const dismissedVersion = candidate.dismissedVersion === null
      ? null
      : normalizeVersion(candidate.dismissedVersion);
    return availableVersion ? { availableVersion, dismissedVersion } : null;
  } catch {
    return null;
  }
}

async function writeStoredStatus(status: StoredUpdateStatus | null): Promise<void> {
  try {
    if (status) {
      await chrome.storage.local.set({ [UPDATE_STATUS_STORAGE_KEY]: status });
    } else if (typeof chrome.storage.local.remove === 'function') {
      await chrome.storage.local.remove(UPDATE_STATUS_STORAGE_KEY);
    } else {
      await chrome.storage.local.set({ [UPDATE_STATUS_STORAGE_KEY]: null });
    }
  } catch {
    // Update awareness is deliberately best-effort and must not affect capture.
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('update check timed out')), timeoutMs);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

function serializeStatusWrite<T>(operation: () => Promise<T>): Promise<T> {
  const run = statusWriteQueue.then(operation, operation);
  statusWriteQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function applyAvailableVersion(version: unknown): Promise<boolean> {
  return serializeStatusWrite(() => applyAvailableVersionUnsafe(version));
}

async function applyAvailableVersionUnsafe(version: unknown): Promise<boolean> {
  const normalized = normalizeVersion(version);
  const current = await installedVersion();
  if (!normalized || !current || !isNewerVersion(normalized, current)) return false;
  const existing = await readStoredStatus();
  if (existing && isNewerVersion(existing.availableVersion, normalized)) return false;
  await writeStoredStatus({
    availableVersion: normalized,
    dismissedVersion: existing?.dismissedVersion === normalized ? normalized : null,
  });
  return true;
}

async function clearIfNoUpdate(): Promise<void> {
  await serializeStatusWrite(() => writeStoredStatus(null));
}

async function getUpdateNoticeUnsafe(): Promise<UpdateNotice | null> {
  const existing = await readStoredStatus();
  const current = await installedVersion();
  if (!existing || !current || !isNewerVersion(existing.availableVersion, current)) {
    if (existing) await writeStoredStatus(null);
    return null;
  }
  return {
    version: existing.availableVersion,
    dismissed: existing.dismissedVersion === existing.availableVersion,
  };
}

async function dismissUpdateUnsafe(version: string): Promise<void> {
  const normalized = normalizeVersion(version);
  if (!normalized) return;
  const current = await getUpdateNoticeUnsafe();
  if (!current || current.version !== normalized) return;
  await writeStoredStatus({ availableVersion: normalized, dismissedVersion: normalized });
}

export async function getUpdateNotice(): Promise<UpdateNotice | null> {
  return serializeStatusWrite(getUpdateNoticeUnsafe);
}

export async function dismissUpdate(version: string): Promise<void> {
  await serializeStatusWrite(() => dismissUpdateUnsafe(version));
}

export function onUpdateStatusChanged(callback: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'local' && UPDATE_STATUS_STORAGE_KEY in changes) callback();
  };
  try {
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  } catch {
    return () => undefined;
  }
}

export async function openUpdatePage(): Promise<boolean> {
  try {
    await chrome.tabs.create({ url: 'chrome://extensions' });
    return true;
  } catch {
    return false;
  }
}

export function checkForUpdates(): void {
  if (startupCheckStarted) return;
  startupCheckStarted = true;
  try {
    const request = chrome.runtime.requestUpdateCheck();
    void withTimeout(Promise.resolve(request), UPDATE_CHECK_TIMEOUT_MS)
      .then(async result => {
        const checked = result as UpdateCheckResult;
        if (checked.status === 'update_available') await applyAvailableVersion(checked.version);
        else if (checked.status === 'no_update') await clearIfNoUpdate();
      })
      .catch(() => undefined);
  } catch {
    // Offline, unsupported, throttled, or rejected checks are intentionally silent.
  }
}

export function setupUpdateStatus(): void {
  if (setupComplete) return;
  setupComplete = true;
  try {
    chrome.runtime.onUpdateAvailable?.addListener(event => {
      void applyAvailableVersion(event?.version).catch(() => undefined);
    });
  } catch {
    // Listener setup must never stop normal MV3 startup.
  }
  checkForUpdates();
}

/** Development-only browser QA seam. Production has no caller for this method. */
export async function setUpdateAvailableForTesting(version: string): Promise<boolean> {
  return applyAvailableVersion(version);
}

/** Development-only browser QA seam for simulating an installed update. */
export async function setInstalledVersionForTesting(version: string): Promise<boolean> {
  const normalized = normalizeVersion(version);
  if (!normalized) return false;
  try {
    await chrome.storage.local.set({ [TEST_INSTALLED_VERSION_KEY]: normalized });
    return true;
  } catch {
    return false;
  }
}

/** Test isolation only; never used by the extension runtime. */
export function resetUpdateCheckForTesting(): void {
  startupCheckStarted = false;
  setupComplete = false;
  statusWriteQueue = Promise.resolve();
}
