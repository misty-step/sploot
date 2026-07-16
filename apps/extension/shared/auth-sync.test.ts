import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_MESSAGES, type AuthState } from './auth-messages'
import { installPopupAuthSync } from './auth-sync'

describe('popup auth sync', () => {
  let listeners: Array<(message: unknown, sender: { id?: string }) => void>
  let runtime: {
    id: string
    onMessage: {
      addListener: ReturnType<typeof vi.fn>
      removeListener: ReturnType<typeof vi.fn>
    }
    sendMessage: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    listeners = []
    runtime = {
      id: 'extension-id',
      onMessage: {
        addListener: vi.fn(listener => listeners.push(listener)),
        removeListener: vi.fn(),
      },
      sendMessage: vi.fn(async () => ({ state: { status: 'signed-out' } })),
    }
  })

  it('does not reload repeatedly for the initial signed-out state', async () => {
    const clerk = { user: null }
    const reloadPopup = vi.fn()

    installPopupAuthSync(
      clerk,
      runtime as unknown as NonNullable<Parameters<typeof installPopupAuthSync>[1]>,
      reloadPopup,
    )
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(reloadPopup).not.toHaveBeenCalled()
  })

  it('converges once for a loaded stale signed-in popup', async () => {
    runtime.sendMessage.mockResolvedValue({
      state: { status: 'signed-in', userId: 'user_1', sessionId: 'session_1' },
    })
    const clerk = { user: null }
    const reloadPopup = vi.fn()
    const storage = new Map<string, string>()
    const reloadGuardStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
    }

    installPopupAuthSync(
      clerk,
      runtime as unknown as NonNullable<Parameters<typeof installPopupAuthSync>[1]>,
      reloadPopup,
      reloadGuardStorage,
    )
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(reloadPopup).toHaveBeenCalledTimes(1)

    installPopupAuthSync(
      clerk,
      runtime as unknown as NonNullable<Parameters<typeof installPopupAuthSync>[1]>,
      reloadPopup,
      reloadGuardStorage,
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(reloadPopup).toHaveBeenCalledTimes(1)
  })

  it('reloads once when a stale local user conflicts with signed-out state', async () => {
    const clerk = { user: { reload: vi.fn(async () => undefined) } }
    const reloadPopup = vi.fn()
    const storage = new Map<string, string>()
    runtime.sendMessage.mockResolvedValue({ state: { status: 'signed-out' } })

    installPopupAuthSync(
      clerk,
      runtime as unknown as NonNullable<Parameters<typeof installPopupAuthSync>[1]>,
      reloadPopup,
      {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => { storage.set(key, value) },
      },
    )
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(reloadPopup).toHaveBeenCalledTimes(1)
  })

  it('falls back to memory when session storage rejects access', async () => {
    runtime.sendMessage.mockResolvedValue({
      state: { status: 'signed-in', userId: 'user_throw', sessionId: 'session_throw' },
    })
    const clerk = { user: null }
    const reloadPopup = vi.fn()
    const throwingStorage = {
      getItem: () => { throw new Error('storage unavailable') },
      setItem: () => { throw new Error('storage unavailable') },
    }

    installPopupAuthSync(
      clerk,
      runtime as unknown as NonNullable<Parameters<typeof installPopupAuthSync>[1]>,
      reloadPopup,
      throwingStorage,
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(reloadPopup).toHaveBeenCalledTimes(1)
  })

  it('refreshes an open popup from a worker state event without receiving a token', async () => {
    const clerk = { user: null }
    const reloadPopup = vi.fn()
    installPopupAuthSync(
      clerk,
      runtime as unknown as NonNullable<Parameters<typeof installPopupAuthSync>[1]>,
      reloadPopup,
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    reloadPopup.mockClear()

    const signedInState: AuthState = {
      status: 'signed-in',
      userId: 'user_123',
      sessionId: 'session_123',
      expiresAt: 1780000000000,
    }
    listeners[0](
      {
        type: AUTH_MESSAGES.STATE_CHANGED,
        payload: signedInState,
        token: 'must-never-cross-the-message-boundary',
      },
      { id: runtime.id }
    )
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(reloadPopup).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(reloadPopup.mock.calls)).not.toContain('must-never-cross')
  })

  it('ignores foreign or malformed messages and removes its listener on cleanup', async () => {
    const clerk = { user: null }
    const reloadPopup = vi.fn()
    const cleanup = installPopupAuthSync(
      clerk,
      runtime as unknown as NonNullable<Parameters<typeof installPopupAuthSync>[1]>,
      reloadPopup,
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    reloadPopup.mockClear()

    listeners[0]({ type: AUTH_MESSAGES.STATE_CHANGED, payload: { status: 'signed-in' } }, { id: 'foreign' })
    listeners[0]({ type: AUTH_MESSAGES.STATE_CHANGED, payload: { status: 'not-a-state' } }, { id: runtime.id })
    expect(reloadPopup).not.toHaveBeenCalled()

    cleanup()
    expect(runtime.onMessage.removeListener).toHaveBeenCalledWith(listeners[0])
    listeners[0]({ type: AUTH_MESSAGES.STATE_CHANGED, payload: { status: 'signed-out' } }, { id: runtime.id })
    expect(reloadPopup).not.toHaveBeenCalled()
  })
})
