import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAPTURE_MESSAGES, requestVisibleTabCapture } from './capture-messages'

describe('requestVisibleTabCapture', () => {
  const sendMessage = vi.fn()
  const set = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: { local: { set } },
    })
    sendMessage.mockResolvedValue(undefined)
    set.mockResolvedValue(undefined)
  })

  it('hands the popup user gesture to the background capture worker', async () => {
    await requestVisibleTabCapture()

    expect(sendMessage).toHaveBeenCalledOnce()
    expect(sendMessage).toHaveBeenCalledWith({ type: CAPTURE_MESSAGES.VISIBLE_TAB })
  })

  it('persists visible recovery feedback when dispatch cannot reach the worker', async () => {
    sendMessage.mockRejectedValueOnce(new Error('worker unavailable'))

    await expect(requestVisibleTabCapture()).rejects.toThrow('worker unavailable')

    expect(set).toHaveBeenCalledWith({
      'sploot:last-save': expect.objectContaining({
        state: 'error',
        message: 'Could not start screenshot. Try again.',
      }),
    })
  })
})
