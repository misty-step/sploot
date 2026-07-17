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

  it('does not rehydrate repeatedly for the initial signed-out state', async () => {
    const clerk = {
      user: null,
      __internal_reloadInitialResources: vi.fn(async () => undefined),
    }

    installPopupAuthSync(
      clerk,
      runtime as unknown as NonNullable<Parameters<typeof installPopupAuthSync>[1]>,
    )
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(clerk.__internal_reloadInitialResources).not.toHaveBeenCalled()
  })

  it('rehydrates once for a loaded stale signed-in popup without reloading its window', async () => {
    runtime.sendMessage.mockResolvedValue({
      state: { status: 'signed-in', userId: 'user_1', sessionId: 'session_1' },
    })
    const clerk = {
      user: null,
      __internal_reloadInitialResources: vi.fn(async () => undefined),
    }

    installPopupAuthSync(
      clerk,
      runtime as unknown as NonNullable<Parameters<typeof installPopupAuthSync>[1]>,
    )
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(clerk.__internal_reloadInitialResources).toHaveBeenCalledOnce()
  })

  it('replays the latest auth state after an earlier refresh settles', async () => {
    runtime.sendMessage.mockResolvedValue({
      state: { status: 'signed-in', userId: 'user_1', sessionId: 'session_1' },
    })
    let resolveFirst!: () => void
    const firstRefresh = new Promise<void>(resolve => { resolveFirst = resolve })
    const clerk = {
      user: null,
      __internal_reloadInitialResources: vi.fn()
        .mockReturnValueOnce(firstRefresh)
        .mockResolvedValue(undefined),
    }

    installPopupAuthSync(
      clerk,
      runtime as unknown as NonNullable<Parameters<typeof installPopupAuthSync>[1]>,
    )
    await vi.waitFor(() => expect(clerk.__internal_reloadInitialResources).toHaveBeenCalledOnce())

    listeners[0](
      {
        type: AUTH_MESSAGES.STATE_CHANGED,
        payload: { status: 'signed-in', userId: 'user_2', sessionId: 'session_2' },
      },
      { id: runtime.id },
    )
    resolveFirst()

    await vi.waitFor(() => expect(clerk.__internal_reloadInitialResources).toHaveBeenCalledTimes(2))
  })

  it('rehydrates when a stale local user conflicts with signed-out state', async () => {
    const clerk = {
      user: { reload: vi.fn(async () => undefined) },
      __internal_reloadInitialResources: vi.fn(async () => undefined),
    }
    runtime.sendMessage.mockResolvedValue({ state: { status: 'signed-out' } })

    installPopupAuthSync(
      clerk,
      runtime as unknown as NonNullable<Parameters<typeof installPopupAuthSync>[1]>,
    )
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(clerk.__internal_reloadInitialResources).toHaveBeenCalledOnce()
    expect(clerk.user.reload).not.toHaveBeenCalled()
  })

  it('reports a Clerk rehydration failure without falling back to window reload', async () => {
    runtime.sendMessage.mockResolvedValue({
      state: { status: 'signed-in', userId: 'user_throw', sessionId: 'session_throw' },
    })
    const clerk = {
      user: null,
      __internal_reloadInitialResources: vi.fn(async () => { throw new Error('resource refresh failed') }),
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    installPopupAuthSync(
      clerk,
      runtime as unknown as NonNullable<Parameters<typeof installPopupAuthSync>[1]>,
    )
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(clerk.__internal_reloadInitialResources).toHaveBeenCalledOnce()
    expect(errorSpy).toHaveBeenCalledWith('[Popup] Failed to refresh auth state', expect.any(Error))
    errorSpy.mockRestore()
  })

  it('rehydrates an open popup from a worker state event without receiving a token', async () => {
    const clerk = {
      user: null,
      __internal_reloadInitialResources: vi.fn(async () => undefined),
    }
    installPopupAuthSync(
      clerk,
      runtime as unknown as NonNullable<Parameters<typeof installPopupAuthSync>[1]>,
    )
    await new Promise(resolve => setTimeout(resolve, 0))

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

    expect(clerk.__internal_reloadInitialResources).toHaveBeenCalledOnce()
    expect(JSON.stringify(clerk.__internal_reloadInitialResources.mock.calls)).not.toContain('must-never-cross')
  })

  it('ignores foreign or malformed messages and removes its listener on cleanup', async () => {
    const clerk = {
      user: null,
      __internal_reloadInitialResources: vi.fn(async () => undefined),
    }
    const cleanup = installPopupAuthSync(
      clerk,
      runtime as unknown as NonNullable<Parameters<typeof installPopupAuthSync>[1]>,
    )
    await new Promise(resolve => setTimeout(resolve, 0))

    listeners[0]({ type: AUTH_MESSAGES.STATE_CHANGED, payload: { status: 'signed-in' } }, { id: 'foreign' })
    listeners[0]({ type: AUTH_MESSAGES.STATE_CHANGED, payload: { status: 'not-a-state' } }, { id: runtime.id })
    expect(clerk.__internal_reloadInitialResources).not.toHaveBeenCalled()

    cleanup()
    expect(runtime.onMessage.removeListener).toHaveBeenCalledWith(listeners[0])
    listeners[0]({ type: AUTH_MESSAGES.STATE_CHANGED, payload: { status: 'signed-out' } }, { id: runtime.id })
    expect(clerk.__internal_reloadInitialResources).not.toHaveBeenCalled()
  })
})
