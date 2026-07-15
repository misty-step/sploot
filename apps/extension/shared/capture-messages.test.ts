import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAPTURE_MESSAGES, requestVisibleTabCapture } from './capture-messages'

describe('requestVisibleTabCapture', () => {
  const sendMessage = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    sendMessage.mockResolvedValue(undefined)
  })

  it('hands the popup user gesture to the background capture worker', async () => {
    await requestVisibleTabCapture()

    expect(sendMessage).toHaveBeenCalledOnce()
    expect(sendMessage).toHaveBeenCalledWith({ type: CAPTURE_MESSAGES.VISIBLE_TAB })
  })
})
