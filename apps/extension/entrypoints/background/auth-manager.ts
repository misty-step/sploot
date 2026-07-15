import { createClerkClient } from '@clerk/chrome-extension/background'
import { AUTH_MESSAGES, type AuthState } from '../../shared/auth-messages'
import {
  assertExtensionConfig,
  CLERK_ENVIRONMENT,
  CLERK_PUBLISHABLE_KEY,
  CLERK_SYNC_HOST,
  E2E_AUTH_MODE,
} from '../../shared/env'
import { getSplootSignInUrl } from '../../shared/app-url'
import { IS_DEV_BUILD } from '../../shared/build-mode'
import { runBestEffort } from '../../shared/best-effort'

const PUBLISHABLE_KEY = CLERK_PUBLISHABLE_KEY
const SIGN_IN_TIMEOUT_MS = 60000
const SIGN_IN_POLL_INTERVAL_MS = 1000
const E2E_AUTH_KEY = 'sploot:e2e-auth-authority'

let cachedState: AuthState = { status: 'unknown' }
const waiters = new Set<(state: AuthState) => void>()

/** The exact Clerk authority that created a durable save job. */
export interface AuthAuthority {
  userId: string
  /** Clerk's account boundary is currently the user; keep it explicit for future organizations. */
  accountId?: string
  sessionId: string
}

function sessionAuthority(session: { id?: string | null; user?: { id?: string | null } | null } | null | undefined): AuthAuthority | null {
  const userId = session?.user?.id
  const sessionId = session?.id
  if (!userId || !sessionId) {
    return null
  }
  return { userId, accountId: userId, sessionId }
}

export function sameAuthAuthority(left: AuthAuthority | null | undefined, right: AuthAuthority | null | undefined): boolean {
  return Boolean(
    left
    && right
    && left.userId === right.userId
    && (left.accountId ?? left.userId) === (right.accountId ?? right.userId)
    && left.sessionId === right.sessionId,
  )
}

function notifyWaiters(state: AuthState) {
  for (const listener of waiters) {
    listener(state)
  }
}

function updateCachedState(next: AuthState) {
  cachedState = next
  console.log('[Auth] State updated', next)
  notifyWaiters(next)
}

async function createFreshClerkClient() {
  assertExtensionConfig()
  return await createClerkClient({
    publishableKey: PUBLISHABLE_KEY,
    syncHost: CLERK_SYNC_HOST,
    __experimental_syncHostListener: true,
  })
}

export async function isAuthenticated(signal?: AbortSignal): Promise<boolean> {
  try {
    if (E2E_AUTH_MODE) {
      return Boolean(await getE2eAuthority(signal));
    }
    const clerk = await withAbort(createFreshClerkClient(), signal)
    const authority = sessionAuthority(clerk.session)
    const hasSession = Boolean(authority)

    console.log('[Auth] isAuthenticated check', {
      hasSession,
      userId: clerk.session?.user?.id,
    })

    if (hasSession) {
      updateCachedState({
        status: 'signed-in',
        userId: authority?.userId,
        sessionId: authority?.sessionId,
        expiresAt: clerk.session?.expireAt?.getTime(),
      })
    }

    return hasSession
  } catch (error) {
    console.error('[Auth] Failed to check authentication', error)
    return false
  }
}

export async function getAuthToken(signal?: AbortSignal): Promise<string | null> {
  try {
    if (E2E_AUTH_MODE) {
      const authority = await getE2eAuthority(signal);
      return authority ? `e2e-token-${authority.userId}-${authority.sessionId}` : null;
    }
    const clerk = await withAbort(createFreshClerkClient(), signal)

    if (!clerk.session) {
      console.warn('[Auth] No session available for token retrieval')
      return null
    }

    const token = await withAbort(clerk.session.getToken(), signal)

    console.log('[Auth] Token retrieved', {
      hasToken: Boolean(token),
      userId: clerk.session.user?.id,
    })

    if (token) {
      updateCachedState({
        status: 'signed-in',
        userId: clerk.session.user?.id,
        sessionId: clerk.session.id,
        expiresAt: clerk.session.expireAt?.getTime(),
      })
    }

    return token
  } catch (error) {
    console.error('[Auth] Failed to get token', error)
    return null
  }
}

/** Read the current session authority without exposing it in user-facing copy. */
export async function getAuthAuthority(signal?: AbortSignal): Promise<AuthAuthority | null> {
  try {
    if (E2E_AUTH_MODE) {
      return await getE2eAuthority(signal);
    }
    const clerk = await withAbort(createFreshClerkClient(), signal)
    const authority = sessionAuthority(clerk.session)
    if (authority) {
      updateCachedState({
        status: 'signed-in',
        userId: authority.userId,
        sessionId: authority.sessionId,
        expiresAt: clerk.session?.expireAt?.getTime(),
      })
    } else {
      updateCachedState({ status: 'signed-out' })
    }
    return authority
  } catch (error) {
    console.error('[Auth] Failed to read session authority', error)
    return null
  }
}

