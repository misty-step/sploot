import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { ExportObjectReader } from '@/lib/export/export-objects';
import { streamExportPartZip, type ExportZipEntry } from '@/lib/export/export-zip';
import type { ExportFailure } from '@/lib/export/export-policy';

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function streamOf(bytes: Uint8Array, chunkSize = 4): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

function readerFor(
  objects: Record<string, Uint8Array | 'missing' | 'error'>,
): ExportObjectReader {
  return async (url: string) => {
    const value = objects[url];
    if (value === undefined || value === 'missing') {
      return { ok: false, reason: 'object_missing' };
    }
    if (value === 'error') {
      return { ok: false, reason: 'object_fetch_failed' };
    }
    return { ok: true, body: streamOf(value) };
  };
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function entry(
  assetId: string,
  bytes: Uint8Array,
  overrides: Partial<ExportZipEntry> = {},
): ExportZipEntry {
  return {
    assetId,
    archivePath: `assets/${assetId}.png`,
    url: `https://abc.public.blob.vercel-storage.com/u/${assetId}.png`,
    sha256: sha256Hex(bytes),
    size: bytes.length,
    ...overrides,
  };
}

describe('streamExportPartZip', () => {
  it('streams a valid zip whose entries byte-match the source objects', async () => {
    const a = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const b = new Uint8Array([255, 254, 253]);
    const entries = [entry('asset1', a), entry('asset2', b)];
    const reader = readerFor({
      [entries[0].url]: a,
      [entries[1].url]: b,
    });

    let outcome: { failures: ExportFailure[]; bytesStreamed: number } | null = null;
    const zipBytes = await collect(
      streamExportPartZip({
        entries,
        reader,
        onComplete: (result) => {
          outcome = result;
        },
      }),
    );

    const unzipped = unzipSync(zipBytes);
    expect(Object.keys(unzipped).sort()).toEqual(['assets/asset1.png', 'assets/asset2.png']);
    expect(new Uint8Array(unzipped['assets/asset1.png'])).toEqual(a);
    expect(new Uint8Array(unzipped['assets/asset2.png'])).toEqual(b);

    expect(outcome).not.toBeNull();
    expect(outcome!.failures).toEqual([]);
    expect(outcome!.bytesStreamed).toBe(zipBytes.length);
  });

  it('skips a missing object, records it, and still delivers the rest', async () => {
    const ok = new Uint8Array([9, 9, 9, 9]);
    const entries = [
      entry('gone', new Uint8Array([1])),
      entry('kept', ok),
    ];
    const reader = readerFor({
      [entries[0].url]: 'missing',
      [entries[1].url]: ok,
    });

    let outcome: { failures: ExportFailure[]; bytesStreamed: number } | null = null;
    const zipBytes = await collect(
      streamExportPartZip({
        entries,
        reader,
        onComplete: (result) => {
          outcome = result;
        },
      }),
    );

    const unzipped = unzipSync(zipBytes);
    expect(Object.keys(unzipped)).toEqual(['assets/kept.png']);
    expect(outcome!.failures).toEqual([
      { assetId: 'gone', archivePath: 'assets/gone.png', reason: 'object_missing' },
    ]);
  });

  it('records a checksum mismatch instead of pretending the bytes are good', async () => {
    const actual = new Uint8Array([7, 7, 7, 7, 7]);
    const lied = entry('tampered', actual, { sha256: sha256Hex(new Uint8Array([0])) });
    const reader = readerFor({ [lied.url]: actual });

    let outcome: { failures: ExportFailure[]; bytesStreamed: number } | null = null;
    const zipBytes = await collect(
      streamExportPartZip({
        entries: [lied],
        reader,
        onComplete: (result) => {
          outcome = result;
        },
      }),
    );

    // The bytes were already streamed; honesty lives in the recorded failure.
    const unzipped = unzipSync(zipBytes);
    expect(Object.keys(unzipped)).toEqual(['assets/tampered.png']);
    expect(outcome!.failures).toEqual([
      { assetId: 'tampered', archivePath: 'assets/tampered.png', reason: 'checksum_mismatch' },
    ]);
  });

  it('produces an empty-but-valid zip when every object is unavailable', async () => {
    const only = entry('gone', new Uint8Array([1]));
    const reader = readerFor({ [only.url]: 'error' });

    let outcome: { failures: ExportFailure[]; bytesStreamed: number } | null = null;
    const zipBytes = await collect(
      streamExportPartZip({
        entries: [only],
        reader,
        onComplete: (result) => {
          outcome = result;
        },
      }),
    );

    expect(Object.keys(unzipSync(zipBytes))).toEqual([]);
    expect(outcome!.failures).toEqual([
      { assetId: 'gone', archivePath: 'assets/gone.png', reason: 'object_fetch_failed' },
    ]);
  });
});
