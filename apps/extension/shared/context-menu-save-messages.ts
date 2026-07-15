export const CONTEXT_MENU_SAVE_MESSAGES = {
  LIST_FAILED: 'sploot:context-menu-save:list-failed',
  RETRY: 'sploot:context-menu-save:retry',
  DISCARD: 'sploot:context-menu-save:discard',
} as const;

export interface FailedContextMenuSave {
  id: string;
  filename: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

export interface FailedContextMenuSavesResponse {
  jobs: FailedContextMenuSave[];
}

export interface ContextMenuSaveActionResponse {
  ok: boolean;
}
