'use client';

import { useState } from 'react';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from '@/lib/blob';
import { info, error as logError } from '@/lib/logger';

export function UploadTest() {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setError('Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError('File too large. Maximum size is 10MB.');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // Step 1: Get upload URL from our API
      const response = await fetch('/api/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          size: file.size,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get upload URL');
      }

      const uploadConfig = await response.json();

      // In production, Step 2 would be: Upload file directly to blob storage
      // const uploadResponse = await fetch(uploadConfig.uploadUrl, {
      //   method: uploadConfig.method,
      //   headers: uploadConfig.headers,
      //   body: file,
      // });

      // For now, we just show the upload configuration
      setUploadResult(uploadConfig);
      info('Upload configuration:', uploadConfig);

    } catch (err) {
      logError('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-gray-800/50 p-6 border border-gray-700">
      <h3 className="text-xl font-semibold mb-4 text-violet-400">
        Blob Storage Test
      </h3>

      <div className="space-y-4">
        <div>
          <label htmlFor="file-upload" className="block text-sm font-medium text-gray-300 mb-2">
            Choose an image file (JPEG, PNG, WebP, or GIF)
          </label>
          <input
            id="file-upload"
            type="file"
            accept={ALLOWED_FILE_TYPES.join(',')}
            onChange={handleFileChange}
            disabled={uploading}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file: file:border-0 file:text-sm file:font-semibold file:bg-violet-600 file:text-white hover:file:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {uploading && (
          <div className="text-gray-400">
            <span className="inline-block animate-spin mr-2">⏳</span>
            Generating upload URL...
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-800 p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {uploadResult && (
          <div className="bg-green-900/20 border border-green-800 p-3">
            <p className="text-green-400 text-sm font-semibold mb-2">
              ✅ Upload URL Generated Successfully!
            </p>
            <div className="text-xs text-gray-400 font-mono">
              <p>Pathname: {uploadResult.pathname}</p>
              <p>Method: {uploadResult.method}</p>
              <p className="truncate">URL: {uploadResult.uploadUrl}</p>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Note: Actual upload requires Vercel Blob token configuration
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 text-xs text-gray-500">
        <p>Accepted formats: JPEG, PNG, WebP, GIF</p>
        <p>Maximum file size: 10MB</p>
      </div>
    </div>
  );
}