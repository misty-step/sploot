import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextMenuSaveJob } from './context-menu-save-queue';
import * as auth from './auth-manager';
import * as queue from './context-menu-save-queue';
import * as screenshot from './screenshot';
import { setupContextMenu } from './context-menu';

// Only browser/network boundaries are replaced. Admission, auth storage, fetch,
// conversion, durable recovery and credential-fenced multipart upload are real.
vi.mock('./notifications', () => ({ showSuccessNotification: vi.fn(), showErrorNotification: vi.fn() }));

const INSTANCE = 'http://127.0.0.1:3001';
const OTHER_INSTANCE = 'https://other-library.test';
const SOURCE = 'https://source.test/original.png';
const OWNER = { userId: 'account-a', accountId: `${INSTANCE}/account-a`, sessionId: 'device-a' };
const ACTIVE_TAB: chrome.tabs.Tab = {
  windowId: 1, url: 'https://page.test/image', index: 0, groupId: -1,
  active: true, highlighted: true, selected: true, pinned: false,
  frozen: false, incognito: false, discarded: false, autoDiscardable: true,
};
let stored: Record<string, unknown>;
let click: (info: { menuItemId: string; srcUrl: string }) => Promise<void>;
let sourceRequests: string[];
let download: (url: string) => Promise<Response>;
let uploads: Array<{ url: string; authorization: string | null; bytes: string }>;

function connect(instanceUrl: string, userId: string | null, sessionId = 'device-a'): void {
  stored['sploot:connection'] = {
    instanceUrl,
    ...(userId ? { session: {
      token: `spld_${sessionId}`,
      user: { id: userId, email: `${userId}@example.test` },
      sessionId,
      expiresAt: Date.now() + 86_400_000,
    } } : {}),
  };
}

function retained(): ContextMenuSaveJob[] {
  return (stored[queue.CONTEXT_MENU_QUEUE_KEY] ?? []) as ContextMenuSaveJob[];
}

function imageResponse(bytes: string): Response {
  return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
}

beforeEach(async () => {
  stored = {};
  sourceRequests = [];
  uploads = [];
  download = async () => imageResponse('original');
  connect(INSTANCE, 'account-a');
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => structuredClone({ [key]: stored[key] })),
        set: vi.fn(async (value: Record<string, unknown>) => { Object.assign(stored, structuredClone(value)); }),
        remove: vi.fn(async (key: string) => { delete stored[key]; }),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: {
      sendMessage: vi.fn(async () => undefined),
      onMessage: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
    },
    alarms: { create: vi.fn(async () => undefined), clear: vi.fn(async () => true), onAlarm: { addListener: vi.fn() } },
    contextMenus: { onClicked: { addListener: vi.fn(listener => { click = listener; }) } },
    tabs: {
      query: vi.fn(async () => [ACTIVE_TAB]),
      captureVisibleTab: vi.fn(async () => `data:image/png;base64,${btoa('original-screenshot')}`),
    },
  });
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://source.test/')) {
      sourceRequests.push(url);
      return download(url);
    }
    if (url.endsWith('/api/upload')) {
      const file = (init?.body as FormData).get('file') as File;
      uploads.push({ url, authorization: new Headers(init?.headers).get('Authorization'), bytes: await file.text() });
      return Response.json({ success: true, asset: { id: 'saved', blobUrl: '/media/saved' }, isDuplicate: false });
    }
    if (url.endsWith('/api/auth/device/session')) return new Response(null, { status: 204 });
    throw new Error(`Unexpected capture fixture request: ${url}`);
  }));
  setupContextMenu();
  await queue.recoverPendingContextMenuSaves('startup');
});

