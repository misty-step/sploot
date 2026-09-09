import { AUTH_MESSAGES, type AuthState } from '../../shared/auth-messages'
import { CONNECTION_STORAGE_KEY, SPLOOT_API_BASE_URL } from '../../shared/env'
import { normalizeInstanceUrl } from '../../shared/instance-url'
import { IS_DEV_BUILD } from '../../shared/build-mode'

const PAIRING_ALARM = 'sploot:device-pairing'
const REQUEST_TIMEOUT_MS = 15_000
const MAX_PAIRING_AGE_MS = 600_000
const MAX_POLL_ATTEMPTS = 300

interface DeviceSession {
  token: string
  user: { id: string; email: string }
  sessionId: string
  expiresAt: number
}
interface PendingPairing {
  deviceCode: string
  userCode: string
  verificationUriComplete: string
  expiresAt: number
  intervalMs: number
  nextPollAt: number
  attempts: number
}
interface Connection {
  instanceUrl: string
  session?: DeviceSession
  pending?: PendingPairing
  error?: string
}

/** Stable instance + account ownership; sessionId is non-secret provenance only. */
export interface AuthAuthority {
  userId: string
  accountId?: string
  sessionId: string
}

/** Admission-time destination and ownership; never contains a usable credential. */
export interface CaptureContext {
  readonly instanceUrl: string
  readonly authority: Readonly<AuthAuthority> | null
}

const listeners = new Set<(state: AuthState) => void>()
let operationQueue: Promise<unknown> = Promise.resolve()
let pollTimer: ReturnType<typeof setTimeout> | undefined
let bridgeInstalled = false
let lastState = ''

function exclusively<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation)
  operationQueue = result.catch(() => undefined)
  return result
}

export function sameAccountAuthority(left: AuthAuthority | null | undefined, right: AuthAuthority | null | undefined): boolean {
  return Boolean(left && right && left.userId === right.userId
    && (left.accountId ?? left.userId) === (right.accountId ?? right.userId))
}

