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
    onMessage: {
      addListener: ReturnType<typeof vi.fn>;
    };
  };
  tabs: {
    create: ReturnType<typeof vi.fn>;
  };
}

let messageListeners: Array<(message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean>;
let chromeMock: ChromeMock;

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
      onMessage: {
        addListener: vi.fn(listener => {
          messageListeners.push(listener);
        }),
      },
    },
    tabs: {
      create: vi.fn(),
    },
  };

  vi.stubGlobal('chrome', chromeMock);
  createClerkClient.mockReset();
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
    });

    const { isAuthenticated, setupAuthBridge } = await importAuthManager();
    setupAuthBridge();

    await expect(isAuthenticated()).resolves.toBe(true);

    let response: unknown;
    messageListeners[0](
      { type: AUTH_MESSAGES.REQUEST_STATE },
      {},
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
    createClerkClient.mockResolvedValue({ session: null });

    const { getAuthToken } = await importAuthManager();

    await expect(getAuthToken()).resolves.toBeNull();
  });

  it('opens the Sploot web sign-in page instead of the extension popup', async () => {
    createClerkClient.mockResolvedValue({ session: null });

    const { promptUserSignIn, setupAuthBridge } = await importAuthManager();
    setupAuthBridge();

    const signInPromise = promptUserSignIn();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://sploot.test/sign-in' });
    expect(chromeMock.action.openPopup).not.toHaveBeenCalled();

    const signedInState: AuthState = {
      status: 'signed-in',
      userId: 'user_789',
      sessionId: 'session_789',
    };
    messageListeners[0](
      { type: AUTH_MESSAGES.STATE_UPDATE, payload: signedInState },
      {},
      () => undefined
    );

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
    });

    const { promptUserSignIn } = await importAuthManager();

    await expect(promptUserSignIn()).resolves.toBe(true);

    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://sploot.test/sign-in' });
    expect(chromeMock.action.openPopup).not.toHaveBeenCalled();
  });

  it('resolves sign-in waiters when the popup sends a signed-in state update', async () => {
    const signedInState: AuthState = {
      status: 'signed-in',
      userId: 'user_456',
      sessionId: 'session_456',
    };
    const { setupAuthBridge, waitForSignIn } = await importAuthManager();
    setupAuthBridge();

    const waitPromise = waitForSignIn(1000);
    let response: unknown;
    messageListeners[0](
      { type: AUTH_MESSAGES.STATE_UPDATE, payload: signedInState },
      {},
      nextResponse => {
        response = nextResponse;
      }
    );

    await expect(waitPromise).resolves.toBe(true);
    expect(response).toEqual({ ok: true });
  });

  it('rejects diagnostics at the runtime message handler in production', async () => {
    buildMode.dev = false;
    const { setupAuthBridge } = await importAuthManager();
    setupAuthBridge();
    const response = vi.fn();

    expect(messageListeners[0]({ type: AUTH_MESSAGES.RUN_DIAGNOSTICS }, {}, response)).toBe(false);
    expect(response).not.toHaveBeenCalled();
    expect(createClerkClient).not.toHaveBeenCalled();
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
