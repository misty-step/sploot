import sharp from 'sharp';

/**
 * Maximum dimensions for the main image
 * Images larger than this will be resized (longest edge)
 */
export const MAX_IMAGE_DIMENSION = 2048;

/**
 * Thumbnail dimensions for grid view
 * Square thumbnails for consistent grid layout
 */
export const THUMBNAIL_SIZE = 256;

/**
 * Quality settings for processed images
 */
export const IMAGE_QUALITY = {
  jpeg: 85,
  webp: 85,
  png: 90,
};

export interface ProcessedImage {
  buffer: Buffer;
  format: string;
  width: number;
  height: number;
  size: number;
}

export interface ImageProcessingResult {
  main: ProcessedImage;
  thumbnail: ProcessedImage;
}

/**
 * Process an uploaded image to create optimized versions.
 * Generates:
 * 1. Main image (resized if > 2048px)
 * 2. Thumbnail (256x256 square for grid view)
 *
 * @param buffer - Raw image buffer
 * @param mimeType - Original file mime type
 * @returns Processed image buffers and metadata
 */
export async function processUploadedImage(
  buffer: Buffer,
  mimeType: string
): Promise<ImageProcessingResult> {
  // Get original image metadata
  const metadata = await sharp(buffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read image dimensions');
  }

  const originalWidth = metadata.width;
  const originalHeight = metadata.height;

  // Determine output format based on input
  let outputFormat: 'jpeg' | 'webp' | 'png' = 'jpeg';
  if (mimeType === 'image/webp') {
    outputFormat = 'webp';
  } else if (mimeType === 'image/png') {
    outputFormat = 'png';
  }

  // Process main image (resize if needed)
  const mainImageBuffer = await processMainImage(
    buffer,
    originalWidth,
    originalHeight,
    outputFormat
  );

  // Get processed main image metadata
  const mainMetadata = await sharp(mainImageBuffer).metadata();

  // Generate thumbnail (always square)
  const thumbnailBuffer = await generateThumbnail(buffer, outputFormat);

  return {
    main: {
      buffer: mainImageBuffer,
      format: outputFormat,
      width: mainMetadata.width!,
      height: mainMetadata.height!,
      size: mainImageBuffer.length,
    },
    thumbnail: {
      buffer: thumbnailBuffer,
      format: outputFormat,
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE,
      size: thumbnailBuffer.length,
    },
  };
}

/**
 * Process the main image, resizing if necessary.
 * Preserves aspect ratio when resizing.
 */
async function processMainImage(
  buffer: Buffer,
  width: number,
  height: number,
  format: 'jpeg' | 'webp' | 'png'
): Promise<Buffer> {
  const longestEdge = Math.max(width, height);

  let sharpInstance = sharp(buffer);

  // Only resize if image is larger than max dimension
  if (longestEdge > MAX_IMAGE_DIMENSION) {
    if (width > height) {
      // Landscape: limit width
      sharpInstance = sharpInstance.resize(MAX_IMAGE_DIMENSION, null, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    } else {
      // Portrait or square: limit height
      sharpInstance = sharpInstance.resize(null, MAX_IMAGE_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
  }

  // Apply format-specific optimizations
  switch (format) {
    case 'jpeg':
      return sharpInstance
        .jpeg({ quality: IMAGE_QUALITY.jpeg, progressive: true })
        .toBuffer();
    case 'webp':
      return sharpInstance
        .webp({ quality: IMAGE_QUALITY.webp })
        .toBuffer();
    case 'png':
      return sharpInstance
        .png({ quality: IMAGE_QUALITY.png, compressionLevel: 9 })
        .toBuffer();
  }
}

/**
 * Generate a square thumbnail for grid view.
 * Uses smart cropping to focus on the center of the image.
 */
async function generateThumbnail(
  buffer: Buffer,
  format: 'jpeg' | 'webp' | 'png'
): Promise<Buffer> {
  let sharpInstance = sharp(buffer)
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
      fit: 'cover',
      position: 'centre',
    });

  // Apply format-specific optimizations
  switch (format) {
    case 'jpeg':
      return sharpInstance
        .jpeg({ quality: IMAGE_QUALITY.jpeg, progressive: true })
        .toBuffer();
    case 'webp':
      return sharpInstance
        .webp({ quality: IMAGE_QUALITY.webp })
        .toBuffer();
    case 'png':
      return sharpInstance
        .png({ quality: IMAGE_QUALITY.png, compressionLevel: 9 })
        .toBuffer();
  }
}

/**
 * Extract image metadata without processing the image.
 * Useful for validation before processing.
 */
export async function getImageMetadata(buffer: Buffer) {
  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    size: buffer.length,
    hasAlpha: metadata.hasAlpha,
    orientation: metadata.orientation,
  };
}

/**
 * Validate if buffer contains a valid image.
 */
export async function isValidImage(buffer: Buffer): Promise<boolean> {
  try {
    const metadata = await sharp(buffer).metadata();
    return !!(metadata.width && metadata.height && metadata.format);
  } catch {
    return false;
  }
}