/** Obtain a token only while the original durable-job authority is still active. */
export async function getAuthTokenForAuthority(expected: AuthAuthority, signal?: AbortSignal): Promise<string | null> {
  try {
    if (E2E_AUTH_MODE) {
      const actual = await getE2eAuthority(signal);
      return sameAuthAuthority(actual, expected)
        ? `e2e-token-${expected.userId}-${expected.sessionId}`
        : null;
    }
    const clerk = await withAbort(createFreshClerkClient(), signal)
    const actual = sessionAuthority(clerk.session)
    if (!sameAuthAuthority(actual, expected) || !clerk.session) {
      return null
    }
    return await withAbort(clerk.session.getToken(), signal)
  } catch (error) {
    console.error('[Auth] Failed to get owner-fenced token', error)
    return null
  }
}

async function getE2eAuthority(signal?: AbortSignal): Promise<AuthAuthority | null> {
  const stored = await withAbort(chrome.storage.local.get(E2E_AUTH_KEY), signal);
  const value = stored[E2E_AUTH_KEY];
  if (!value || typeof value !== 'object') return null;
  const authority = value as Partial<AuthAuthority>;
  if (typeof authority.userId !== 'string' || typeof authority.sessionId !== 'string') return null;
  return {
    userId: authority.userId,
    accountId: typeof authority.accountId === 'string' ? authority.accountId : authority.userId,
    sessionId: authority.sessionId,
  };
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise
  }
  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      value => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      error => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
  })
}

export function waitForSignIn(timeoutMs = SIGN_IN_TIMEOUT_MS, signal?: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false
    let intervalId: ReturnType<typeof setInterval> | undefined

    const finish = (signedIn: boolean) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeoutId)
      if (intervalId) {
        clearInterval(intervalId)
      }
      waiters.delete(listener)
      signal?.removeEventListener('abort', abort)
      resolve(signedIn)
    }

    const abort = () => finish(false)

    const timeoutId = setTimeout(() => {
      finish(false)
    }, timeoutMs)
    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })

    const listener = (state: AuthState) => {
      if (state.status === 'signed-in') {
        finish(true)
      }
    }

    const pollForSyncedSession = async () => {
      if (settled) {
        return
      }

      if (await isAuthenticated()) {
        finish(true)
      }
    }

    waiters.add(listener)
    intervalId = setInterval(() => {
      runBestEffort('auth sign-in poll', pollForSyncedSession)
    }, SIGN_IN_POLL_INTERVAL_MS)
    runBestEffort('auth initial sign-in poll', pollForSyncedSession)
  })
}

export async function promptUserSignIn(signal?: AbortSignal): Promise<boolean> {
  try {
    await chrome.tabs.create({ url: getSplootSignInUrl() })
  } catch (error) {
    console.warn('[Auth] Unable to open Sploot sign-in tab', error)
    return false
  }

  return await waitForSignIn(SIGN_IN_TIMEOUT_MS, signal)
}

export interface AuthDiagnosticsSnapshot {
  timestamp: number
  environment: string
  status: AuthState['status']
  userId?: string | null
  sessionId?: string | null
  expiresAt?: number | null
  error?: string
}

export async function runAuthDiagnostics(): Promise<AuthDiagnosticsSnapshot> {
  const snapshot: AuthDiagnosticsSnapshot = {
    timestamp: Date.now(),
    environment: CLERK_ENVIRONMENT,
    status: cachedState.status,
    userId: cachedState.userId,
    sessionId: cachedState.sessionId,
    expiresAt: cachedState.expiresAt,
  }

  try {
    const clerk = await createFreshClerkClient()
    snapshot.status = clerk.session ? 'signed-in' : 'signed-out'
    snapshot.userId = clerk.session?.user?.id
    snapshot.sessionId = clerk.session?.id
    snapshot.expiresAt = clerk.session?.expireAt?.getTime() ?? null
  } catch (error) {
    snapshot.error = error instanceof Error ? error.message : String(error)
    console.error('[Auth] Diagnostics failed', error)
  }

  return snapshot
}

export function setupAuthBridge() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === AUTH_MESSAGES.STATE_UPDATE) {
      updateCachedState(message.payload)
      sendResponse({ ok: true })
      return true
    }

    if (message?.type === AUTH_MESSAGES.REQUEST_STATE) {
      sendResponse({ state: cachedState })
      return true
    }

    if (message?.type === AUTH_MESSAGES.RUN_DIAGNOSTICS) {
      if (!IS_DEV_BUILD) {
        return false
      }
      runAuthDiagnostics()
        .then(snapshot => sendResponse({ snapshot }))
        .catch(error => sendResponse({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }

    return false
  })
}
