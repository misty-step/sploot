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

const PUBLISHABLE_KEY = CLERK_PUBLISHABLE_KEY
const SIGN_IN_TIMEOUT_MS = 60000
const E2E_AUTH_KEY = 'sploot:e2e-auth-authority'
const AUTH_SYNC_RETRY_DELAYS_MS = [50, 100, 250, 500, 1000, 2000, 5000, 10000, 15000, 15000] as const
const AUTH_SYNC_INITIAL_RETRY_LIMIT = 4

let cachedState: AuthState = { status: 'unknown' }
const waiters = new Set<(state: AuthState) => void>()
let clerkClientPromise: ReturnType<typeof createClerkClient> | undefined
let removeClerkListener: (() => void) | undefined
let bridgeListener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] | undefined
let authSyncRetryTimer: ReturnType<typeof setTimeout> | undefined
let authSyncRetryAttempt = 0
let authSyncGeneration = 0
let authSyncInFlightGeneration: number | undefined
let authSyncInFlightPromise: Promise<void> | undefined

/**
 * The Clerk authority behind a durable save job.
 *
 * Durable ownership is the STABLE account identity (`userId` plus the account
 * boundary `accountId`). `sessionId` records the credential that was live when
 * the job was created — it is credential freshness only and never participates
 * in ownership decisions: ordinary sign-out/re-auth mints a new session for the
 * same account and must not orphan durable work.
 */
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

/**
 * Whether two authorities belong to the same stable account. This is the ONLY
 * comparison durable ownership may use; session identity is deliberately
 * ignored so a re-authenticated account keeps its queued work.
 */
export function sameAccountAuthority(left: AuthAuthority | null | undefined, right: AuthAuthority | null | undefined): boolean {
  return Boolean(
    left
    && right
    && left.userId === right.userId
    && (left.accountId ?? left.userId) === (right.accountId ?? right.userId),
  )
}

function notifyWaiters(state: AuthState) {
  for (const listener of waiters) {
    listener(state)
  }
}

function authStateFromResources(resources: {
  session?: { id: string; user?: { id: string } | null; expireAt?: Date | null } | null
  user?: { id: string } | null
}): AuthState {
  if (!resources.session) {
    return { status: 'signed-out', userId: null, sessionId: null, expiresAt: null }
  }

  return {
    status: 'signed-in',
    userId: resources.user?.id ?? resources.session.user?.id ?? null,
    sessionId: resources.session.id,
    expiresAt: resources.session.expireAt?.getTime() ?? null,
  }
}

function sameAuthState(left: AuthState, right: AuthState): boolean {
  return (
    left.status === right.status &&
    left.userId === right.userId &&
    left.sessionId === right.sessionId &&
    left.expiresAt === right.expiresAt
  )
}

function updateCachedState(next: AuthState) {
  if (sameAuthState(cachedState, next)) {
    return
  }

  cachedState = next
  console.log('[Auth] State changed', {
    status: next.status,
    userId: next.userId,
    sessionId: next.sessionId,
    expiresAt: next.expiresAt,
  })
  notifyWaiters(next)

  try {
    const result = chrome.runtime.sendMessage({
      type: AUTH_MESSAGES.STATE_CHANGED,
      payload: next,
    })
    if (result && typeof result.catch === 'function') {
      void result.catch(() => undefined)
    }
  } catch {
    // The popup may have closed between the state change and this broadcast.
  }
}

async function createFreshClerkClient() {
  assertExtensionConfig()
  // CreateClerkClientOptions exposes no telemetry option and the SDK loads
  // Clerk internally with fixed options, so there is no typed disable knob
  // here. Clerk's telemetry collector no-ops for production publishable keys
  // (instanceType gate); the ClerkProvider surfaces disable it explicitly.
  return await createClerkClient({
    publishableKey: PUBLISHABLE_KEY,
    syncHost: CLERK_SYNC_HOST,
    __experimental_syncHostListener: true,
  })
}

async function getClerkClient() {
  assertExtensionConfig()
  clerkClientPromise ??= Promise.resolve(createClerkClient({
    publishableKey: PUBLISHABLE_KEY,
    syncHost: CLERK_SYNC_HOST,
    __experimental_syncHostListener: true,
  })).catch(error => {
    clerkClientPromise = undefined
    throw error
  })
  return await clerkClientPromise
}

async function startAuthSyncImplementation(generation: number): Promise<void> {
  if (E2E_AUTH_MODE || removeClerkListener) {
    return
  }

  const clerk = await getClerkClient()
  if (generation !== authSyncGeneration) {
    return
  }
  if (!clerk || typeof clerk.addListener !== 'function') {
    throw new Error('Clerk sync listener is unavailable')
  }
  const removeListener = clerk.addListener(resources => {
    updateCachedState(authStateFromResources(resources))
  })
  removeClerkListener = typeof removeListener === 'function' ? removeListener : () => undefined
  authSyncRetryAttempt = 0
  updateCachedState(authStateFromResources(clerk))
}

