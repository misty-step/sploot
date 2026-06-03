import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_MESSAGES, type AuthState } from '../../shared/auth-messages';

const createClerkClient = vi.hoisted(() => vi.fn());

vi.mock('@clerk/chrome-extension/background', () => ({
  createClerkClient,
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

  it('returns null instead of requesting a token when there is no session', async () => {
    createClerkClient.mockResolvedValue({ session: null });

    const { getAuthToken } = await importAuthManager();

    await expect(getAuthToken()).resolves.toBeNull();
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
});
