import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_MESSAGES, type AuthState } from '../../shared/auth-messages';

const createClerkClient = vi.hoisted(() => vi.fn());
const buildMode = vi.hoisted(() => ({ dev: true }));

vi.mock('@clerk/chrome-extension/background', () => ({
  createClerkClient,
}));

vi.mock('../../shared/build-mode', () => ({
  get IS_DEV_BUILD() {
    return buildMode.dev;
  },
}));

interface ChromeMock {
  action: {
    openPopup: ReturnType<typeof vi.fn>;
  };
  runtime: {
    getURL: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    id: string;
    onMessage: {
      addListener: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
    };
  };
  tabs: {
    create: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
}

let messageListeners: Array<(message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean>;
let chromeMock: ChromeMock;
let clerkListeners: Array<(resources: unknown) => void>;

async function importAuthManager() {
  vi.resetModules();
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_auth');
  vi.stubEnv('VITE_CLERK_SYNC_HOST', 'https://clerk.sploot.test');
  vi.stubEnv('VITE_API_BASE_URL', 'https://sploot.test');
  return await import('./auth-manager');
}

beforeEach(() => {
  messageListeners = [];
  buildMode.dev = true;
  chromeMock = {
    action: {
      openPopup: vi.fn(async () => undefined),
    },
    runtime: {
      getURL: vi.fn(path => `chrome-extension://extension-id/${path}`),
      sendMessage: vi.fn(async () => undefined),
      id: 'extension-id',
      onMessage: {
        addListener: vi.fn(listener => {
          messageListeners.push(listener);
        }),
        removeListener: vi.fn(),
      },
    },
    tabs: {
      create: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
    },
  };

  vi.stubGlobal('chrome', chromeMock);
  createClerkClient.mockReset();
  clerkListeners = [];
});

describe('auth-manager', () => {
  it('returns true and caches signed-in session details when Clerk has a session', async () => {
    createClerkClient.mockResolvedValue({
      session: {
        id: 'session_123',
        user: { id: 'user_123' },
        expireAt: new Date('2026-05-18T12:00:00.000Z'),
        getToken: vi.fn(),
      },
      addListener: vi.fn(listener => {
        clerkListeners.push(listener);
        listener({ session: null });
        return () => undefined;
      }),
    });

    const { isAuthenticated, setupAuthBridge } = await importAuthManager();
    setupAuthBridge();

    await expect(isAuthenticated()).resolves.toBe(true);

    let response: unknown;
    messageListeners[0](
      { type: AUTH_MESSAGES.REQUEST_STATE },
      { id: chromeMock.runtime.id },
      nextResponse => {
        response = nextResponse;
      }
    );

    expect(response).toEqual({
      state: {
        status: 'signed-in',
        userId: 'user_123',
        sessionId: 'session_123',
        expiresAt: new Date('2026-05-18T12:00:00.000Z').getTime(),
      },
    });
  });

  it('returns an explicit user/account/session authority for durable owner fencing', async () => {
    createClerkClient.mockResolvedValue({
      session: {
        id: 'session_authority',
        user: { id: 'user_authority' },
        getToken: vi.fn(),
      },
    });

    const { getAuthAuthority } = await importAuthManager();

    await expect(getAuthAuthority()).resolves.toEqual({
      userId: 'user_authority',
      accountId: 'user_authority',
      sessionId: 'session_authority',
    });
  });

  it('treats a new session for the same account as the same durable owner', async () => {
    const { sameAccountAuthority } = await importAuthManager();

    expect(sameAccountAuthority(
      { userId: 'user-1', accountId: 'user-1', sessionId: 'session-2' },
      { userId: 'user-1', accountId: 'user-1', sessionId: 'session-1' },
    )).toBe(true);
    expect(sameAccountAuthority(
      { userId: 'user-1', sessionId: 'session-2' },
      { userId: 'user-1', accountId: 'user-1', sessionId: 'session-1' },
    )).toBe(true);
    expect(sameAccountAuthority(
      { userId: 'user-2', accountId: 'user-2', sessionId: 'session-1' },
      { userId: 'user-1', accountId: 'user-1', sessionId: 'session-1' },
    )).toBe(false);
    expect(sameAccountAuthority(
      { userId: 'user-1', accountId: 'org-a', sessionId: 'session-1' },
      { userId: 'user-1', accountId: 'org-b', sessionId: 'session-1' },
    )).toBe(false);
    expect(sameAccountAuthority(null, { userId: 'user-1', accountId: 'user-1', sessionId: 'session-1' })).toBe(false);
    expect(sameAccountAuthority({ userId: 'user-1', accountId: 'user-1', sessionId: 'session-1' }, null)).toBe(false);
  });

  it('issues a live token for the same account under a new session and refuses other accounts', async () => {
    const getToken = vi.fn(async () => 'fresh-token');
    createClerkClient.mockResolvedValue({
      session: {
        id: 'session-new',
        user: { id: 'user-1' },
        getToken,
      },
    });

    const { getAuthTokenForAuthority } = await importAuthManager();

    await expect(getAuthTokenForAuthority({ userId: 'user-1', accountId: 'user-1', sessionId: 'session-old' }))
      .resolves.toBe('fresh-token');
    await expect(getAuthTokenForAuthority({ userId: 'user-2', accountId: 'user-2', sessionId: 'session-old' }))
      .resolves.toBeNull();
    expect(getToken).toHaveBeenCalledOnce();
  });

  it('surfaces auth transport failures from readAuthAuthority instead of reporting signed-out', async () => {
    createClerkClient.mockRejectedValue(new Error('clerk transport down'));

    const { readAuthAuthority, getAuthAuthority } = await importAuthManager();

    await expect(readAuthAuthority()).rejects.toThrow('clerk transport down');
    await expect(getAuthAuthority()).resolves.toBeNull();
  });

  it('returns null instead of requesting a token when there is no session', async () => {
    createClerkClient.mockResolvedValue({ session: null, addListener: vi.fn() });

    const { getAuthToken } = await importAuthManager();

    await expect(getAuthToken()).resolves.toBeNull();
  });

  it('opens the Sploot web sign-in page instead of the extension popup', async () => {
    createClerkClient.mockResolvedValue({
      session: null,
      addListener: vi.fn(listener => {
        clerkListeners.push(listener);
        return () => undefined;
      }),
    });

    const { promptUserSignIn, setupAuthBridge } = await importAuthManager();
    setupAuthBridge();

    const signInPromise = promptUserSignIn();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://sploot.test/sign-in' });
    expect(chromeMock.action.openPopup).not.toHaveBeenCalled();

    clerkListeners[0]({
      user: { id: 'user_789' },
      session: { id: 'session_789', expireAt: null },
    });

    await expect(signInPromise).resolves.toBe(true);
  });

  it('resolves the sign-in prompt when the background Clerk client observes a synced web session', async () => {
    createClerkClient.mockResolvedValue({
      session: {
        id: 'session_web',
        user: { id: 'user_web' },
        expireAt: new Date('2026-05-18T12:00:00.000Z'),
        getToken: vi.fn(),
      },
      addListener: vi.fn(listener => {
        clerkListeners.push(listener);
        return () => undefined;
      }),
    });

    const { promptUserSignIn } = await importAuthManager();

    await expect(promptUserSignIn()).resolves.toBe(true);

    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://sploot.test/sign-in' });
    expect(chromeMock.action.openPopup).not.toHaveBeenCalled();
  });

  it('closes its owned sign-in tab after successful auth', async () => {
    createClerkClient.mockResolvedValue({
      session: null,
      addListener: vi.fn(listener => {
        clerkListeners.push(listener)
        return () => undefined
      }),
    })
    chromeMock.tabs.create.mockResolvedValue({ id: 77 })
    chromeMock.tabs.get.mockResolvedValue({ id: 77, url: 'https://sploot.test/sign-in' })

    const { promptUserSignIn, setupAuthBridge } = await importAuthManager()
    setupAuthBridge()
    const signInPromise = promptUserSignIn()
    await new Promise(resolve => setTimeout(resolve, 0))
    clerkListeners[0]({ user: { id: 'user_tab' }, session: { id: 'session_tab', expireAt: null } })

    await expect(signInPromise).resolves.toBe(true)
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith(77)
  })

  it('does not close a sign-in tab after the user navigates it away', async () => {
    createClerkClient.mockResolvedValue({
      session: null,
      addListener: vi.fn(listener => {
        clerkListeners.push(listener)
        return () => undefined
      }),
    })
    chromeMock.tabs.create.mockResolvedValue({ id: 78 })
    chromeMock.tabs.get.mockResolvedValue({ id: 78, url: 'https://sploot.test/library' })

    const { promptUserSignIn, setupAuthBridge } = await importAuthManager()
    setupAuthBridge()
    const signInPromise = promptUserSignIn()
    await new Promise(resolve => setTimeout(resolve, 0))
    clerkListeners[0]({ user: { id: 'user_tab' }, session: { id: 'session_tab', expireAt: null } })

    await expect(signInPromise).resolves.toBe(true)
    expect(chromeMock.tabs.remove).not.toHaveBeenCalled()
  })

  it('closes its owned sign-in tab after the wait aborts', async () => {
    createClerkClient.mockResolvedValue({ session: null, addListener: vi.fn() })
    chromeMock.tabs.create.mockResolvedValue({ id: 79 })
    chromeMock.tabs.get.mockResolvedValue({ id: 79, url: 'https://sploot.test/sign-in' })
    vi.useFakeTimers()
    try {
      const { promptUserSignIn } = await importAuthManager()
      const signInPromise = promptUserSignIn()
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(60000)
      await expect(signInPromise).resolves.toBe(false)
      expect(chromeMock.tabs.remove).toHaveBeenCalledWith(79)
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes its owned sign-in tab when the wait aborts', async () => {
    createClerkClient.mockResolvedValue({ session: null, addListener: vi.fn() })
    chromeMock.tabs.create.mockResolvedValue({ id: 80 })
    chromeMock.tabs.get.mockResolvedValue({ id: 80, url: 'https://sploot.test/sign-in' })

    const { promptUserSignIn } = await importAuthManager()
    const controller = new AbortController()
    const signInPromise = promptUserSignIn(controller.signal)
    await Promise.resolve()
    await Promise.resolve()
    controller.abort()

    await expect(signInPromise).resolves.toBe(false)
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith(80)
  })

  it('retries Clerk sync initialization and observes a later web sign-in', async () => {
    const clerk = {
      session: null,
      addListener: vi.fn(listener => {
        clerkListeners.push(listener)
        return () => undefined
      }),
    }
    createClerkClient
      .mockRejectedValueOnce(new Error('sync host unavailable'))
      .mockResolvedValue(clerk)

    const { promptUserSignIn, setupAuthBridge } = await importAuthManager()
    setupAuthBridge()
    const signInPromise = promptUserSignIn()
    await vi.waitFor(() => expect(clerkListeners).toHaveLength(1), { timeout: 1000 })
    clerkListeners[0]({ user: { id: 'retry-user' }, session: { id: 'retry-session', expireAt: null } })

    await expect(signInPromise).resolves.toBe(true)
  })

  it('resolves sign-in waiters when the persistent Clerk listener observes sign-in', async () => {
    const signedInState: AuthState = {
      status: 'signed-in',
      userId: 'user_456',
      sessionId: 'session_456',
    };
    createClerkClient.mockResolvedValue({
      session: null,
      addListener: vi.fn(listener => {
        clerkListeners.push(listener);
        return () => undefined;
      }),
    });
    const { setupAuthBridge, waitForSignIn } = await importAuthManager();
    setupAuthBridge();

    const waitPromise = waitForSignIn(1000);
    await new Promise(resolve => setTimeout(resolve, 0));
    clerkListeners[0]({
      user: { id: signedInState.userId },
      session: { id: signedInState.sessionId, expireAt: null },
    });

    await expect(waitPromise).resolves.toBe(true);
  });

  it('broadcasts a sanitized Clerk event so an open popup can refresh without polling', async () => {
    const addListener = vi.fn((listener: (resources: unknown) => void) => {
      clerkListeners.push(listener);
      return () => undefined;
    });
    createClerkClient.mockResolvedValue({ session: null, addListener });

    const { setupAuthBridge } = await importAuthManager();
    setupAuthBridge();
    await new Promise(resolve => setTimeout(resolve, 0));
    chromeMock.runtime.sendMessage.mockClear();

    const signedInState: AuthState = {
      status: 'signed-in',
      userId: 'user_live',
      sessionId: 'session_live',
      expiresAt: 1780000000000,
    };
    clerkListeners[0]({
      user: { id: signedInState.userId },
      session: {
        id: signedInState.sessionId,
        expireAt: new Date(signedInState.expiresAt!),
      },
      token: 'must-never-cross-the-message-boundary',
    });

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
      type: AUTH_MESSAGES.STATE_CHANGED,
      payload: signedInState,
    });
    expect(JSON.stringify(chromeMock.runtime.sendMessage.mock.calls)).not.toContain('must-never-cross');
  });

  it('does not use a polling interval and cleans up a timed-out waiter', async () => {
    createClerkClient.mockResolvedValue({ session: null, addListener: vi.fn() });
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    const { waitForSignIn } = await importAuthManager();
    await expect(waitForSignIn(1)).resolves.toBe(false);

    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it('recreates the event boundary after a service-worker restart', async () => {
    const makeClerk = (sessionId: string) => ({
      session: {
        id: sessionId,
        user: { id: 'restart-user' },
        expireAt: null,
        getToken: vi.fn(),
      },
      addListener: vi.fn(listener => {
        clerkListeners.push(listener);
        return () => undefined;
      }),
    });
    createClerkClient.mockResolvedValueOnce(makeClerk('session-before-restart'));
    const firstWorker = await importAuthManager();
    firstWorker.setupAuthBridge();
    await new Promise(resolve => setTimeout(resolve, 0));

    createClerkClient.mockResolvedValueOnce(makeClerk('session-after-restart'));
    const restartedWorker = await importAuthManager();
    restartedWorker.setupAuthBridge();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(createClerkClient).toHaveBeenCalledTimes(2);
    expect(messageListeners).toHaveLength(2);
    let response: unknown;
    messageListeners[1]({ type: AUTH_MESSAGES.REQUEST_STATE }, { id: chromeMock.runtime.id }, next => {
      response = next;
    });
    expect(response).toEqual({
      state: {
        status: 'signed-in',
        userId: 'restart-user',
        sessionId: 'session-after-restart',
        expiresAt: null,
      },
    });
  });

  it('ignores foreign senders and stale inbound state messages', async () => {
    createClerkClient.mockResolvedValue({
      session: null,
      addListener: vi.fn(listener => {
        clerkListeners.push(listener);
        return () => undefined;
      }),
    });
    const { setupAuthBridge } = await importAuthManager();
    setupAuthBridge();
    await new Promise(resolve => setTimeout(resolve, 0));
    clerkListeners[0]({
      user: { id: 'current-user' },
      session: { id: 'current-session', expireAt: null },
    });

    let foreignResponse: unknown;
    expect(
      messageListeners[0](
        { type: AUTH_MESSAGES.STATE_CHANGED, payload: { status: 'signed-in', userId: 'foreign' } },
        { id: 'foreign-extension' },
        response => {
          foreignResponse = response;
        }
      )
    ).toBe(false);
    expect(foreignResponse).toBeUndefined();

    messageListeners[0](
      { type: AUTH_MESSAGES.STATE_CHANGED, payload: { status: 'signed-out' } },
      { id: chromeMock.runtime.id },
      () => undefined
    );
    let stateResponse: unknown;
    messageListeners[0]({ type: AUTH_MESSAGES.REQUEST_STATE }, { id: chromeMock.runtime.id }, response => {
      stateResponse = response;
    });
    expect(stateResponse).toEqual({
      state: {
        status: 'signed-in',
        userId: 'current-user',
        sessionId: 'current-session',
        expiresAt: null,
      },
    });
  });

  it('rejects diagnostics at the runtime message handler in production', async () => {
    buildMode.dev = false;
    const { setupAuthBridge } = await importAuthManager();
    setupAuthBridge();
    const response = vi.fn();

    expect(messageListeners[0]({ type: AUTH_MESSAGES.RUN_DIAGNOSTICS }, {}, response)).toBe(false);
    expect(response).not.toHaveBeenCalled();
  });

  it('keeps diagnostics available through the runtime message handler in development', async () => {
    createClerkClient.mockResolvedValue({ session: null });
    const { setupAuthBridge } = await importAuthManager();
    setupAuthBridge();
    const response = vi.fn();

    expect(messageListeners[0]({ type: AUTH_MESSAGES.RUN_DIAGNOSTICS }, {}, response)).toBe(true);
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({
      snapshot: expect.objectContaining({ status: 'signed-out' }),
    }));
  });
});
