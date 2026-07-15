import {
  CONTEXT_MENU_SAVE_MESSAGES,
  type QueueActionResponse,
  type QueueListResponse,
  type ContextMenuSaveJobSummary,
} from '../../shared/context-menu-save-messages';

export type QueueRequestResult =
  | { ok: true; jobs: ContextMenuSaveJobSummary[] }
  | { ok: false; code: string; error: string };

export type QueueActionResult =
  | { ok: true; action: 'retry-queued' | 'discarded' }
  | { ok: false; code: string; error: string };

function messageError(error: unknown): { ok: false; code: string; error: string } {
  return {
    ok: false,
    code: 'message-failed',
    error: error instanceof Error ? error.message : 'Queue message failed.',
  };
}

export async function requestContextMenuSaveQueue(): Promise<QueueRequestResult> {
  try {
    const response = await chrome.runtime.sendMessage({ type: CONTEXT_MENU_SAVE_MESSAGES.LIST_QUEUE }) as QueueListResponse | undefined;
    if (!response || response.ok !== true || !Array.isArray(response.jobs)) {
      return {
        ok: false,
        code: response && 'code' in response ? response.code : 'queue-error',
        error: response && 'error' in response ? response.error : 'Queue state is unavailable.',
      };
    }
    return response;
  } catch (error) {
    return messageError(error);
  }
}

export async function performContextMenuSaveAction(
  jobId: string,
  type: typeof CONTEXT_MENU_SAVE_MESSAGES.RETRY | typeof CONTEXT_MENU_SAVE_MESSAGES.DISCARD,
): Promise<QueueActionResult> {
  try {
    const response = await chrome.runtime.sendMessage({ type, jobId }) as QueueActionResponse | undefined;
    if (!response || response.ok !== true) {
      return {
        ok: false,
        code: response && 'code' in response ? response.code : 'queue-error',
        error: response && 'error' in response ? response.error : 'Queue action was not acknowledged.',
      };
    }
    return response;
  } catch (error) {
    return messageError(error);
  }
}
