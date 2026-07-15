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
