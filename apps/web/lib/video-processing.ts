import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import type { ProcessedImage } from '@/lib/image-processing';

const VIDEO_POSTER_TIMEOUT_MS = 10_000;

export async function extractVideoPoster(
  buffer: Buffer,
  mimeType: string
): Promise<ProcessedImage> {
  const ffmpeg = resolveFfmpegPath();
  const workdir = await mkdtemp(path.join(tmpdir(), 'sploot-video-'));
  const inputPath = path.join(workdir, `input.${videoExtensionForMime(mimeType)}`);
  const outputPath = path.join(workdir, 'poster.jpg');

  try {
    await writeFile(inputPath, buffer);
    await runFfmpeg(ffmpeg, [
      '-y',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      outputPath,
    ]);

    const poster = await readFile(outputPath);
    const metadata = await sharp(poster).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('unable to read poster dimensions');
    }

    return {
      buffer: poster,
      format: 'jpeg',
      width: metadata.width,
      height: metadata.height,
      size: poster.length,
    };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_BIN) {
    return process.env.FFMPEG_BIN;
  }

  if (ffmpeg.path && existsSync(ffmpeg.path)) {
    return ffmpeg.path;
  }

  return 'ffmpeg';
}

function runFfmpeg(binaryPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(binaryPath, args, { timeout: VIDEO_POSTER_TIMEOUT_MS }, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });

    child.on('error', reject);
  });
}

function videoExtensionForMime(mimeType: string): 'mp4' | 'webm' {
  return mimeType.toLowerCase().includes('webm') ? 'webm' : 'mp4';
}
