import { createClerkClient } from '@clerk/chrome-extension/background'
import { AUTH_MESSAGES, type AuthState } from '../../shared/auth-messages'
import { CLERK_ENVIRONMENT, CLERK_PUBLISHABLE_KEY } from '../../shared/env'

const PUBLISHABLE_KEY = CLERK_PUBLISHABLE_KEY
const SIGN_IN_TIMEOUT_MS = 60000

let cachedState: AuthState = { status: 'unknown' }
const waiters = new Set<(state: AuthState) => void>()

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
  return await createClerkClient({
    publishableKey: PUBLISHABLE_KEY,
  })
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const clerk = await createFreshClerkClient()
    const hasSession = Boolean(clerk.session)

    console.log('[Auth] isAuthenticated check', {
      hasSession,
      userId: clerk.session?.user?.id,
    })

    if (hasSession) {
      updateCachedState({
        status: 'signed-in',
        userId: clerk.session?.user?.id,
        sessionId: clerk.session?.id,
        expiresAt: clerk.session?.expireAt,
      })
    }

    return hasSession
  } catch (error) {
    console.error('[Auth] Failed to check authentication', error)
    return false
  }
}

export async function getAuthToken(): Promise<string | null> {
  try {
    const clerk = await createFreshClerkClient()

    if (!clerk.session) {
      console.warn('[Auth] No session available for token retrieval')
      return null
    }

    const token = await clerk.session.getToken()

    console.log('[Auth] Token retrieved', {
      hasToken: Boolean(token),
      userId: clerk.session.user?.id,
    })

    if (token) {
      updateCachedState({
        status: 'signed-in',
        userId: clerk.session.user?.id,
        sessionId: clerk.session.id,
        expiresAt: clerk.session.expireAt,
      })
    }

    return token
  } catch (error) {
    console.error('[Auth] Failed to get token', error)
    return null
  }
}

export function waitForSignIn(timeoutMs = SIGN_IN_TIMEOUT_MS): Promise<boolean> {
  return new Promise(resolve => {
    const timeoutId = setTimeout(() => {
      waiters.delete(listener)
      resolve(false)
    }, timeoutMs)

    const listener = (state: AuthState) => {
      if (state.status === 'signed-in') {
        clearTimeout(timeoutId)
        waiters.delete(listener)
        resolve(true)
      }
    }

    waiters.add(listener)
  })
}

export async function promptUserSignIn(): Promise<boolean> {
  try {
    await chrome.action.openPopup()
  } catch (error) {
    console.warn('[Auth] Unable to open popup automatically, opening new tab instead', error)
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') })
  }

  return await waitForSignIn()
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
    snapshot.expiresAt = clerk.session?.expireAt ?? null
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
      runAuthDiagnostics()
        .then(snapshot => sendResponse({ snapshot }))
        .catch(error => sendResponse({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }

    return false
  })
}
