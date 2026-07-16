import { AUTH_MESSAGES, type AuthState } from './auth-messages'

interface RuntimeMessageSender {
  id?: string
}

interface AuthSyncRuntime {
  id: string
  onMessage: {
    addListener(listener: (message: unknown, sender: RuntimeMessageSender) => void): void
    removeListener(listener: (message: unknown, sender: RuntimeMessageSender) => void): void
  }
  sendMessage(message: unknown): Promise<unknown>
}

interface ClerkRefreshClient {
  user?: { reload(): Promise<unknown> } | null
}

interface ReloadGuardStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const memoryReloadGuard = new Map<string, string>()

function getReloadGuardStorage(): ReloadGuardStorage {
  try {
    return window.sessionStorage
  } catch {
    return {
      getItem: key => memoryReloadGuard.get(key) ?? null,
      setItem: (key, value) => { memoryReloadGuard.set(key, value) },
    }
  }
}

function isAuthState(value: unknown): value is AuthState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const state = value as Partial<AuthState>
  return state.status === 'unknown' || state.status === 'signed-in' || state.status === 'signed-out'
}

function shouldRefresh(value: unknown): value is AuthState {
  return isAuthState(value) && value.status !== 'unknown'
}

/**
 * Connect the popup's Clerk provider to the background auth authority.
 *
 * The message carries state metadata only. The popup asks its own Clerk client
 * to reload so session tokens never cross the runtime message boundary.
 */
export function installPopupAuthSync(
  clerk: ClerkRefreshClient,
  runtime: AuthSyncRuntime = chrome.runtime,
  reloadPopup: () => void = () => window.location.reload(),
  reloadGuardStorage: ReloadGuardStorage | null = getReloadGuardStorage(),
): () => void {
  let disposed = false

  const refresh = (state: AuthState) => {
    if (disposed) {
      return
    }

    // A signed-out popup is already in the correct Clerk state. Reload only
    // when transitioning an existing signed-in popup, otherwise the initial
    // signed-out REQUEST_STATE response would reload the popup forever.
    if (state.status === 'signed-out' && !clerk.user) {
      return
    }

    if (state.status === 'signed-in' && clerk.user) {
      void clerk.user.reload().catch(error => {
        console.error('[Popup] Failed to refresh auth state', error)
      })
      return
    }


    // A reload is only a bootstrap fallback while Clerk hydrates from the
    // synced web session. Persist the guard so a remount cannot reload forever.
    if (!reloadGuardStorage) {
      return
    }
    const reloadKey = `sploot-auth-refresh:${state.status}:${state.sessionId ?? state.userId ?? 'none'}`
    try {
      if (reloadGuardStorage.getItem(reloadKey)) {
        return
      }
    } catch {
      if (memoryReloadGuard.get(reloadKey)) {
        return
      }
    }
    try {
      reloadGuardStorage.setItem(reloadKey, '1')
    } catch {
      if (memoryReloadGuard.get(reloadKey)) {
        return
      }
      memoryReloadGuard.set(reloadKey, '1')
    }
    void Promise.resolve().then(reloadPopup).catch(error => {
      console.error('[Popup] Failed to reload auth state', error)
    })
  }

  const onMessage = (message: unknown, sender: RuntimeMessageSender) => {
    if (sender.id !== runtime.id || !message || typeof message !== 'object') {
      return
    }

    const candidate = message as { type?: unknown; payload?: unknown }
    if (candidate.type === AUTH_MESSAGES.STATE_CHANGED && shouldRefresh(candidate.payload)) {
      refresh(candidate.payload)
    }
  }

  runtime.onMessage.addListener(onMessage)
  void runtime
    .sendMessage({ type: AUTH_MESSAGES.REQUEST_STATE })
    .then(response => {
      if (disposed || !response || typeof response !== 'object') {
        return
      }

      const state = (response as { state?: unknown }).state
      if (shouldRefresh(state)) {
        refresh(state)
      }
    })
    .catch(error => {
      if (!disposed) {
        console.error('[Popup] Failed to request auth state', error)
      }
    })

  return () => {
    if (disposed) {
      return
    }
    disposed = true
    runtime.onMessage.removeListener(onMessage)
  }
}
