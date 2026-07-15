import { createHash } from 'node:crypto';
import { Zip, ZipPassThrough } from 'fflate';
import type { ExportObjectReader } from './export-objects';
import type { ExportFailure } from './export-policy';

/**
 * Streaming zip assembly for one export part.
 *
 * Memory stays bounded to in-flight chunks: object bytes are pulled from the
 * provider stream, hashed, and pushed through fflate's store-mode zipper
 * straight into the response stream — the part is never buffered whole.
 *
 * Failure honesty: an object that cannot be opened is skipped and recorded;
 * an object whose bytes no longer match the recorded sha256 is recorded as a
 * checksum mismatch (its bytes were already streamed). The completed outcome
 * is handed to `onComplete` BEFORE the stream closes, so by the time a
 * client sees EOF the server has durably recorded what this part contained.
 * A client abort never reaches `onComplete` — an interrupted part is not
 * "served".
 */

export interface ExportZipEntry {
  assetId: string;
  archivePath: string;
  url: string;
  sha256: string;
  size: number;
}

export interface ExportPartOutcome {
  failures: ExportFailure[];
  bytesStreamed: number;
}

export interface StreamExportPartZipOptions {
  entries: ExportZipEntry[];
  reader: ExportObjectReader;
  onComplete?: (outcome: ExportPartOutcome) => void | Promise<void>;
}

const BACKPRESSURE_POLL_MS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function streamExportPartZip(options: StreamExportPartZipOptions): ReadableStream<Uint8Array> {
  const { entries, reader, onComplete } = options;
  let canceled = false;

  async function run(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    const failures: ExportFailure[] = [];
    let bytesStreamed = 0;
    let zipError: Error | null = null;

    const zip = new Zip((error, chunk) => {
      if (error) {
        zipError = error;
        return;
      }
      if (canceled || !chunk || chunk.length === 0) return;
      bytesStreamed += chunk.length;
      controller.enqueue(chunk);
    });

    async function waitForCapacity(): Promise<void> {
      while (
        !canceled &&
        controller.desiredSize !== null &&
        controller.desiredSize <= 0
      ) {
        await sleep(BACKPRESSURE_POLL_MS);
      }
    }

    try {
      for (const entry of entries) {
        if (canceled) return;

        const opened = await reader(entry.url);
        if (!opened.ok) {
          failures.push({
            assetId: entry.assetId,
            archivePath: entry.archivePath,
            reason: opened.reason,
          });
          continue;
        }

        const zipEntry = new ZipPassThrough(entry.archivePath);
        zip.add(zipEntry);

        const hash = createHash('sha256');
        const objectReader = opened.body.getReader();
        try {
          for (;;) {
            if (canceled) return;
            await waitForCapacity();
            const { done, value } = await objectReader.read();
            if (done) break;
            if (!value || value.length === 0) continue;
            hash.update(value);
            zipEntry.push(value, false);
            if (zipError) throw zipError;
          }
        } finally {
          objectReader.releaseLock();
        }

        zipEntry.push(new Uint8Array(0), true);
        if (zipError) throw zipError;

        if (hash.digest('hex') !== entry.sha256) {
          failures.push({
            assetId: entry.assetId,
            archivePath: entry.archivePath,
            reason: 'checksum_mismatch',
          });
        }
      }

      zip.end();
      if (zipError) throw zipError;
      if (canceled) return;

      if (onComplete) {
        await onComplete({ failures, bytesStreamed });
      }
      controller.close();
    } catch (error) {
      if (!canceled) {
        controller.error(error);
      }
    }
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      void run(controller);
    },
    cancel() {
      canceled = true;
    },
  });
}
