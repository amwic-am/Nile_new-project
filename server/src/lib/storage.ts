import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { AppError } from './errors.js';
import { logger } from './logger.js';

export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

export type StoredImage = {
  url: string;
  filename: string;
  backend: 'supabase' | 'local';
};

export function usesSupabaseStorage(): boolean {
  return Boolean(config.supabase.url && config.supabase.serviceRoleKey);
}

export function hasValidImageSignature(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 12) return false;
  if (mime === 'image/png') {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mime === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/gif') {
    const header = buffer.subarray(0, 6).toString('ascii');
    return header === 'GIF87a' || header === 'GIF89a';
  }
  if (mime === 'image/webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (mime === 'image/avif') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp' && (brand === 'avif' || brand === 'avis');
  }
  return false;
}

async function storeInSupabase(buffer: Buffer, mime: string, filename: string): Promise<string> {
  const bucket = config.supabase.storageBucket;
  const endpoint = `${config.supabase.url}/storage/v1/object/${encodeURIComponent(bucket)}/${filename}`;
  const key = config.supabase.serviceRoleKey;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': mime,
        'cache-control': 'public, max-age=31536000, immutable',
        'x-upsert': 'false',
      },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    logger.error('Supabase Storage upload failed', { error: String(error), bucket });
    throw new AppError(502, 'storage_unavailable', 'The image could not be stored right now. Try again.');
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    logger.error('Supabase Storage rejected an upload', {
      status: response.status,
      bucket,
      detail,
    });
    throw new AppError(502, 'storage_failed', 'The image could not be stored right now. Try again.');
  }

  return `${config.supabase.url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${filename}`;
}

async function storeOnDisk(buffer: Buffer, filename: string): Promise<string> {
  await fs.promises.mkdir(config.uploadsDir, { recursive: true });
  await fs.promises.writeFile(path.join(config.uploadsDir, filename), buffer);
  return `/uploads/${filename}`;
}

export async function storeImage(buffer: Buffer, mime: string): Promise<StoredImage> {
  const extension = IMAGE_EXTENSIONS[mime];
  if (!extension) {
    throw new AppError(422, 'unsupported_file', 'Upload a PNG, JPEG, WebP, AVIF or GIF image.');
  }
  if (!hasValidImageSignature(buffer, mime)) {
    throw new AppError(422, 'invalid_image', 'That file is not a valid image.');
  }

  const filename = `${randomUUID()}.${extension}`;
  if (usesSupabaseStorage()) {
    return {
      url: await storeInSupabase(buffer, mime, filename),
      filename,
      backend: 'supabase',
    };
  }
  return {
    url: await storeOnDisk(buffer, filename),
    filename,
    backend: 'local',
  };
}
