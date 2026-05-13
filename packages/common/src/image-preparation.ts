import { UPLOAD, isValidMimeType } from './constants';

export interface PreparedImage {
  file: File;
  originalSize: number;
  compressed: boolean;
}

interface PrepareImageOptions {
  targetSize?: number;
  maxDimension?: number;
  initialQuality?: number;
  minimumQuality?: number;
}

const COMPRESSIBLE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export function isCompressibleImageType(mimeType: string): boolean {
  return COMPRESSIBLE_TYPES.has(mimeType.toLowerCase().split(';')[0].trim());
}

export function shouldPrepareImage(file: Blob): boolean {
  return file.size > UPLOAD.compressionTargetSize && isCompressibleImageType(file.type);
}

export async function prepareImageForUpload(
  file: File,
  options: PrepareImageOptions = {}
): Promise<PreparedImage> {
  const targetSize = options.targetSize ?? UPLOAD.compressionTargetSize;

  if (file.size <= targetSize || !isCompressibleImageType(file.type)) {
    return {
      file,
      originalSize: file.size,
      compressed: false,
    };
  }

  const compressed = await compressStaticImage(file, {
    targetSize,
    maxDimension: options.maxDimension ?? UPLOAD.maxImageDimension,
    initialQuality: options.initialQuality ?? UPLOAD.compressionQuality,
    minimumQuality: options.minimumQuality ?? UPLOAD.minimumCompressionQuality,
  });

  if (!compressed || compressed.size >= file.size) {
    return {
      file,
      originalSize: file.size,
      compressed: false,
    };
  }

  return {
    file: compressed,
    originalSize: file.size,
    compressed: true,
  };
}

async function compressStaticImage(
  file: File,
  options: Required<PrepareImageOptions>
): Promise<File | null> {
  if (!isValidMimeType(file.type) || typeof createImageBitmap === 'undefined') {
    return null;
  }

  const bitmap = await createImageBitmap(file);

  try {
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, options.maxDimension / longestEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    if (!context) {
      return null;
    }

    context.drawImage(bitmap, 0, 0, width, height);

    let quality = options.initialQuality;
    let blob = await canvasToBlob(canvas, 'image/webp', quality);

    while (blob.size > options.targetSize && quality > options.minimumQuality) {
      quality = Math.max(options.minimumQuality, quality - 0.08);
      blob = await canvasToBlob(canvas, 'image/webp', quality);
    }

    return new File([blob], replaceExtension(file.name, 'webp'), {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}

function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document === 'undefined') {
    throw new Error('Image compression requires a browser canvas');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Image compression failed')),
      type,
      quality
    );
  });
}

function replaceExtension(filename: string, extension: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return `${base || 'image'}.${extension}`;
}