export function onAuthStateChanged(listener: (state: AuthState) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function readConnection(): Promise<Connection> {
  const stored = await chrome.storage.local.get(CONNECTION_STORAGE_KEY)
  const connection = stored[CONNECTION_STORAGE_KEY] as Connection | undefined
  if (!connection) return { instanceUrl: SPLOOT_API_BASE_URL }
  const instanceUrl = normalizeInstanceUrl(connection.instanceUrl)
  // This is private, version-owned extension storage, not a public auth input.
  // An expired credential is never returned even before the startup check runs.
  return {
    instanceUrl,
    ...(connection.session && connection.session.expiresAt > Date.now() ? { session: connection.session } : {}),
    ...(connection.pending ? { pending: connection.pending } : {}),
    ...(connection.error ? { error: connection.error } : {}),
  }
}

function publicState(connection: Connection): AuthState {
  const session = connection.session
  const pending = connection.pending
  return {
    status: session ? 'signed-in' : 'signed-out',
    instanceUrl: connection.instanceUrl,
    ...(session ? {
      userId: session.user.id, email: session.user.email,
      sessionId: session.sessionId, expiresAt: session.expiresAt,
    } : {}),
    ...(pending ? { pending: {
      userCode: pending.userCode, verificationUriComplete: pending.verificationUriComplete,
      expiresAt: pending.expiresAt,
    } } : {}),
    ...(connection.error ? { error: connection.error } : {}),
  }
}

function publish(connection: Connection): AuthState {
  const state = publicState(connection)
  const serialized = JSON.stringify(state)
  if (serialized !== lastState) {
    lastState = serialized
    for (const listener of listeners) listener(state)
    void chrome.runtime.sendMessage({ type: AUTH_MESSAGES.STATE_CHANGED, payload: state }).catch(() => undefined)
  }
  return state
}

async function saveConnection(connection: Connection): Promise<AuthState> {
  await chrome.storage.local.set({ [CONNECTION_STORAGE_KEY]: connection })
  return publish(connection)
}

async function authFetch(instanceUrl: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${instanceUrl}${path}`, {
    ...init,
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
}

function authority(connection: Connection): AuthAuthority | null {
  const session = connection.session
  return session ? {
    userId: session.user.id,
    accountId: `${connection.instanceUrl}/${session.user.id}`,
    sessionId: session.sessionId,
  } : null
}

export async function readAuthAuthority(signal?: AbortSignal): Promise<AuthAuthority | null> {
  signal?.throwIfAborted()
  const connection = await readConnection()
  signal?.throwIfAborted()
  publish(connection)
  return authority(connection)
}

/** Read both fields together before any capture preparation can outlive this account. */
export async function readCaptureContext(signal?: AbortSignal): Promise<CaptureContext> {
  signal?.throwIfAborted()
  const connection = await readConnection()
  signal?.throwIfAborted()
  const owner = authority(connection)
  return Object.freeze({
    instanceUrl: connection.instanceUrl,
    authority: owner ? Object.freeze(owner) : null,
  })
}

export async function getAuthAuthority(signal?: AbortSignal): Promise<AuthAuthority | null> {
  try { return await readAuthAuthority(signal) } catch { return null }
}

export async function isAuthenticated(signal?: AbortSignal): Promise<boolean> {
  return Boolean(await getAuthAuthority(signal))
}

/** The request captures its destination BEFORE reading credentials, closing origin-switch races. */
export async function getAuthToken(signal?: AbortSignal, instanceUrl?: string): Promise<string | null> {
  signal?.throwIfAborted()
  const connection = await readConnection()
  signal?.throwIfAborted()
  if (instanceUrl && connection.instanceUrl !== instanceUrl) return null
  return connection.session?.token ?? null
}

export async function getAuthTokenForAuthority(expected: AuthAuthority, signal?: AbortSignal, instanceUrl?: string): Promise<string | null> {
  signal?.throwIfAborted()
  const connection = await readConnection()
  signal?.throwIfAborted()
  if (instanceUrl && connection.instanceUrl !== instanceUrl) return null
  return sameAccountAuthority(authority(connection), expected) ? connection.session?.token ?? null : null
}

/** Revoke locally only the exact credential rejected by the server, never a newer pairing. */
export async function invalidateAuthToken(token: string, instanceUrl: string): Promise<void> {
  await exclusively(async () => {
    const connection = await readConnection()
    if (connection.instanceUrl === instanceUrl && connection.session?.token === token) {
      await saveConnection({ instanceUrl, error: 'This device session expired or was revoked. Connect again.' })
    }
  })
}

async function schedulePoll(pending?: PendingPairing): Promise<void> {
  clearTimeout(pollTimer)
  pollTimer = undefined
  await chrome.alarms.clear(PAIRING_ALARM)
  if (!pending) return
  const when = Math.min(pending.expiresAt, Math.max(Date.now(), pending.nextPollAt))
  // A short timer is responsive while awake. The persisted alarm resumes after
  // MV3 suspension; Chrome may clamp its wakeup to its minimum alarm interval.
  await chrome.alarms.create(PAIRING_ALARM, { when: Math.max(Date.now() + 30_000, when) })
  pollTimer = setTimeout(() => { void pollPairing().catch(() => undefined) }, Math.max(0, when - Date.now()))
}

async function pollPairing(): Promise<void> {
  await exclusively(async () => {
    const connection = await readConnection()
    const pending = connection.pending
    if (!pending) return
    if (pending.expiresAt <= Date.now() || pending.attempts >= MAX_POLL_ATTEMPTS) {
      await saveConnection({ instanceUrl: connection.instanceUrl, error: 'Connection code expired. Start a new connection.' })
      await schedulePoll()
      return
    }
    if (pending.nextPollAt > Date.now()) {
      await schedulePoll(pending)
      return
    }
    pending.attempts += 1
    pending.nextPollAt = Date.now() + pending.intervalMs
    await saveConnection(connection)
    try {
      const response = await authFetch(connection.instanceUrl, '/api/auth/device/token', {
        method: 'POST', body: JSON.stringify({ deviceCode: pending.deviceCode }),
      })
      if (response.status === 200) {
        const result = await response.json()
        const expiresAt = Date.parse(result.expiresAt)
        if (result.status !== 'authorized' || typeof result.token !== 'string' || !result.token.startsWith('spld_')
          || typeof result.user?.id !== 'string' || !result.user.id || typeof result.user.email !== 'string'
          || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          throw new Error('Invalid device authorization response.')
        }
        await saveConnection({ instanceUrl: connection.instanceUrl, session: {
          token: result.token, user: { id: result.user.id, email: result.user.email },
          sessionId: crypto.randomUUID(), expiresAt,
        } })
        await schedulePoll()
        return
      }
      if (response.status === 403 || response.status === 410) {
        await saveConnection({ instanceUrl: connection.instanceUrl,
          error: response.status === 403 ? 'Connection was denied. Start again if this was unexpected.' : 'Connection code expired. Start a new connection.' })
        await schedulePoll()
        return
      }
      if (response.status === 429) {
        const retrySeconds = Number(response.headers.get('Retry-After'))
        pending.intervalMs = Math.min(60_000, Math.max(pending.intervalMs + 2_000, Number.isFinite(retrySeconds) ? retrySeconds * 1000 : 0))
      } else if (response.status !== 202) {
        throw new Error('Instance could not check this connection.')
      }
      delete connection.error
    } catch {
      connection.error = 'Cannot reach the instance. The connection will retry until the code expires.'
      pending.intervalMs = Math.min(30_000, Math.max(2_000, pending.intervalMs * 2))
    }
    pending.nextPollAt = Date.now() + pending.intervalMs
    await saveConnection(connection)
    await schedulePoll(pending)
  })
}

export async function startDevicePairing(): Promise<AuthState> {
  return exclusively(async () => {
    const connection = await readConnection()
    if (connection.session) return publish(connection)
    if (connection.pending && connection.pending.expiresAt > Date.now()) {
      await chrome.tabs.create({ url: connection.pending.verificationUriComplete })
      await schedulePoll(connection.pending)
      return publish(connection)
    }
    const response = await authFetch(connection.instanceUrl, '/api/auth/device', {
      method: 'POST', body: JSON.stringify({ name: 'Sploot Chrome extension' }),
    })
    if (response.status !== 201) throw new Error(response.status === 429
      ? 'Too many connection requests. Wait a minute before trying again.'
      : 'Could not start a connection. Check the instance URL and try again.')
    const result = await response.json()
    let verificationUrl: URL
    try { verificationUrl = new URL(result.verificationUriComplete) } catch { throw new Error('Instance returned an invalid verification URL.') }
    if (verificationUrl.origin !== connection.instanceUrl || verificationUrl.pathname !== '/app/connect'
      || verificationUrl.username || verificationUrl.password || typeof result.deviceCode !== 'string'
      || typeof result.userCode !== 'string' || !result.userCode || !Number.isFinite(result.expiresIn) || result.expiresIn <= 0) {
      throw new Error('Instance returned an unsafe device connection response.')
    }
    const intervalMs = Math.min(60_000, Math.max(2_000, (Number(result.interval) || 2) * 1000))
    connection.pending = {
      deviceCode: result.deviceCode, userCode: result.userCode, verificationUriComplete: verificationUrl.href,
      expiresAt: Date.now() + Math.min(MAX_PAIRING_AGE_MS, result.expiresIn * 1000),
      intervalMs, nextPollAt: Date.now() + intervalMs, attempts: 0,
    }
    delete connection.error
    const state = await saveConnection(connection)
    await schedulePoll(connection.pending)
    await chrome.tabs.create({ url: verificationUrl.href })
    return state
  })
}

export async function disconnectDevice(): Promise<AuthState> {
  return exclusively(async () => {
    const connection = await readConnection()
    if (connection.session) {
      const response = await authFetch(connection.instanceUrl, '/api/auth/device/session', {
        method: 'DELETE', headers: { Authorization: `Bearer ${connection.session.token}` },
      })
      if (response.status !== 204 && response.status !== 401) {
        throw new Error('Could not revoke this device. Check your connection and try Disconnect again.')
      }
    }
    await schedulePoll()
    await chrome.storage.local.remove('sploot:last-save')
    return saveConnection({ instanceUrl: connection.instanceUrl })
  })
}

export async function setInstanceUrl(value: string): Promise<AuthState> {
  const instanceUrl = normalizeInstanceUrl(value)
  return exclusively(async () => {
    const connection = await readConnection()
    if (instanceUrl === connection.instanceUrl) return publish(connection)
    if (connection.session) throw new Error('Disconnect this device before changing its instance.')
    await schedulePoll()
    await chrome.storage.local.remove('sploot:last-save')
    return saveConnection({ instanceUrl })
  })
}

export function waitForSignIn(timeoutMs = 60_000, signal?: AbortSignal): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const finish = (signedIn: boolean) => {
    clearTimeout(timer)
    remove()
    signal?.removeEventListener('abort', abort)
    resolve(signedIn)
  }
  const remove = onAuthStateChanged(state => { if (state.status === 'signed-in') finish(true) })
  const timer = setTimeout(() => finish(false), timeoutMs)
  const abort = () => finish(false)
  if (signal?.aborted) finish(false)
  else {
    signal?.addEventListener('abort', abort, { once: true })
    void isAuthenticated(signal).then(signedIn => { if (signedIn) finish(true) })
  }
  return promise
}

export async function promptUserSignIn(signal?: AbortSignal): Promise<boolean> {
  try {
    signal?.throwIfAborted()
    if (await isAuthenticated(signal)) return true
    await startDevicePairing()
    return await waitForSignIn(60_000, signal)
  } catch { return false }
}

export async function runAuthDiagnostics(): Promise<AuthState & { timestamp: number }> {
  return { ...publicState(await readConnection()), timestamp: Date.now() }
}

async function resumeConnection(): Promise<void> {
  await exclusively(async () => {
    const connection = await readConnection()
    if (connection.session) {
      try {
        const response = await authFetch(connection.instanceUrl, '/api/auth/session', {
          headers: { Authorization: `Bearer ${connection.session.token}` },
        })
        if (response.status === 401) {
          delete connection.session
          connection.error = 'This device session expired or was revoked. Connect again.'
          await saveConnection(connection)
        }
      } catch { /* Offline startup retains credentials and durable captured bytes. */ }
    }
    publish(connection)
    await schedulePoll(connection.pending)
  })
}

export function setupAuthBridge(): void {
  if (bridgeInstalled) return
  bridgeInstalled = true
  // No content script can read bearer credentials or persisted source bytes.
  void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined)
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === PAIRING_ALARM) return pollPairing().catch(() => undefined)
  })
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !Object.values(AUTH_MESSAGES).includes(message?.type)) return false
    if (message.type === AUTH_MESSAGES.STATE_CHANGED) return false
    let operation: Promise<AuthState>
    switch (message.type) {
      case AUTH_MESSAGES.REQUEST_STATE: operation = readConnection().then(publish); break
      case AUTH_MESSAGES.CONNECT: operation = startDevicePairing(); break
      case AUTH_MESSAGES.SET_INSTANCE:
        operation = typeof message.instanceUrl === 'string' ? setInstanceUrl(message.instanceUrl) : Promise.reject(new Error('Instance URL is required.')); break
      case AUTH_MESSAGES.DISCONNECT:
      case AUTH_MESSAGES.CANCEL: operation = disconnectDevice(); break
      case AUTH_MESSAGES.OPEN_VERIFICATION:
        operation = readConnection().then(async connection => {
          if (connection.pending) await chrome.tabs.create({ url: connection.pending.verificationUriComplete })
          return publicState(connection)
        }); break
      case AUTH_MESSAGES.RUN_DIAGNOSTICS:
        if (!IS_DEV_BUILD) return false
        operation = runAuthDiagnostics(); break
      default: return false
    }
    void operation.then(state => sendResponse({ state }), error => sendResponse({
      error: error instanceof Error && error.name !== 'TypeError' ? error.message : 'Cannot reach the instance. Check its URL and try again.',
    }))
    return true
  })
  void resumeConnection().catch(() => undefined)
}
