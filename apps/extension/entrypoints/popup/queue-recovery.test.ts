import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CONTEXT_MENU_SAVE_MESSAGES } from '../../shared/context-menu-save-messages';
import { performContextMenuSaveAction, requestContextMenuSaveQueue } from './queue-recovery';

const sendMessage = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
});

describe('popup queue recovery boundary', () => {
  it('returns queued jobs only from an acknowledged background response', async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      jobs: [{
        id: 'job-1',
        filename: 'cat.png',
        state: 'pending',
        createdAt: 1,
        attempts: 1,
        nextAttemptAt: 30_001,
      }],
    });

    await expect(requestContextMenuSaveQueue()).resolves.toEqual({
      ok: true,
      jobs: [expect.objectContaining({ id: 'job-1', state: 'pending' })],
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: CONTEXT_MENU_SAVE_MESSAGES.LIST_QUEUE });
  });

  it('turns a background rejection response into stable popup error state', async () => {
    sendMessage.mockResolvedValue({ ok: false, code: 'storage-unavailable', error: 'Storage is unavailable.' });

    await expect(requestContextMenuSaveQueue()).resolves.toEqual({
      ok: false,
      code: 'storage-unavailable',
      error: 'Storage is unavailable.',
    });
  });

  it('turns a rejected runtime message into stable popup error state', async () => {
    sendMessage.mockRejectedValue(new Error('worker unavailable'));

    await expect(performContextMenuSaveAction('job-1', CONTEXT_MENU_SAVE_MESSAGES.RETRY))
      .resolves.toEqual({ ok: false, code: 'message-failed', error: 'worker unavailable' });
  });

  it('does not treat an unacknowledged action as success', async () => {
    sendMessage.mockResolvedValue({ ok: false, code: 'not-found', error: 'Queue job not found.' });

    await expect(performContextMenuSaveAction('job-1', CONTEXT_MENU_SAVE_MESSAGES.DISCARD))
      .resolves.toEqual({ ok: false, code: 'not-found', error: 'Queue job not found.' });
  });
});
