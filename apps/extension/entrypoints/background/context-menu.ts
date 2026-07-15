/**
 * Context Menu Handler
 *
 * Registers right-click "Save to Sploot" menu item for images.
 * Handles image capture and upload coordination.
 */

import { IS_DEV_BUILD } from '../../shared/build-mode';
import { E2E_AUTH_MODE } from '../../shared/env';
import {
  CONTEXT_MENU_SAVE_MESSAGES,
  type QueueActionResponse,
  type QueueErrorCode,
  type QueueListResponse,
} from '../../shared/context-menu-save-messages';
import { getAuthAuthority, runAuthDiagnostics } from './auth-manager';
import {
  ContextMenuSaveQueueError,
  discardContextMenuSave,
  enqueueContextMenuSave,
  listContextMenuSaves,
  listContextMenuSavesForOwner,
  listFailedContextMenuSavesForOwner,
  recoverPendingContextMenuSaves,
  retryContextMenuSave,
  setupContextMenuSaveQueue,
} from './context-menu-save-queue';
import { showErrorNotification } from './notifications';

const MENU_ID_SAVE = 'save-to-sploot';
const MENU_ID_DIAGNOSTICS = 'sploot-debug-auth';

/**
 * Idempotently create context menus. Safe to call on startup and onInstalled.
 */
export function ensureContextMenus() {
  try {
    chrome.contextMenus.create({
      id: MENU_ID_SAVE,
      title: 'Save to Sploot',
      contexts: ['image'],
    }, () => void chrome.runtime.lastError); // ignore duplicate errors

    if (IS_DEV_BUILD) {
      // Dev-build-only diagnostics; production ships no debug menu items.
      chrome.contextMenus.create({
        id: MENU_ID_DIAGNOSTICS,
        title: 'Sploot Debug: Dump Auth State',
        contexts: ['action'],
      }, () => void chrome.runtime.lastError);
    } else {
      // A previous dev build may have left the item behind in this profile.
      chrome.contextMenus.remove(MENU_ID_DIAGNOSTICS, () => void chrome.runtime.lastError);
    }

    console.log('[ContextMenu] Ensured context menus exist');
  } catch (error) {
    console.error('[ContextMenu] Failed to ensure context menus', error);
  }
}

/**
 * Initialize context menu
 */
export function setupContextMenu() {
  setupContextMenuSaveQueue();

  // Recover jobs that were left in-flight when the MV3 worker was terminated.
  void recoverPendingContextMenuSaves('startup').catch(error => {
    console.error('[Background][ContextMenu] Recovery failed', error);
  });

  // Create context menu on extension install/update
  chrome.runtime.onInstalled.addListener(() => {
    ensureContextMenus();
    void recoverPendingContextMenuSaves('startup').catch(error => {
      console.error('[Background][ContextMenu] Install recovery failed', error);
    });
  });

  chrome.runtime.onStartup.addListener(() => {
    return recoverPendingContextMenuSaves('startup').catch(error => {
      console.error('[Background][ContextMenu] Startup recovery failed', error);
    });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (E2E_AUTH_MODE && message?.type === CONTEXT_MENU_SAVE_MESSAGES.E2E_SAVE) {
      if (typeof message.imageUrl !== 'string' || typeof message.filename !== 'string') {
        sendResponse({ ok: false, error: 'Invalid E2E save request.' });
        return true;
      }
      void handleImageSave(message.imageUrl, { title: message.filename }).then(
        () => sendResponse({ ok: true }),
        error => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Save failed.' }),
      );
      return true;
    }

    const listType = message?.type === CONTEXT_MENU_SAVE_MESSAGES.LIST_QUEUE
      || message?.type === CONTEXT_MENU_SAVE_MESSAGES.LIST_FAILED;
    if (listType) {
      void getAuthAuthority().then(owner => {
        if (message.type === CONTEXT_MENU_SAVE_MESSAGES.LIST_FAILED) {
          return listFailedContextMenuSavesForOwner(owner);
        }
        return listContextMenuSavesForOwner(owner);
      }).then(jobs => {
        sendResponse({ ok: true, jobs: jobs.map(toQueueSummary) } satisfies QueueListResponse);
      }).catch(error => {
        sendResponse(queueErrorResponse(error));
      });
      return true;
    }

    const actionType = message?.type === CONTEXT_MENU_SAVE_MESSAGES.RETRY
      || message?.type === CONTEXT_MENU_SAVE_MESSAGES.DISCARD;
    if (actionType) {
      if (typeof message.jobId !== 'string') {
        sendResponse({ ok: false, code: 'invalid-request', error: 'Queue job id is required.' } satisfies QueueActionResponse);
        return true;
      }

      void getAuthAuthority().then(owner => {
        if (!owner) {
          // Truthful code: without a signed-in account this is an auth gap,
          // not a missing job and not a storage failure.
          sendResponse({
            ok: false,
            code: 'auth-required',
            error: 'Sign in to Sploot to manage retained saves.',
          } satisfies QueueActionResponse);
          return;
        }
        return (message.type === CONTEXT_MENU_SAVE_MESSAGES.RETRY
          ? retryContextMenuSave(message.jobId, owner)
          : discardContextMenuSave(message.jobId, owner)
        ).then(ok => {
          if (!ok) {
            sendResponse({ ok: false, code: 'not-found', error: 'Queue job not found.' } satisfies QueueActionResponse);
            return;
          }
          sendResponse({
            ok: true,
            action: message.type === CONTEXT_MENU_SAVE_MESSAGES.RETRY ? 'retry-queued' : 'discarded',
          } satisfies QueueActionResponse);
        });
      }).catch(error => {
        sendResponse(queueErrorResponse(error));
      });
      return true;
    }

    return false;
  });

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === MENU_ID_SAVE) {
      await handleImageSave(info.srcUrl, tab);
      return;
    }

    if (info.menuItemId === MENU_ID_DIAGNOSTICS && IS_DEV_BUILD) {
      await handleDiagnostics();
    }
  });
}

