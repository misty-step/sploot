import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGIN = 'http://127.0.0.1:3001'
const KEY = 'sploot:connection'
// Fresh imports below intentionally exercise service-worker module lifecycles.
interface StoredConnection {
  pending?: { nextPollAt: number }
  error?: string
}
let stored: Record<string, StoredConnection>
let alarmListeners: Array<(alarm: { name: string }) => unknown>
let messageListeners: Array<(message: { type: string }, sender: { id: string }, reply: (value: unknown) => void) => unknown>
let authorized: boolean
let denied: boolean
let revokeStatus: number
let requests: Array<{ url: string; init: RequestInit }>

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-08T00:00:00Z'))
  vi.stubEnv('VITE_API_BASE_URL', ORIGIN)
  stored = {}
  alarmListeners = []
  messageListeners = []
  requests = []
  authorized = false
  denied = false
  revokeStatus = 204
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sendMessage: vi.fn(async () => undefined),
      onMessage: { addListener: (listener: typeof messageListeners[number]) => messageListeners.push(listener) },
    },
    storage: { local: {
      get: vi.fn(async (key: string) => structuredClone({ [key]: stored[key] })),
      set: vi.fn(async (values: object) => { Object.assign(stored, structuredClone(values)) }),
      remove: vi.fn(async (key: string) => { delete stored[key] }),
      setAccessLevel: vi.fn(async () => undefined),
    } },
    alarms: {
      clear: vi.fn(async () => true), create: vi.fn(async () => undefined),
      onAlarm: { addListener: (listener: typeof alarmListeners[number]) => alarmListeners.push(listener) },
    },
    tabs: { create: vi.fn(async () => ({ id: 1 })) },
  })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    requests.push({ url, init })
    if (url.endsWith('/api/auth/device')) return Response.json({
      deviceCode: 'private-device-code', userCode: 'ABCD-EFGH',
      verificationUriComplete: `${ORIGIN}/app/connect?code=ABCD-EFGH`, expiresIn: 600, interval: 2,
    }, { status: 201 })
    if (url.endsWith('/api/auth/device/token')) {
      if (denied) return Response.json({ error: 'denied' }, { status: 403 })
      return authorized ? Response.json({ status: 'authorized', token: 'spld_private-device-token',
        user: { id: 'account-a', email: 'a@example.test' }, expiresAt: '2026-10-08T00:00:00Z' })
        : Response.json({ status: 'pending' }, { status: 202 })
    }
    if (url.endsWith('/api/auth/device/session')) return new Response(null, { status: revokeStatus })
    if (url.endsWith('/api/auth/session')) return Response.json({ user: { id: 'account-a', email: 'a@example.test' } })
    throw new Error('Unexpected fixture request')
  }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('device pairing authority', () => {
  it('resumes the same pending authorization after worker restart without publishing secrets', async () => {
    const firstWorker = await import('./auth-manager')
    const pending = await firstWorker.startDevicePairing()
    expect(pending.pending?.userCode).toBe('ABCD-EFGH')
    expect(JSON.stringify(pending)).not.toContain('private-device-code')
    const restartedAt = Date.now()
    vi.clearAllTimers()
    // Clearing fake timers also resets their clock; a real worker restart does not.
    vi.setSystemTime(restartedAt)
    vi.resetModules()
    const restarted = await import('./auth-manager')
    restarted.setupAuthBridge()
    authorized = true
    await vi.advanceTimersByTimeAsync(2_001)
    expect(await restarted.isAuthenticated()).toBe(true)
    const authority = await restarted.readAuthAuthority()
    expect(authority?.accountId).toBe(`${ORIGIN}/account-a`)
    expect(requests.filter(request => request.url.endsWith('/api/auth/device'))).toHaveLength(1)
    const publicMessages = JSON.stringify(vi.mocked(chrome.runtime.sendMessage).mock.calls)
    expect(publicMessages).not.toContain('private-device-code')
    expect(publicMessages).not.toContain('spld_private-device-token')
  })

  it('stops denied and expired authorization rather than polling indefinitely', async () => {
    const manager = await import('./auth-manager')
    await manager.startDevicePairing()
    denied = true
    await vi.advanceTimersByTimeAsync(2_001)
    expect(stored[KEY].pending).toBeUndefined()
    expect(await manager.isAuthenticated()).toBe(false)
    await manager.startDevicePairing()
    denied = false
    vi.setSystemTime(Date.now() + 600_001)
    await vi.advanceTimersByTimeAsync(2_001)
    expect(stored[KEY].pending).toBeUndefined()
    const count = requests.length
    await vi.advanceTimersByTimeAsync(600_000)
    expect(requests).toHaveLength(count)
  })

  it('bounds unavailable-instance polling and persists the retry deadline', async () => {
    const manager = await import('./auth-manager')
    await manager.startDevicePairing()
    vi.mocked(fetch).mockRejectedValue(new TypeError('network unavailable'))
    await vi.advanceTimersByTimeAsync(2_001)
    expect(stored[KEY].pending?.nextPollAt).toBeGreaterThan(Date.now())
    expect(stored[KEY].error).toBeTruthy()
    await vi.advanceTimersByTimeAsync(660_000)
    expect(stored[KEY].pending).toBeUndefined()
    expect(await manager.isAuthenticated()).toBe(false)
  })

  it('refuses verification URLs on another origin before opening a tab', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ deviceCode: 'code', userCode: 'USER', expiresIn: 600,
      verificationUriComplete: 'https://attacker.test/app/connect' }, { status: 201 }))
    const manager = await import('./auth-manager')
    await expect(manager.startDevicePairing()).rejects.toThrow()
    expect(chrome.tabs.create).not.toHaveBeenCalled()
    expect(stored[KEY]).toBeUndefined()
  })

  it('fences credentials and retained ownership by instance even when account IDs collide', async () => {
    const manager = await import('./auth-manager')
    await manager.startDevicePairing()
    authorized = true
    await vi.advanceTimersByTimeAsync(2_001)
    const owner = await manager.readAuthAuthority()
    expect(await manager.getAuthTokenForAuthority(owner!, undefined, 'https://other.test')).toBeNull()
    expect(manager.sameAccountAuthority(owner, { ...owner!, accountId: 'https://other.test/account-a' })).toBe(false)
    expect(manager.sameAccountAuthority(owner, { ...owner!, sessionId: 'new-device' })).toBe(true)
    await expect(manager.setInstanceUrl('https://other.test')).rejects.toThrow()
    await manager.disconnectDevice()
    await manager.setInstanceUrl('https://other.test')
    expect(await manager.getAuthToken(undefined, ORIGIN)).toBeNull()
    const revoke = requests.find(request => request.url.endsWith('/api/auth/device/session'))!
    expect(revoke.url).toBe(`${ORIGIN}/api/auth/device/session`)
    expect(revoke.init).toMatchObject({ method: 'DELETE', credentials: 'omit', redirect: 'error' })
    expect(requests.some(request => request.url.startsWith('https://other.test'))).toBe(false)
  })

  it('does not pretend to disconnect when revocation failed', async () => {
    const manager = await import('./auth-manager')
    await manager.startDevicePairing()
    authorized = true
    await vi.advanceTimersByTimeAsync(2_001)
    revokeStatus = 503
    await expect(manager.disconnectDevice()).rejects.toThrow()
    expect(await manager.isAuthenticated()).toBe(true)
  })

  it('ignores stale unauthorized responses after a new device has connected', async () => {
    const manager = await import('./auth-manager')
    await manager.startDevicePairing()
    authorized = true
    await vi.advanceTimersByTimeAsync(2_001)
    await manager.invalidateAuthToken('spld_older-device-token', ORIGIN)
    expect(await manager.isAuthenticated()).toBe(true)
    await manager.invalidateAuthToken('spld_private-device-token', ORIGIN)
    expect(await manager.isAuthenticated()).toBe(false)
  })

  it('rejects messages from other extensions and never returns expired credentials', async () => {
    const manager = await import('./auth-manager')
    manager.setupAuthBridge()
    const reply = vi.fn()
    messageListeners[0]({ type: 'AUTH_CONNECT' }, { id: 'other-extension' }, reply)
    await vi.advanceTimersByTimeAsync(1)
    expect(reply).not.toHaveBeenCalled()
    expect(requests).toHaveLength(0)
    await manager.startDevicePairing()
    authorized = true
    await vi.advanceTimersByTimeAsync(2_001)
    vi.setSystemTime(new Date('2026-11-08T00:00:00Z'))
    expect(await manager.getAuthToken()).toBeNull()
  })
})