afterEach(async () => {
  await queue.recoverPendingContextMenuSaves();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.sequential('capture admission ownership', () => {
  it('keeps a delayed response body owned through disconnect and another account until its owner reconnects', async () => {
    let finishDownload!: () => void;
    download = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        finishDownload = () => {
          controller.enqueue(new TextEncoder().encode('delayed-original'));
          controller.close();
        };
      },
    }), { headers: { 'Content-Type': 'image/png' } });
    const capture = click({ menuItemId: 'save-to-sploot', srcUrl: SOURCE });
    await vi.waitFor(() => expect(sourceRequests).toEqual([SOURCE]));
    await auth.disconnectDevice();
    finishDownload();
    await capture;
    await queue.recoverPendingContextMenuSaves();

    expect(retained()).toEqual([expect.objectContaining({
      state: 'paused', owner: OWNER, targetInstanceUrl: INSTANCE, sourceBytes: btoa('delayed-original'),
    })]);
    expect(uploads).toEqual([]);
    connect(INSTANCE, 'account-b', 'device-b');
    await queue.recoverPendingContextMenuSaves('startup');
    expect(retained()[0]).toMatchObject({ state: 'paused', owner: OWNER });
    expect(uploads).toEqual([]);

    connect(INSTANCE, 'account-a', 'device-a-reconnected');
    await queue.recoverPendingContextMenuSaves('startup');
    expect(uploads).toEqual([{
      url: `${INSTANCE}/api/upload`, authorization: 'Bearer spld_device-a-reconnected', bytes: 'delayed-original',
    }]);
    expect(retained()).toEqual([]);
    expect(sourceRequests).toEqual([SOURCE]);
  });

  it('retains the initiating account even when a source has not obtained a fetch slot at account switch', async () => {
    const releases: Array<(response: Response) => void> = [];
    download = () => {
      const { promise, resolve } = Promise.withResolvers<Response>();
      releases.push(resolve);
      return promise;
    };
    const first = click({ menuItemId: 'save-to-sploot', srcUrl: 'https://source.test/first.png' });
    const second = click({ menuItemId: 'save-to-sploot', srcUrl: 'https://source.test/second.png' });
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    const third = click({ menuItemId: 'save-to-sploot', srcUrl: 'https://source.test/third.png' });
    connect(OTHER_INSTANCE, 'account-b', 'device-b');
    releases.splice(0, 2).forEach(release => release(imageResponse('first-two')));
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()!(imageResponse('third-original'));
    await Promise.all([first, second, third]);
    await queue.recoverPendingContextMenuSaves();

    expect(retained().find(job => job.filename === 'third.png')).toMatchObject({
      state: 'paused', owner: OWNER, targetInstanceUrl: INSTANCE, sourceBytes: btoa('third-original'),
    });
    expect(retained().every(job => job.state === 'paused')).toBe(true);
    expect(uploads).toEqual([]);
  });

  it('keeps initially unpaired bytes ownerless on their original instance after a delayed source and instance switch', async () => {
    connect(INSTANCE, null);
    const { promise: response, resolve: finishDownload } = Promise.withResolvers<Response>();
    download = () => response;
    const capture = click({ menuItemId: 'save-to-sploot', srcUrl: SOURCE });
    await vi.waitFor(() => expect(sourceRequests).toEqual([SOURCE]));
    await auth.setInstanceUrl(OTHER_INSTANCE);
    connect(OTHER_INSTANCE, 'account-a', 'other-device');
    finishDownload(imageResponse('unpaired-original'));
    await capture;
    await queue.recoverPendingContextMenuSaves();

    expect(retained()).toEqual([expect.objectContaining({
      state: 'awaiting-auth', targetInstanceUrl: INSTANCE, sourceBytes: btoa('unpaired-original'),
    })]);
    expect(retained()[0].owner).toBeUndefined();
    expect(uploads).toEqual([]);
    connect(INSTANCE, 'account-a');
    await queue.recoverPendingContextMenuSaves('startup');
    expect(uploads).toEqual([{
      url: `${INSTANCE}/api/upload`, authorization: 'Bearer spld_device-a', bytes: 'unpaired-original',
    }]);
    expect(retained()).toEqual([]);
  });

  it('does not reassign direct bytes while their arrayBuffer conversion is delayed across account and instance changes', async () => {
    const context = await auth.readCaptureContext();
    const blob = new Blob(['direct-original'], { type: 'image/png' });
    const bytes = await blob.arrayBuffer();
    const { promise: conversionBytes, resolve: finishConversion } = Promise.withResolvers<ArrayBuffer>();
    const conversion = vi.spyOn(blob, 'arrayBuffer').mockReturnValue(conversionBytes);
    const capture = queue.enqueueCapturedSave(blob, 'direct.png', context);
    await vi.waitFor(() => expect(conversion).toHaveBeenCalledOnce());
    await auth.disconnectDevice();
    await auth.setInstanceUrl(OTHER_INSTANCE);
    connect(OTHER_INSTANCE, 'account-b', 'device-b');
    finishConversion(bytes);
    await capture;
    await queue.recoverPendingContextMenuSaves();

    expect(retained()).toEqual([expect.objectContaining({
      state: 'paused', owner: OWNER, targetInstanceUrl: INSTANCE, sourceBytes: btoa('direct-original'),
    })]);
    expect(uploads).toEqual([]);
    connect(INSTANCE, 'account-a', 'device-a-reconnected');
    await queue.recoverPendingContextMenuSaves('startup');
    expect(uploads).toEqual([{
      url: `${INSTANCE}/api/upload`, authorization: 'Bearer spld_device-a-reconnected', bytes: 'direct-original',
    }]);
    expect(retained()).toEqual([]);
  });

  it('binds screenshot ownership before both active-tab lookup and screenshot generation', async () => {
    const { promise: tabs, resolve: finishQuery } = Promise.withResolvers<chrome.tabs.Tab[]>();
    const { promise: dataUrl, resolve: finishScreenshot } = Promise.withResolvers<string>();
    vi.mocked(chrome.tabs.query).mockImplementation(() => tabs);
    vi.mocked(chrome.tabs.captureVisibleTab).mockImplementation(() => dataUrl);
    const capture = screenshot.captureAndSaveVisibleTab();
    await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalledOnce());
    connect(OTHER_INSTANCE, 'account-a', 'other-device');
    finishQuery([ACTIVE_TAB]);
    await vi.waitFor(() => expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledOnce());
    connect(INSTANCE, 'account-b', 'device-b');
    finishScreenshot(`data:image/png;base64,${btoa('original-screenshot')}`);
    await capture;
    await queue.recoverPendingContextMenuSaves();

    expect(retained()).toEqual([expect.objectContaining({
      state: 'paused', owner: OWNER, targetInstanceUrl: INSTANCE, sourceBytes: btoa('original-screenshot'),
    })]);
    expect(uploads).toEqual([]);
    connect(INSTANCE, 'account-a', 'device-a-reconnected');
    await queue.recoverPendingContextMenuSaves('startup');
    expect(uploads).toEqual([{
      url: `${INSTANCE}/api/upload`, authorization: 'Bearer spld_device-a-reconnected', bytes: 'original-screenshot',
    }]);
    expect(retained()).toEqual([]);
  });
});