function startAuthSync(generation = authSyncGeneration): Promise<void> {
  if (authSyncInFlightGeneration === generation && authSyncInFlightPromise) {
    return authSyncInFlightPromise
  }

  const promise = startAuthSyncImplementation(generation)
  authSyncInFlightGeneration = generation
  authSyncInFlightPromise = promise.finally(() => {
    if (authSyncInFlightGeneration === generation) {
      authSyncInFlightGeneration = undefined
      authSyncInFlightPromise = undefined
    }
  })
  return authSyncInFlightPromise
}

function startAuthSyncWithRetry(generation = authSyncGeneration): void {
  if (E2E_AUTH_MODE || removeClerkListener || authSyncRetryTimer || generation !== authSyncGeneration) {
    return
  }

  void startAuthSync(generation).catch(error => {
    if (generation !== authSyncGeneration) {
      return
    }
    console.error('[Auth] Failed to initialize Clerk sync', error)
    const retryLimit = waiters.size > 0 ? AUTH_SYNC_RETRY_DELAYS_MS.length : AUTH_SYNC_INITIAL_RETRY_LIMIT
    if (authSyncRetryAttempt >= retryLimit) {
      return
    }
    const delay = AUTH_SYNC_RETRY_DELAYS_MS[authSyncRetryAttempt++]
    authSyncRetryTimer = setTimeout(() => {
      authSyncRetryTimer = undefined
      startAuthSyncWithRetry(generation)
    }, delay)
  })
}

export async function isAuthenticated(signal?: AbortSignal): Promise<boolean> {
  try {
    if (E2E_AUTH_MODE) {
      return Boolean(await getE2eAuthority(signal));
    }
    const clerk = await withAbort(getClerkClient(), signal)
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
    const clerk = await withAbort(getClerkClient(), signal)

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

/**
 * Read the current session authority, THROWING on auth transport failure.
 *
 * `null` means "verifiably signed out"; a thrown error means "could not
 * determine" — callers that fence durable work must treat the two differently
 * (a transient failure schedules a retry; it never masquerades as an owner
 * change).
 */
export async function readAuthAuthority(signal?: AbortSignal): Promise<AuthAuthority | null> {
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
}

/** Lenient wrapper: read the current session authority, null on any failure. */
export async function getAuthAuthority(signal?: AbortSignal): Promise<AuthAuthority | null> {
  try {
    return await readAuthAuthority(signal)
  } catch (error) {
    console.error('[Auth] Failed to read session authority', error)
    return null
  }
}

/**
 * Obtain a token only while the durable job's stable ACCOUNT is still active.
 * The token always comes from the LIVE session — session identity is
 * credential freshness, so a re-authenticated same-account session is valid.
 */
export async function getAuthTokenForAuthority(expected: AuthAuthority, signal?: AbortSignal): Promise<string | null> {
  try {
    if (E2E_AUTH_MODE) {
      const actual = await getE2eAuthority(signal);
      return sameAccountAuthority(actual, expected) && actual
        ? `e2e-token-${actual.userId}-${actual.sessionId}`
        : null;
    }
    const clerk = await withAbort(createFreshClerkClient(), signal)
    const actual = sessionAuthority(clerk.session)
    if (!sameAccountAuthority(actual, expected) || !clerk.session) {
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
    let listener: (state: AuthState) => void

    const finish = (signedIn: boolean) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeoutId)
      waiters.delete(listener)
      if (waiters.size === 0) {
        authSyncGeneration += 1
        if (authSyncRetryTimer) {
          clearTimeout(authSyncRetryTimer)
          authSyncRetryTimer = undefined
        }
        authSyncRetryAttempt = 0
      }
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

    listener = (state: AuthState) => {
      if (state.status === 'signed-in') {
        finish(true)
      }
    }

    if (cachedState.status === 'signed-in') {
      finish(true)
      return
    }

    const hadActiveWaiter = waiters.size > 0
    waiters.add(listener)
    if (!hadActiveWaiter) {
      authSyncGeneration += 1
      if (authSyncRetryTimer) {
        clearTimeout(authSyncRetryTimer)
        authSyncRetryTimer = undefined
      }
      authSyncRetryAttempt = 0
      startAuthSyncWithRetry(authSyncGeneration)
    }
  })
}

async function closeOwnedSignInTab(tabId: number | undefined, signInUrl: string): Promise<void> {
  if (tabId === undefined) {
    return
  }

  try {
    const tab = await chrome.tabs.get(tabId)
    if (tab.url === signInUrl) {
      await chrome.tabs.remove(tabId)
    }
  } catch {
    // The tab may have been closed or navigated away while auth completed.
  }
}

export async function promptUserSignIn(signal?: AbortSignal): Promise<boolean> {
  const signInUrl = getSplootSignInUrl()
  let tabId: number | undefined
  try {
    const tab = await chrome.tabs.create({ url: signInUrl })
    tabId = tab?.id
  } catch (error) {
    console.warn('[Auth] Unable to open Sploot sign-in tab', error)
    return false
  }

  try {
    if (await isAuthenticated(signal)) {
      return true
    }

    return await waitForSignIn(SIGN_IN_TIMEOUT_MS, signal)
  } finally {
    await closeOwnedSignInTab(tabId, signInUrl)
  }
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
  if (bridgeListener) {
    return
  }

  bridgeListener = (message, _sender, sendResponse) => {
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
  }

  chrome.runtime.onMessage.addListener(bridgeListener)
  startAuthSyncWithRetry()
}
