import type { Env } from '../types';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export interface ValidatedImage {
  mimeType: string;
  extension: string;
}

/** Validate uploaded image file size and MIME type */
export function validateImage(file: File): ValidatedImage | { error: string } {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: 'Invalid file type. Allowed: JPEG, PNG, WebP' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: 'File too large. Maximum size is 5 MB' };
  }

  return { mimeType: file.type, extension: mimeToExtension(file.type) };
}

/** Store image in R2 and return the object key */
export async function storeImage(
  bucket: R2Bucket,
  userId: string,
  analysisId: string,
  bytes: ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const extension = mimeToExtension(mimeType);
  const key = `uploads/${userId}/${analysisId}.${extension}`;

  await bucket.put(key, bytes, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { userId, analysisId },
  });

  return key;
}

/** Retrieve image from R2 by key */
export async function getImage(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}

/** Delete image from R2 */
export async function deleteImage(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}

/** Store camera snapshot/reference frame in R2 */
export async function storeCameraSnapshot(
  bucket: R2Bucket,
  userId: string,
  cameraId: string,
  bytes: ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const extension = mimeToExtension(mimeType);
  const key = `cameras/${userId}/${cameraId}.${extension}`;

  await bucket.put(key, bytes, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { userId, cameraId },
  });

  return key;
}

/** Convert ArrayBuffer to base64 string for OpenRouter */
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function mimeToExtension(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE };
