import { describe, expect, it, vi } from 'vitest';
import { SplootApiError, type SplootClient } from '../client.js';
import { runSaveTool, runSearchTool } from '../tools.js';

function fakeClient(overrides: Partial<SplootClient> = {}): SplootClient {
  return {
    search: vi.fn(),
    saveUrl: vi.fn(),
    saveBytes: vi.fn(),
    ...overrides,
  } as unknown as SplootClient;
}

describe('runSearchTool', () => {
  it('returns the search response as JSON text content', async () => {
    const client = fakeClient({
      search: vi.fn().mockResolvedValue({ results: [{ id: 'a1' }], query: 'cat', total: 1 }),
    });

    const result = await runSearchTool(client, { query: 'cat' });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toMatchObject({ total: 1 });
    expect(client.search).toHaveBeenCalledWith('cat', { limit: undefined, threshold: undefined });
  });

  it('passes limit and threshold through to the client', async () => {
    const client = fakeClient({ search: vi.fn().mockResolvedValue({ results: [] }) });

    await runSearchTool(client, { query: 'cat', limit: 5, threshold: 0.5 });

    expect(client.search).toHaveBeenCalledWith('cat', { limit: 5, threshold: 0.5 });
  });

  it('returns an error result when the client throws SplootApiError', async () => {
    const client = fakeClient({
      search: vi.fn().mockRejectedValue(new SplootApiError('Unauthorized', 401, { error: 'Unauthorized' })),
    });

    const result = await runSearchTool(client, { query: 'cat' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('401');
    expect(result.content[0].text).toContain('Unauthorized');
  });
});

describe('runSaveTool', () => {
  it('calls saveUrl when url is provided', async () => {
    const client = fakeClient({
      saveUrl: vi.fn().mockResolvedValue({ success: true, isDuplicate: false, asset: { id: 'a1' } }),
    });

    const result = await runSaveTool(client, { url: 'https://example.com/a.png' });

    expect(client.saveUrl).toHaveBeenCalledWith('https://example.com/a.png');
    expect(client.saveBytes).not.toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
  });

  it('calls saveBytes with decoded bytes when bytesBase64 is provided', async () => {
    const client = fakeClient({
      saveBytes: vi.fn().mockResolvedValue({ success: true, isDuplicate: false, asset: { id: 'a2' } }),
    });
    const base64 = Buffer.from('hello').toString('base64');

    await runSaveTool(client, { bytesBase64: base64, filename: 'x.png', mimeType: 'image/png', tags: ['t'] });

    expect(client.saveBytes).toHaveBeenCalledTimes(1);
    const [bytes, filename, mimeType, tags] = (client.saveBytes as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(Buffer.from(bytes).toString()).toBe('hello');
    expect(filename).toBe('x.png');
    expect(mimeType).toBe('image/png');
    expect(tags).toEqual(['t']);
  });

  it('defaults filename and mimeType when saving by bytes', async () => {
    const client = fakeClient({
      saveBytes: vi.fn().mockResolvedValue({ success: true, isDuplicate: false, asset: { id: 'a3' } }),
    });

    await runSaveTool(client, { bytesBase64: Buffer.from('x').toString('base64') });

    const [, filename, mimeType] = (client.saveBytes as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(filename).toBe('upload.png');
    expect(mimeType).toBe('image/png');
  });

  it('errors when neither url nor bytesBase64 is given', async () => {
    const client = fakeClient();

    const result = await runSaveTool(client, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/url.*bytesBase64|provide/i);
    expect(client.saveUrl).not.toHaveBeenCalled();
    expect(client.saveBytes).not.toHaveBeenCalled();
  });

  it('errors when both url and bytesBase64 are given', async () => {
    const client = fakeClient();

    const result = await runSaveTool(client, { url: 'https://example.com/a.png', bytesBase64: 'abc' });

    expect(result.isError).toBe(true);
    expect(client.saveUrl).not.toHaveBeenCalled();
    expect(client.saveBytes).not.toHaveBeenCalled();
  });
});
