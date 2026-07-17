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
  __internal_reloadInitialResources(): Promise<void>
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
 * to rehydrate resources so session tokens never cross the runtime message boundary
 * and the MV3 service worker never needs a window API.
 */
export function installPopupAuthSync(
  clerk: ClerkRefreshClient,
  runtime: AuthSyncRuntime = chrome.runtime,
): () => void {
  let disposed = false

  let lastRefreshKey: string | undefined
  let pendingState: AuthState | undefined
  let refreshInFlight: Promise<void> | undefined

  const refreshKey = (state: AuthState) => (
    state.status + ':' + (state.sessionId ?? state.userId ?? 'none')
  )

  const drainRefresh = () => {
    if (disposed || refreshInFlight) {
      return
    }

    const state = pendingState
    pendingState = undefined
    if (!state) {
      return
    }

    // A signed-out popup is already in the correct Clerk state. Do not turn the
    // initial REQUEST_STATE response into a refresh loop.
    if (state.status === 'signed-out' && !clerk.user) {
      return
    }

    // Coalesce bursts while Clerk rehydrates, but always process the latest
    // state after the current operation settles. This preserves sign-out and
    // account-switch transitions instead of dropping them at the in-flight
    // boundary.
    const key = refreshKey(state)
    if (lastRefreshKey === key) {
      return
    }
    lastRefreshKey = key

    refreshInFlight = Promise.resolve()
      .then(() => {
        if (state.status === 'signed-in' && clerk.user) {
          return clerk.user.reload().then(() => undefined)
        }
        // The background state is metadata only; a popup never crosses the
        // token boundary and never reloads its window.
        return clerk.__internal_reloadInitialResources()
      })
      .catch(error => {
        if (lastRefreshKey === key) {
          lastRefreshKey = undefined
        }
        console.error('[Popup] Failed to refresh auth state', error)
      })
      .finally(() => {
        refreshInFlight = undefined
        drainRefresh()
      })
  }

  const refresh = (state: AuthState) => {
    if (disposed) {
      return
    }
    pendingState = state
    drainRefresh()
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
