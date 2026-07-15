export const CONTEXT_MENU_SAVE_MESSAGES = {
  LIST_QUEUE: 'sploot:context-menu-save:list-queue',
  LIST_FAILED: 'sploot:context-menu-save:list-failed',
  RETRY: 'sploot:context-menu-save:retry',
  DISCARD: 'sploot:context-menu-save:discard',
} as const;

export type ContextMenuSaveJobState = 'pending' | 'processing' | 'failed' | 'paused';

export interface ContextMenuSaveJobSummary {
  id: string;
  filename: string;
  createdAt: number;
  attempts: number;
  state: ContextMenuSaveJobState;
  nextAttemptAt: number;
  lastError?: string;
}

export type QueueErrorCode = 'storage-unavailable' | 'invalid-request' | 'not-found' | 'message-failed' | 'queue-error';

export type QueueListResponse =
  | { ok: true; jobs: ContextMenuSaveJobSummary[] }
  | { ok: false; code: QueueErrorCode; error: string };

export type QueueActionResponse =
  | { ok: true; action: 'retry-queued' | 'discarded' }
  | { ok: false; code: QueueErrorCode; error: string };

export type FailedContextMenuSavesResponse = QueueListResponse;

export interface FailedContextMenuSave extends ContextMenuSaveJobSummary {
  state: 'failed';
}
