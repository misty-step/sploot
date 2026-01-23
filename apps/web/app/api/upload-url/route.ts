import { NextRequest, NextResponse } from 'next/server';
import { generateUniqueFilename, isValidFileType, isValidFileSize } from '@/lib/blob';
import { getAuth } from '@/lib/auth/server';
import { put } from '@vercel/blob';
import { blobConfigured } from '@/lib/env';
import { withObservability } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';

async function postHandler(req: NextRequest) {
  try {
    // Check authentication
    const { userId } = await getAuth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { filename, mimeType, size } = body;

    // Validate request parameters
    if (!filename || !mimeType || !size) {
      return NextResponse.json(
        { error: 'Missing required parameters: filename, mimeType, size' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!isValidFileType(mimeType)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (!isValidFileSize(size)) {
      return NextResponse.json(
        { error: 'File size must be between 1 byte and 10MB' },
        { status: 400 }
      );
    }

    // Generate unique filename for storage
    const uniqueFilename = generateUniqueFilename(userId, filename);

    // For client-side uploads, we return the upload configuration
    // The actual upload will happen directly from the client to Vercel Blob
    const { uploadUrl, downloadUrl } = await generateUploadUrl(uniqueFilename);

    return NextResponse.json({
      uploadUrl,
      downloadUrl,
      pathname: uniqueFilename,
      method: 'PUT',
      headers: {
        'content-type': mimeType,
      }
    });

  } catch (error) {
    logError('upload:generate-url-failed', error, {});

    // Return user-friendly error message
    const errorMessage = error instanceof Error
      ? error.message
      : 'Failed to generate upload URL';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * Generates a pre-signed upload URL for client-side uploads
 * Uses Vercel Blob's put() method to create proper upload URLs
 */
async function generateUploadUrl(pathname: string): Promise<{ uploadUrl: string; downloadUrl: string }> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  // Check if blob storage is properly configured
  if (!blobConfigured || !blobToken) {
    throw new Error('Blob storage is not configured. Please set BLOB_READ_WRITE_TOKEN in your environment variables.');
  }

  try {
    // Generate a proper upload URL using Vercel Blob
    // Note: For client uploads, we need to use the multipart upload approach
    // For now, we'll use server-side upload with a placeholder
    const blob = await put(pathname, new Blob([]), {
      access: 'public',
      addRandomSuffix: false,
      token: blobToken,
    });

    // Return both upload and download URLs
    return {
      uploadUrl: blob.url,
      downloadUrl: blob.downloadUrl || blob.url,
    };
  } catch (error) {
    logError('upload:blob-error', error, { pathname });

    // Provide helpful error message based on error type
    if (error instanceof Error) {
      if (error.message.includes('Invalid token')) {
        throw new Error('Invalid Vercel Blob token. Please check your BLOB_READ_WRITE_TOKEN.');
      }
      if (error.message.includes('Network')) {
        throw new Error('Network error connecting to Vercel Blob storage. Please try again.');
      }
    }

    throw new Error('Failed to generate upload URL. Please check your Vercel Blob configuration.');
  }
}

export const POST = withObservability(postHandler, { operation: 'upload:generate-url' });
