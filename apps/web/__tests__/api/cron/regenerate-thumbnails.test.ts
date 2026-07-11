import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { GET } from '@/app/api/cron/regenerate-thumbnails/route';
import { NextRequest } from 'next/server';

// Mock next/headers
const mockHeaders = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

// Mock lib/db
const mockPrisma = {
  asset: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
};

let mockDatabaseAvailable = true;

vi.mock('@/lib/db', () => ({
  get prisma() {
    return mockDatabaseAvailable ? mockPrisma : null;
  },
  get databaseAvailable() {
    return mockDatabaseAvailable;
  },
}));

// Mock @vercel/blob — uploads must not hit the network
const mockPut = vi.fn();
const mockDel = vi.fn();
vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => mockPut(...args),
  del: (...args: unknown[]) => mockDel(...args),
}));

global.fetch = vi.fn();

interface FetchMock {
  mockResolvedValueOnce(value: unknown): FetchMock;
}

const fetchMock = global.fetch as unknown as FetchMock;

function makeRequest(query = '') {
  return new NextRequest(`http://localhost/api/cron/regenerate-thumbnails${query}`);
}

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 80, b: 200 } },
  })
    .png()
    .toBuffer();
}

function fetchResponse(buffer: Buffer) {
  return {
    ok: true,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}

describe('/api/cron/regenerate-thumbnails', () => {
  const CRON_SECRET = 'test-cron-secret';

  const baseAsset = {
    id: 'asset-1',
    blobUrl: 'https://blob.example/original.png',
    thumbnailUrl: 'https://blob.example/original-thumb.png',
    pathname: 'user/original.png',
    mime: 'image/png',
    width: 800,
    height: 1000,
  };

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    mockDatabaseAvailable = true;
    vi.clearAllMocks();
    mockHeaders.mockReturnValue({
      get: vi.fn((key: string) =>
        key === 'authorization' ? `Bearer ${CRON_SECRET}` : null
      ),
    });
    mockPut.mockResolvedValue({
      url: 'https://blob.example/original-thumb-new.png',
      pathname: 'user/original-thumb-new.png',
    });
    mockDel.mockResolvedValue(undefined);
    mockPrisma.asset.update.mockResolvedValue({});
  });

  it('rejects requests without the cron secret', async () => {
    mockHeaders.mockReturnValue({ get: vi.fn(() => null) });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('regenerates a legacy square-cropped thumbnail from the original', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([baseAsset]);
    const legacySquareThumb = await png(256, 256); // the pre-fix crop
    const original = await png(800, 1000);
    fetchMock
      .mockResolvedValueOnce(fetchResponse(legacySquareThumb))
      .mockResolvedValueOnce(fetchResponse(original));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.regenerated).toBe(1);
    expect(body.failed).toBe(0);

    // the uploaded replacement preserves the original's aspect
    const uploadedBuffer = mockPut.mock.calls[0][1] as Buffer;
    const meta = await sharp(uploadedBuffer).metadata();
    expect(Math.abs(meta.width! / meta.height! - 800 / 1000)).toBeLessThan(0.02);

    expect(mockPrisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: {
        thumbnailUrl: 'https://blob.example/original-thumb-new.png',
        thumbnailPath: 'user/original-thumb-new.png',
      },
    });
    expect(mockDel).toHaveBeenCalledWith('https://blob.example/original-thumb.png');
  });

  it('regenerates when the stored thumbnail has disappeared', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([baseAsset]);
    const original = await png(800, 1000);
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce(fetchResponse(original));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.regenerated).toBe(1);
    expect(body.failed).toBe(0);
    expect(mockPrisma.asset.update).toHaveBeenCalledTimes(1);
  });

  it('skips thumbnails whose aspect already matches the original', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([baseAsset]);
    const correctThumb = await png(205, 256); // 800/1000 aspect at 256 edge
    fetchMock.mockResolvedValueOnce(fetchResponse(correctThumb));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.alreadyCorrect).toBe(1);
    expect(body.regenerated).toBe(0);
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockPrisma.asset.update).not.toHaveBeenCalled();
  });

  it('reports failures without aborting the batch and pages via cursor', async () => {
    const second = { ...baseAsset, id: 'asset-2' };
    const third = { ...baseAsset, id: 'asset-3' };
    mockPrisma.asset.findMany.mockResolvedValue([baseAsset, second, third]);
    const correctThumb = await png(205, 256);
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404 }) // asset-1 thumb gone
      .mockResolvedValueOnce({ ok: false, status: 503 }) // asset-1 original unavailable
      .mockResolvedValueOnce(fetchResponse(correctThumb)); // asset-2 fine

    const res = await GET(makeRequest('?limit=2'));
    const body = await res.json();

    expect(body.scanned).toBe(2);
    expect(body.failed).toBe(1);
    expect(body.failures[0].id).toBe('asset-1');
    expect(body.alreadyCorrect).toBe(1);
    expect(body.nextCursor).toBe('asset-2'); // third candidate signals more work
  });
});
