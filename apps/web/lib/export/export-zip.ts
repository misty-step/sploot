import { createHash } from 'node:crypto';
import { Zip, ZipPassThrough } from 'fflate';
import type { ExportObjectReader } from './export-objects';
import type { ExportFailure } from './export-policy';
import {
  EXPORT_BACKPRESSURE_TIMEOUT_MS,
  EXPORT_STREAM_CHUNK_BYTES,
  EXPORT_STREAM_OUTPUT_QUEUE_BYTES,
  waitForExportCapacity,
} from './export-backpressure';

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
 * "served" and its egress reservation stays charged.
 *
 * Egress honesty: `maxBytes` is the reservation admitted before streaming
 * began. If the real bytes would exceed it (e.g. a provider object drifted
 * past its recorded size), the stream errors instead of exceeding the
 * budget — the cap is mechanical, not estimate-dependent.
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
  /** Hard byte cap (the admitted egress reservation); exceeding it errors the stream. */
  maxBytes?: bigint;
  backpressureTimeoutMs?: number;
  signal?: AbortSignal;
  onComplete?: (outcome: ExportPartOutcome) => void | Promise<void>;
  onFinish?: () => void;
}

export function streamExportPartZip(options: StreamExportPartZipOptions): ReadableStream<Uint8Array> {
  const { entries, reader, maxBytes, backpressureTimeoutMs = EXPORT_BACKPRESSURE_TIMEOUT_MS, signal, onComplete, onFinish } = options;
  let canceled = false;
  let clientCanceled = false;
  let terminalError: Error | null = null;
  let activeRequestController: AbortController | null = null;
  let activeObjectReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const abort = () => {
    canceled = true;
    if (!clientCanceled && !terminalError) terminalError = new Error('export became unavailable during stream');
    activeRequestController?.abort();
    void activeObjectReader?.cancel();
  };

  async function run(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    const failures: ExportFailure[] = [];
    let bytesStreamed = 0;
    let zipError: Error | null = null;

    const pendingOutput: Uint8Array[] = [];
    let pendingOutputBytes = 0;
    const enqueueZipOutput = (chunk: Uint8Array): void => {
      for (let offset = 0; offset < chunk.byteLength; offset += EXPORT_STREAM_CHUNK_BYTES) {
        const piece = chunk.subarray(offset, Math.min(offset + EXPORT_STREAM_CHUNK_BYTES, chunk.byteLength));
        if (pendingOutputBytes + piece.length > EXPORT_STREAM_OUTPUT_QUEUE_BYTES) {
          zipError = new Error('export zip output queue exceeded');
          abort();
          return;
        }
        if (maxBytes !== undefined && BigInt(bytesStreamed + pendingOutputBytes + piece.length) > maxBytes) {
          zipError = new Error('export part would exceed its egress reservation');
          return;
        }
        pendingOutput.push(piece);
        pendingOutputBytes += piece.length;
      }
    };

    const drainZipOutput = async (): Promise<void> => {
      while (pendingOutput.length > 0) {
        await waitForCapacity();
        if (!ensureOpen()) return;
        const piece = pendingOutput.shift()!;
        pendingOutputBytes -= piece.length;
        bytesStreamed += piece.length;
        controller.enqueue(piece);
      }
    };

    const zip = new Zip((error, chunk) => {
      if (error) {
        zipError = error;
        return;
      }
      if (canceled || zipError || !chunk || chunk.length === 0) return;
      enqueueZipOutput(chunk);
    });

    const ensureOpen = (): boolean => {
      if (!canceled) return true;
      if (terminalError) throw terminalError;
      return false;
    };

    async function waitForCapacity(): Promise<void> {
      await waitForExportCapacity(
        () => controller.desiredSize,
        () => canceled,
        backpressureTimeoutMs,
        () => {
          activeRequestController?.abort();
          void activeObjectReader?.cancel();
        },
      );
    }

    try {
      for (const entry of entries) {
        if (!ensureOpen()) return;

        const requestController = new AbortController();
        activeRequestController = requestController;
        const opened = await reader(entry.url, requestController.signal);
        activeRequestController = null;
        if (!ensureOpen()) {
          if (opened.ok) await opened.body.cancel();
          return;
        }
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
        activeObjectReader = objectReader;
        try {
          for (;;) {
            if (!ensureOpen()) return;
            await waitForCapacity();
            const { done, value } = await objectReader.read();
            if (done) break;
            if (!value || value.length === 0) continue;
            hash.update(value);
            // fflate invokes its output callback synchronously. Slice provider
            // chunks before each push so one arbitrary body read cannot enqueue
            // an unbounded response chunk or bypass backpressure.
            for (let offset = 0; offset < value.byteLength; offset += EXPORT_STREAM_CHUNK_BYTES) {
              await waitForCapacity();
              zipEntry.push(
                value.subarray(offset, Math.min(offset + EXPORT_STREAM_CHUNK_BYTES, value.byteLength)),
                false,
              );
              if (zipError) throw zipError;
              await drainZipOutput();
            }
          }
        } finally {
          activeObjectReader = null;
          await objectReader.cancel().catch(() => undefined);
          objectReader.releaseLock();
        }

        await waitForCapacity();
        zipEntry.push(new Uint8Array(0), true);
        if (zipError) throw zipError;
        await drainZipOutput();

        if (hash.digest('hex') !== entry.sha256) {
          failures.push({
            assetId: entry.assetId,
            archivePath: entry.archivePath,
            reason: 'checksum_mismatch',
          });
        }
      }

      // Finalization is bounded by the admitted entry count and fixed zip
      // metadata; gate it so a stalled client fails before fflate flushes.
      await waitForCapacity();
      zip.end();
      if (zipError) throw zipError;
      await drainZipOutput();
      if (!ensureOpen()) return;

      if (onComplete) {
        await onComplete({ failures, bytesStreamed });
      }
      if (!ensureOpen()) return;
      controller.close();
    } catch (error) {
      if (!clientCanceled) {
        controller.error(error);
      }
    } finally {
      onFinish?.();
      signal?.removeEventListener('abort', abort);
    }
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
      void run(controller);
    },
    async cancel() {
      clientCanceled = true;
      abort();
      await activeObjectReader?.cancel().catch(() => undefined);
    },
  });
}