function toQueueSummary(job: Awaited<ReturnType<typeof listContextMenuSaves>>[number]) {
  return {
    id: job.id,
    filename: job.filename,
    createdAt: job.createdAt,
    attempts: job.attempts,
    state: job.state,
    nextAttemptAt: job.nextAttemptAt,
    ...(job.lastError ? { lastError: job.lastError } : {}),
  };
}

function queueErrorResponse(error: unknown): QueueListResponse | QueueActionResponse {
  const message = error instanceof Error ? error.message : 'Queue operation failed.';
  // Truthful codes: owner problems are auth gaps, never storage failures.
  const code: QueueErrorCode = error instanceof ContextMenuSaveQueueError
    ? (error.code === 'queue-full' ? 'queue-error' : 'auth-required')
    : 'storage-unavailable';
  return { ok: false, code, error: message };
}

/**
 * Handle image save flow
 */
async function handleImageSave(
  imageUrl: string | undefined,
  tab: Pick<chrome.tabs.Tab, 'title'> | undefined,
): Promise<void> {
  if (!imageUrl) {
    showErrorNotification('No image URL found');
    return;
  }

  try {
    await enqueueContextMenuSave(imageUrl, extractFilename(imageUrl, tab?.title));
  } catch (error) {
    console.error('[Background][ContextMenu] Save failed', error);
    showErrorNotification(error instanceof Error ? error.message : 'Could not save to Sploot.');
  }
}

async function handleDiagnostics(): Promise<void> {
  console.log('[ContextMenu] Running manual auth diagnostics');
  try {
    const snapshot = await runAuthDiagnostics();
    console.log('[ContextMenu] Diagnostics snapshot', snapshot);
  } catch (error) {
    console.error('[ContextMenu] Diagnostics failed', error);
    showErrorNotification('Diagnostics failed. Check console.');
  }
}

/**
 * Extract filename from URL or use tab title
 */
function extractFilename(url: string, tabTitle?: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || 'image.jpg';

    // If filename doesn't have extension, infer from URL or default
    if (!filename.includes('.')) {
      return `${filename}.jpg`;
    }

    return filename;
  } catch {
    // Fallback: Use tab title or generic name
    if (tabTitle) {
      const sanitized = tabTitle
        .replace(/[^a-z0-9]/gi, '-')
        .toLowerCase()
        .substring(0, 50);
      return `${sanitized}.jpg`;
    }

    return `image-${Date.now()}.jpg`;
  }
}
